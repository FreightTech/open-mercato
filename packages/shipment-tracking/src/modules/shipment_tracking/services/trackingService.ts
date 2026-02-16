import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Shipment, TrackingJob, CargoEvent, CarrierConfig } from '../data/entities'
import type { TrackingReferenceType } from '../data/entities'
import type { CarrierRegistryService } from './carrierRegistry'
import type { WebhookService } from './webhookService'
import type { CacheService } from '../lib/rate-limiter'
import { checkRateLimit } from '../lib/rate-limiter'
import { deriveShipmentStatus } from '../lib/status-machine'
import { extractShipmentTimes } from '../lib/time-extraction'
import { generatePollSchedule, getNextPollDate } from '../lib/schedule-generator'
import type { CarrierFetchedEvent } from '../lib/carrier-adapter'

type TrackingServiceDeps = {
  em: () => EntityManager
  eventBus: EventBus
  carrierRegistry: CarrierRegistryService
  cacheService: CacheService
  webhookService: WebhookService
}

export class TrackingService {
  private deps: TrackingServiceDeps

  constructor(deps: TrackingServiceDeps) {
    this.deps = deps
  }

  /**
   * Creates a tracking job for a shipment and immediately polls the carrier,
   * then dispatches webhooks with full shipment data.
   *
   * This is the main entry point for new shipments - called in the background
   * after shipment creation to avoid blocking the API response.
   */
  async createJobAndPollWithWebhook(shipmentId: string): Promise<{
    trackingJobId: string | null
    newEvents: number
    webhooksSent: number
  }> {
    const em = this.deps.em()

    const shipment = await em.findOne(Shipment, { id: shipmentId, deletedAt: null })
    if (!shipment) {
      console.warn('[shipment-tracking] Shipment not found for tracking:', shipmentId)
      return { trackingJobId: null, newEvents: 0, webhooksSent: 0 }
    }

    // Check if we can create a tracking job
    if (!shipment.carrierCode) {
      console.debug('[shipment-tracking] No carrier code, skipping tracking job:', shipmentId)
      // Still send shipment.created webhook even without tracking
      const webhooksSent = await this.dispatchShipmentWebhook(shipment, 'shipment_tracking.shipment.created')
      return { trackingJobId: null, newEvents: 0, webhooksSent }
    }

    const carrierName = shipment.carrierCode.toLowerCase()

    if (!this.deps.carrierRegistry.has(carrierName)) {
      console.warn('[shipment-tracking] Unknown carrier, skipping tracking:', carrierName)
      // Still send shipment.created webhook
      const webhooksSent = await this.dispatchShipmentWebhook(shipment, 'shipment_tracking.shipment.created')
      return { trackingJobId: null, newEvents: 0, webhooksSent }
    }

    const ref = this.determineReference(shipment)
    if (!ref) {
      console.debug('[shipment-tracking] No tracking reference (container/booking/bol), skipping:', shipmentId)
      // Still send shipment.created webhook
      const webhooksSent = await this.dispatchShipmentWebhook(shipment, 'shipment_tracking.shipment.created')
      return { trackingJobId: null, newEvents: 0, webhooksSent }
    }

    // Check for existing job
    const existingJob = await em.findOne(TrackingJob, {
      shipment: { id: shipment.id },
      carrierName,
      referenceType: ref.type,
      referenceValue: ref.value,
      status: { $in: ['active', 'paused'] },
    })

    if (existingJob) {
      console.debug('[shipment-tracking] TrackingJob already exists:', existingJob.id)
      // Poll the existing job and send webhook
      const pollResult = await this.pollShipment(existingJob.id)
      const webhooksSent = await this.dispatchShipmentWebhook(shipment, 'shipment_tracking.shipment.created')
      return { trackingJobId: existingJob.id, newEvents: pollResult.newEvents, webhooksSent }
    }

    // Create new tracking job
    const schedule = generatePollSchedule({
      etd: shipment.etd,
      eta: shipment.eta,
      atd: shipment.atd,
      ata: shipment.ata,
    })

    const nextPollAt = getNextPollDate(schedule)

    const trackingJob = em.create(TrackingJob, {
      organizationId: shipment.organizationId,
      tenantId: shipment.tenantId,
      shipment,
      carrierName,
      referenceType: ref.type,
      referenceValue: ref.value,
      status: 'active',
      schedule,
      nextPollAt,
    })

    em.persist(trackingJob)
    await em.flush()

    console.log('[shipment-tracking] Created TrackingJob:', {
      jobId: trackingJob.id,
      shipmentId: shipment.id,
      carrier: carrierName,
      ref: `${ref.type}:${ref.value}`,
    })

    // Emit tracking job created event (for audit/workflows)
    await this.deps.eventBus.emit('shipment_tracking.tracking_job.created', {
      id: trackingJob.id,
      shipmentId: shipment.id,
      carrierName,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })

    // Poll immediately
    let newEvents = 0
    try {
      const pollResult = await this.pollShipment(trackingJob.id)
      newEvents = pollResult.newEvents
    } catch (error) {
      // Log error but continue - we still want to send the webhook
      console.error('[shipment-tracking] Initial poll failed:', error)

      // Emit poll failed event for monitoring
      await this.deps.eventBus.emit('shipment_tracking.tracking_job.poll_failed', {
        id: trackingJob.id,
        shipmentId: shipment.id,
        carrierName,
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    // Dispatch webhook with full shipment data
    // Re-fetch shipment to get updated data after poll
    const updatedShipment = await em.findOne(Shipment, { id: shipmentId })
    const webhooksSent = await this.dispatchShipmentWebhook(
      updatedShipment ?? shipment,
      'shipment_tracking.shipment.created',
    )

    return { trackingJobId: trackingJob.id, newEvents, webhooksSent }
  }

  /**
   * Polls all active tracking jobs for a tenant/organization.
   * Called by the scheduler for daily re-polling.
   */
  async pollAllActiveJobs(
    tenantId: string,
    organizationId?: string,
  ): Promise<{ polled: number; newEvents: number; failed: number }> {
    const em = this.deps.em()

    const filter: Record<string, unknown> = {
      tenantId,
      status: 'active',
      deletedAt: null,
    }

    if (organizationId) {
      filter.organizationId = organizationId
    }

    const jobs = await em.find(TrackingJob, filter)

    let polled = 0
    let totalNewEvents = 0
    let failed = 0

    for (const job of jobs) {
      try {
        const result = await this.pollShipment(job.id)
        polled++
        totalNewEvents += result.newEvents

        // If there were new events, dispatch tracking_update webhook
        if (result.newEvents > 0) {
          const shipment = await em.findOne(Shipment, { id: job.shipment.id })
          if (shipment) {
            await this.dispatchShipmentWebhook(shipment, 'shipment_tracking.shipment.tracking_update')
          }
        }
      } catch (error) {
        failed++
        console.error(`[shipment-tracking] Poll failed for job ${job.id}:`, error)

        // Emit poll failed event
        await this.deps.eventBus.emit('shipment_tracking.tracking_job.poll_failed', {
          id: job.id,
          shipmentId: job.shipment.id,
          carrierName: job.carrierName,
          error: error instanceof Error ? error.message : 'Unknown error',
          tenantId: job.tenantId,
          organizationId: job.organizationId,
        })
      }
    }

    console.log('[shipment-tracking] Poll all completed:', { polled, totalNewEvents, failed })

    return { polled, newEvents: totalNewEvents, failed }
  }

  /**
   * Polls a single tracking job: fetches events from the carrier,
   * persists new events, updates shipment status/times, and emits events.
   */
  async pollShipment(jobId: string): Promise<{ newEvents: number }> {
    const em = this.deps.em()
    const job = await em.findOne(TrackingJob, { id: jobId }, { populate: ['shipment'] })

    if (!job) {
      throw new Error(`TrackingJob not found: ${jobId}`)
    }

    if (job.status !== 'active') {
      return { newEvents: 0 }
    }

    const shipment = job.shipment

    // Resolve carrier adapter
    const adapter = this.deps.carrierRegistry.get(job.carrierName)
    if (!adapter) {
      await this.recordJobError(em, job, `No adapter registered for carrier: ${job.carrierName}`)
      return { newEvents: 0 }
    }

    // Load carrier config for rate limiting and auth
    const scope = { tenantId: shipment.tenantId, organizationId: shipment.organizationId }
    const carrierConfig = await findOneWithDecryption(
      em,
      CarrierConfig,
      {
        carrierName: job.carrierName,
        organizationId: shipment.organizationId,
        tenantId: shipment.tenantId,
        isActive: true,
      },
      undefined,
      scope,
    )

    // Check rate limit
    if (carrierConfig) {
      const limitResult = await checkRateLimit(
        this.deps.cacheService,
        shipment.tenantId,
        job.carrierName,
        carrierConfig.rateLimitRequests,
        carrierConfig.rateLimitWindowSeconds,
      )

      if (!limitResult.allowed) {
        console.debug(
          `[shipment-tracking] Rate limited for ${job.carrierName}, retry after ${limitResult.retryAfterSeconds}s`,
        )
        return { newEvents: 0 }
      }
    }

    // Fetch events from carrier
    let fetchedEvents: CarrierFetchedEvent[]
    try {
      const result = await adapter.fetchEvents({
        referenceType: job.referenceType,
        referenceValue: job.referenceValue,
        apiEndpoint: carrierConfig?.apiEndpoint,
        authConfig: carrierConfig?.authConfig,
      })
      fetchedEvents = result.events

      // Update shipment with any new reference numbers from carrier
      if (result.containerNumber && !shipment.containerNumber) {
        shipment.containerNumber = result.containerNumber
      }
      if (result.vesselName && !shipment.vesselName) {
        shipment.vesselName = result.vesselName
        shipment.vesselImo = result.vesselImo ?? shipment.vesselImo
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error'
      await this.recordJobError(em, job, message)
      return { newEvents: 0 }
    }

    // Persist new events (deduplicate by eventId)
    const existingEventIds = new Set(
      (
        await em.find(CargoEvent, {
          shipment,
          eventId: { $in: fetchedEvents.map((event) => event.eventId) },
        })
      ).map((event) => event.eventId),
    )

    const newEvents: CargoEvent[] = []
    for (const fetched of fetchedEvents) {
      if (existingEventIds.has(fetched.eventId)) continue

      const cargoEvent = em.create(CargoEvent, {
        organizationId: shipment.organizationId,
        tenantId: shipment.tenantId,
        shipment,
        eventId: fetched.eventId,
        eventType: fetched.eventType,
        eventCode: fetched.eventCode,
        eventClassification: fetched.eventClassification,
        eventDateTime: fetched.eventDateTime,
        eventDateTimeOffset: fetched.eventDateTimeOffset,
        description: fetched.description,
        locationName: fetched.locationName,
        locationUnlocode: fetched.locationUnlocode,
        locationCountry: fetched.locationCountry,
        vesselName: fetched.vesselName,
        vesselImo: fetched.vesselImo,
        voyageNumber: fetched.voyageNumber,
        rawData: fetched.rawData,
      })
      newEvents.push(cargoEvent)
    }

    if (newEvents.length === 0) {
      // Update poll tracking even if no new events
      job.lastPollAt = new Date()
      job.retryCount = 0
      await em.flush()
      return { newEvents: 0 }
    }

    // Update shipment event count
    shipment.eventCount = (shipment.eventCount || 0) + newEvents.length

    // Derive new status from all events
    const allEvents = await em.find(CargoEvent, { shipment }, { orderBy: { eventDateTime: 'asc' } })
    const context = {
      originUnlocode: shipment.originUnlocode,
      destinationUnlocode: shipment.destinationUnlocode,
    }

    const previousStatus = shipment.status
    const newStatus = deriveShipmentStatus(
      allEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassification: event.eventClassification,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
      shipment.status,
    )

    shipment.status = newStatus

    // Extract times
    const times = extractShipmentTimes(
      allEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassification: event.eventClassification,
        eventDateTime: event.eventDateTime,
        eventDateTimeOffset: event.eventDateTimeOffset,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
    )

    if (times.etd) {
      shipment.etd = times.etd
      shipment.etdOffset = times.etdOffset ?? null
    }
    if (times.eta) {
      shipment.eta = times.eta
      shipment.etaOffset = times.etaOffset ?? null
    }
    if (times.atd) {
      shipment.atd = times.atd
      shipment.atdOffset = times.atdOffset ?? null
    }
    if (times.ata) {
      shipment.ata = times.ata
      shipment.ataOffset = times.ataOffset ?? null
    }

    // Update job
    job.lastPollAt = new Date()
    job.retryCount = 0

    // If shipment delivered, deactivate job
    if (newStatus === 'DELIVERED') {
      job.status = 'deactivated'
    }

    await em.flush()

    // Emit events
    for (const cargoEvent of newEvents) {
      await this.deps.eventBus.emit('shipment_tracking.cargo_event.created', {
        id: cargoEvent.id,
        shipmentId: shipment.id,
        eventCode: cargoEvent.eventCode,
        eventType: cargoEvent.eventType,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    if (previousStatus !== newStatus) {
      await this.deps.eventBus.emit('shipment_tracking.shipment.status_changed', {
        id: shipment.id,
        previousStatus,
        newStatus,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    await this.deps.eventBus.emit('shipment_tracking.shipment.updated', {
      id: shipment.id,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })

    return { newEvents: newEvents.length }
  }

  /**
   * Dispatches webhook with full shipment data.
   */
  private async dispatchShipmentWebhook(
    shipment: Shipment,
    eventType: 'shipment_tracking.shipment.created' | 'shipment_tracking.shipment.tracking_update',
  ): Promise<number> {
    const payload = await this.deps.webhookService.buildFullShipmentPayload(shipment.id)
    if (!payload) {
      return 0
    }

    const result = await this.deps.webhookService.dispatchWithRetry({
      eventType,
      shipmentPayload: payload,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })

    return result.dispatched
  }

  /**
   * Determines the best tracking reference from a shipment.
   */
  private determineReference(
    shipment: Shipment,
  ): { type: TrackingReferenceType; value: string } | null {
    if (shipment.containerNumber) return { type: 'container', value: shipment.containerNumber }
    if (shipment.bookingNumber) return { type: 'booking', value: shipment.bookingNumber }
    if (shipment.bolNumber) return { type: 'bol', value: shipment.bolNumber }
    return null
  }

  private async recordJobError(
    em: EntityManager,
    job: TrackingJob,
    message: string,
  ): Promise<void> {
    const history = job.errorHistory ?? []
    history.push({ date: new Date().toISOString(), message })

    // Keep last 20 errors
    if (history.length > 20) {
      history.splice(0, history.length - 20)
    }

    job.errorHistory = history
    job.retryCount = (job.retryCount || 0) + 1
    job.lastPollAt = new Date()

    // Mark as failed after 10 consecutive errors
    if (job.retryCount >= 10) {
      job.status = 'failed'
      await em.flush()

      await this.deps.eventBus.emit('shipment_tracking.tracking_job.failed', {
        id: job.id,
        shipmentId: job.shipment.id,
        carrierName: job.carrierName,
        retryCount: job.retryCount,
        lastError: message,
        tenantId: job.tenantId,
        organizationId: job.organizationId,
      })
      return
    }

    await em.flush()
  }
}
