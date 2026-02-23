/**
 * POI NATS Subscriber Service
 *
 * Subscribes to POI proximity events from the AIS system via NATS JetStream
 * and processes them to create tracking events and notifications.
 */

import type { NatsConnection, JetStreamClient, JetStreamManager, Consumer, ConsumerMessages } from 'nats'
import { connect, JSONCodec, AckPolicy, DeliverPolicy, ReplayPolicy } from 'nats'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events'
import { loadPoiNatsConfig, validatePoiNatsConfig, isPoiNatsConfigured, type PoiNatsConfig } from '../lib/poi-nats-config'
import type { PoiProximityEvent } from '../lib/poi-types'
import { mapToOpenMercatoEventId } from '../lib/poi-event-processor'
import {
  processPoiEvent,
  isEventAlreadyProcessed,
  createTrackingEventFromPoi,
} from '../lib/poi-event-processor'
import { Shipment } from '../data/entities'

// ─── Types ───────────────────────────────────────────────────

type PoiNatsServiceDeps = {
  em: () => EntityManager
  eventBus: EventBus
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'draining' | 'closed'

export type PoiNatsServiceStats = {
  status: ConnectionStatus
  messagesReceived: number
  messagesProcessed: number
  eventsCreated: number
  errors: number
  lastMessageAt: Date | null
  connectedAt: Date | null
}

// ─── Service ─────────────────────────────────────────────────

export class PoiNatsService {
  private deps: PoiNatsServiceDeps
  private config: PoiNatsConfig
  private connection: NatsConnection | null = null
  private jetstream: JetStreamClient | null = null
  private consumer: Consumer | null = null
  private consumerMessages: ConsumerMessages | null = null
  private status: ConnectionStatus = 'disconnected'
  private stats: PoiNatsServiceStats = {
    status: 'disconnected',
    messagesReceived: 0,
    messagesProcessed: 0,
    eventsCreated: 0,
    errors: 0,
    lastMessageAt: null,
    connectedAt: null,
  }

  constructor(deps: PoiNatsServiceDeps) {
    this.deps = deps
    this.config = loadPoiNatsConfig()
  }

  /**
   * Get current service statistics.
   */
  getStats(): PoiNatsServiceStats {
    return { ...this.stats, status: this.status }
  }

  /**
   * Check if the service is connected.
   */
  isConnected(): boolean {
    return this.status === 'connected'
  }

  /**
   * Check if POI NATS integration is configured.
   */
  isConfigured(): boolean {
    return isPoiNatsConfigured()
  }

  /**
   * Start the NATS subscriber.
   */
  async start(): Promise<void> {
    if (!isPoiNatsConfigured()) {
      console.info('[poi-nats] POI_NATS_URL not configured, skipping POI event subscription')
      return
    }

    if (this.status === 'connected' || this.status === 'connecting') {
      console.warn('[poi-nats] Service is already started or connecting')
      return
    }

    try {
      validatePoiNatsConfig(this.config)
      this.status = 'connecting'

      console.info(`[poi-nats] Connecting to ${this.config.serverUrl}...`)

      this.connection = await connect({
        servers: this.config.serverUrl,
        name: this.config.connectionName,
        reconnect: true,
        maxReconnectAttempts: this.config.reconnect.maxAttempts,
        reconnectTimeWait: this.config.reconnect.initialDelayMs,
        reconnectJitter: this.config.reconnect.maxDelayMs - this.config.reconnect.initialDelayMs,
      })

      this.status = 'connected'
      this.stats.connectedAt = new Date()

      console.info(`[poi-nats] Connected to NATS server`)

      // Set up connection event handlers
      this.setupConnectionHandlers()

      // Subscribe to POI events
      await this.subscribe()

      console.info(`[poi-nats] Subscribed to ${this.config.subject}`)
    } catch (error) {
      this.status = 'disconnected'
      console.error('[poi-nats] Failed to connect:', error)
      throw error
    }
  }

  /**
   * Stop the NATS subscriber gracefully.
   */
  async stop(): Promise<void> {
    if (!this.connection) {
      return
    }

    this.status = 'draining'
    console.info('[poi-nats] Draining connection...')

    try {
      // Stop consuming messages first
      if (this.consumerMessages) {
        this.consumerMessages.stop()
        this.consumerMessages = null
      }

      this.consumer = null
      this.jetstream = null

      // Drain and close connection
      await this.connection.drain()
      this.connection = null
      this.status = 'closed'

      console.info('[poi-nats] Connection closed')
    } catch (error) {
      console.error('[poi-nats] Error during shutdown:', error)
      this.status = 'disconnected'
      throw error
    }
  }

  /**
   * Subscribe to POI proximity events via JetStream.
   *
   * Auto-creates the durable consumer if it doesn't exist.
   * Each instance gets a unique consumer name (based on JWT_SECRET hash)
   * so multiple self-hosted installations can each receive all messages.
   */
  private async subscribe(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NATS')
    }

    // Get JetStream manager for consumer management
    const jsm = await this.connection.jetstreamManager()

    // Ensure consumer exists (create if not)
    await this.ensureConsumer(jsm)

    // Get JetStream client for consuming
    this.jetstream = this.connection.jetstream()

    console.info(
      `[poi-nats] Binding to consumer "${this.config.consumerName}" on stream "${this.config.streamName}"...`
    )

    // Bind to the durable consumer
    this.consumer = await this.jetstream.consumers.get(
      this.config.streamName,
      this.config.consumerName
    )

    console.info(`[poi-nats] Consumer bound, starting to consume messages...`)

    // Start consuming messages
    this.consumerMessages = await this.consumer.consume()

    // Process messages asynchronously
    this.processMessages()
  }

  /**
   * Ensure the durable consumer exists on the stream.
   * Creates it if it doesn't exist with the appropriate configuration.
   */
  private async ensureConsumer(jsm: JetStreamManager): Promise<void> {
    const consumerConfig = {
      durable_name: this.config.consumerName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All, // Replay all messages from stream start
      replay_policy: ReplayPolicy.Instant, // Don't throttle replay
      filter_subject: this.config.subject,
      max_deliver: 5, // Prevent infinite redelivery of poison messages
    }

    try {
      // Check if consumer exists
      await jsm.consumers.info(this.config.streamName, this.config.consumerName)
      console.info(`[poi-nats] Consumer "${this.config.consumerName}" exists`)
    } catch (error: unknown) {
      // Consumer doesn't exist, create it
      const errorCode = (error as { code?: string })?.code
      if (errorCode === '404' || (error as { api_error?: { err_code?: number } })?.api_error?.err_code === 10014) {
        console.info(`[poi-nats] Creating consumer "${this.config.consumerName}"...`)
        await jsm.consumers.add(this.config.streamName, consumerConfig)
        console.info(`[poi-nats] Consumer "${this.config.consumerName}" created successfully`)
      } else {
        // Some other error, rethrow
        throw error
      }
    }
  }

  /**
   * Process incoming messages from the JetStream consumer.
   */
  private async processMessages(): Promise<void> {
    if (!this.consumerMessages) {
      return
    }

    const jsonCodec = JSONCodec<PoiProximityEvent>()

    for await (const msg of this.consumerMessages) {
      this.stats.messagesReceived++
      this.stats.lastMessageAt = new Date()

      try {
        const event = jsonCodec.decode(msg.data)
        
        // Validate required fields - skip malformed/test messages
        if (!event || !event.type || !event.mmsi) {
          console.debug('[poi-nats] Skipping invalid message (missing type or mmsi)')
          msg.ack() // Ack to prevent redelivery of bad messages
          continue
        }

        await this.handlePoiEvent(event)
        
        // Acknowledge successful processing
        msg.ack()
        this.stats.messagesProcessed++
      } catch (error) {
        this.stats.errors++
        console.error('[poi-nats] Error processing message:', error)
        
        // Negative acknowledge - message will be redelivered
        msg.nak()
      }
    }
  }

  /**
   * Handle a single POI proximity event.
   */
  private async handlePoiEvent(event: PoiProximityEvent): Promise<void> {
    console.debug(
      `[poi-nats] Received ${event.type} event for vessel ${event.shipName} (MMSI: ${event.mmsi})`
    )

    const em = this.deps.em()

    try {
      // Process the event and find matching shipments
      const processed = await processPoiEvent(em, event)

      if (!processed) {
        // No matching shipments found
        return
      }

      console.info(
        `[poi-nats] Matched ${processed.shipmentIds.length} shipment(s) for MMSI ${event.mmsi}`
      )

      // Process each matched shipment
      for (const shipmentId of processed.shipmentIds) {
        const shipment = await em.findOne(
          Shipment,
          { id: shipmentId },
          { populate: ['trackingJob'] }
        )

        if (!shipment?.trackingJob) {
          continue
        }

        // Check for duplicates
        const alreadyProcessed = await isEventAlreadyProcessed(
          em,
          shipment.trackingJob.id,
          processed.sourceEventId
        )

        if (alreadyProcessed) {
          console.debug(`[poi-nats] Event already processed: ${processed.sourceEventId}`)
          continue
        }

        // Create TrackingEvent record
        const trackingEvent = createTrackingEventFromPoi(processed, shipment.trackingJob)
        em.persist(trackingEvent)
        this.stats.eventsCreated++

        // Emit Open Mercato event for notifications/webhooks
        const eventId = mapToOpenMercatoEventId(event.type)
        await this.deps.eventBus.emit(eventId, {
          shipmentId: shipment.id,
          trackingEventId: trackingEvent.id,
          organizationId: shipment.organizationId,
          tenantId: shipment.tenantId,
          vesselName: event.shipName,
          vesselMmsi: event.mmsi,
          vesselImo: processed.vesselImo,
          eventType: event.type,
          poiCode: processed.poiCode,
          latitude: event.lat,
          longitude: event.lng,
          eventDateTime: processed.eventDateTime.toISOString(),
          distanceToPoiMeters: event.distanceToPoiMeters,
        })

        console.info(
          `[poi-nats] Created tracking event for shipment ${shipmentId}: ${event.type}`
        )
      }

      await em.flush()
    } catch (error) {
      console.error('[poi-nats] Error handling POI event:', error)
      throw error
    }
  }

  /**
   * Set up connection event handlers.
   */
  private setupConnectionHandlers(): void {
    if (!this.connection) {
      return
    }

    // Handle connection status changes
    ;(async () => {
      if (!this.connection) return

      for await (const status of this.connection.status()) {
        switch (status.type) {
          case 'disconnect':
            console.warn('[poi-nats] Disconnected from server')
            this.status = 'disconnected'
            break
          case 'reconnect':
            console.info('[poi-nats] Reconnected to server')
            this.status = 'connected'
            break
          case 'reconnecting':
            console.info('[poi-nats] Reconnecting...')
            this.status = 'connecting'
            break
          case 'error':
            console.error('[poi-nats] Connection error:', status.data)
            break
        }
      }
    })()
  }
}
