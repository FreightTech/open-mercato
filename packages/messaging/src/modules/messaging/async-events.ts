/**
 * Async Event Consumer for External Event Processing
 *
 * IMPORTANT: This is for EVENT PROCESSING ONLY, not commands.
 * Commands use reply handlers (see reply-handlers.ts) on inbound.* subjects.
 *
 * Uses NATS JetStream's pull consumer for concurrent event processing
 * with configurable worker pools, graceful shutdown, and back-pressure handling.
 *
 * This consumer is ENABLED by default for async event processing
 * (e.g., background notifications, data sync to external systems).
 *
 * Subject Pattern:
 * - Subscribes to: events.*.> (all tenant-prefixed events)
 * - Example: events.tenant-a.customers.people.created, events.tenant-b.sales.order.created
 * - External systems (n8n, Zapier) should publish to: events.{tenantID}.{event_subject}
 *
 * Loop Prevention:
 * - Open Mercato adds x-source: open-mercato header to all outbound messages
 * - Consumer skips messages with this header to prevent infinite loops
 * - External systems should NOT set this header
 *
 * Key features:
 * - JetStream pull consumer with explicit ack/nack
 * - Configurable worker pool for concurrent processing
 * - Graceful shutdown with drain timeout
 * - Built-in back-pressure (only fetch when ready)
 * - Automatic retry with configurable max attempts
 * - Tenant isolation via subject prefixing
 * - Events only (no command routing)
 *
 * Configuration:
 * - MESSAGING_ASYNC_CONSUMER_ENABLED: Enable this consumer (default: true)
 * - MESSAGING_ASYNC_CONCURRENCY: Number of concurrent workers (default: 1)
 * - MESSAGING_ASYNC_ACK_WAIT_MS: Ack timeout before redelivery (default: 30000)
 * - MESSAGING_ASYNC_MAX_RETRIES: Max retry attempts (default: 3)
 * - MESSAGING_ASYNC_DRAIN_TIMEOUT_MS: Shutdown drain timeout (default: 10000)
 */

import type { EventBus } from '@open-mercato/events'
import type { NatsDriverExtended } from '../../drivers/nats'
import type {
  AsyncInboundConsumer,
  AsyncInboundConsumerOptions,
  AsyncInboundConfig,
  InboundStats,
  WorkerState,
  MessageProcessingResult,
} from './inbound-types'
// Events-only consumer - no command routing needed
import { shouldProcessSubject } from './command-routing'

// JetStream types (extracted from nats module)
type JetStreamClient = NonNullable<ReturnType<NatsDriverExtended['getJetStream']>>
type JetStreamManager = NonNullable<ReturnType<NatsDriverExtended['getJetStreamManager']>>
type NatsConnection = NonNullable<ReturnType<NatsDriverExtended['getConnection']>>

/** Stream name for async event processing */
const STREAM_NAME = 'ASYNC_EVENTS'

/** Consumer name for async event processing */
const CONSUMER_NAME = 'async-events-processor'

/**
 * Helper to build a tenant-prefixed event subject for publishing from external systems.
 * External systems (n8n, Zapier) should publish to: events.{tenantID}.{event_subject}
 * 
 * @param tenantId - The tenant ID
 * @param eventSubject - The event subject (e.g., customers.people.created)
 * @returns The full NATS subject with events prefix and tenant ID
 * 
 * @example
 * buildTenantEventSubject('acme-corp', 'customers.people.created')
 * // => 'events.acme-corp.customers.people.created'
 */
export function buildTenantEventSubject(tenantId: string, eventSubject: string): string {
  return `events.${tenantId}.${eventSubject}`
}

/**
 * Strips the events prefix and tenant prefix from a NATS subject to get the internal event name.
 * This is the inverse of buildTenantEventSubject for inbound message processing.
 * 
 * @param natsSubject - The full NATS subject with events and tenant prefix
 * @returns The internal subject without prefixes
 * 
 * @example
 * stripEventsPrefixes('events.tenant-123.customers.people.created')
 * // => 'customers.people.created'
 * 
 * stripEventsPrefixes('events.acme-corp.sales.order.updated')
 * // => 'sales.order.updated'
 */
function stripEventsPrefixes(natsSubject: string): string {
  // Expected format: events.{tenantId}.{event_subject}
  // We need to strip "events." and "{tenantId}." to get just the event subject
  
  // Remove "events." prefix if present
  const withoutEvents = natsSubject.startsWith('events.')
    ? natsSubject.substring(7) // 'events.'.length = 7
    : natsSubject
  
  // Now strip the tenant ID (first segment after events.)
  const firstDot = withoutEvents.indexOf('.')
  if (firstDot === -1) {
    // No tenant ID separator, return as-is
    return withoutEvents
  }
  
  // Strip the tenant ID segment and return the event subject
  return withoutEvents.substring(firstDot + 1)
}

/**
 * Parse async inbound configuration from environment variables.
 */
export function parseAsyncInboundConfigFromEnv(): Partial<AsyncInboundConsumerOptions> {
  const concurrency = process.env.MESSAGING_INBOUND_CONCURRENCY
  const ackWaitMs = process.env.MESSAGING_INBOUND_ACK_WAIT_MS
  const maxRetries = process.env.MESSAGING_INBOUND_MAX_RETRIES
  const drainTimeoutMs = process.env.MESSAGING_INBOUND_DRAIN_TIMEOUT_MS

  return {
    concurrency: concurrency ? parseInt(concurrency, 10) : undefined,
    ackWaitMs: ackWaitMs ? parseInt(ackWaitMs, 10) : undefined,
    maxRetries: maxRetries ? parseInt(maxRetries, 10) : undefined,
    drainTimeoutMs: drainTimeoutMs ? parseInt(drainTimeoutMs, 10) : undefined,
  }
}

/**
 * Build full configuration with defaults.
 */
function buildConfig(
  eventBus: EventBus,
  options?: AsyncInboundConsumerOptions
): AsyncInboundConfig {
  const envConfig = parseAsyncInboundConfigFromEnv()

  return {
    concurrency: options?.concurrency ?? envConfig.concurrency ?? 1,
    ackWaitMs: options?.ackWaitMs ?? envConfig.ackWaitMs ?? 30000,
    maxRetries: options?.maxRetries ?? envConfig.maxRetries ?? 3,
    drainTimeoutMs: options?.drainTimeoutMs ?? envConfig.drainTimeoutMs ?? 10000,
    debug: options?.debug ?? process.env.MESSAGING_DEBUG === 'true',
    filter: options?.filter,
    // Events-only: no command routing
    commandBus: undefined,
    container: undefined,
    eventBus,
  }
}

/**
 * Convert milliseconds to nanoseconds for NATS JetStream.
 */
function nanos(ms: number): number {
  return ms * 1_000_000
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates an async inbound consumer using JetStream pull consumer.
 *
 * The async consumer provides concurrent message processing with configurable
 * worker pools. Unlike the sync consumer, it uses JetStream for durability
 * and explicit acknowledgment.
 *
 * @param driver - The NATS driver (must be connected with JetStream enabled)
 * @param eventBus - The local event bus to emit events to
 * @param options - Consumer options
 * @returns An AsyncInboundConsumer instance
 *
 * @example
 * ```typescript
 * const consumer = createAsyncInboundConsumer(driver, eventBus, {
 *   concurrency: 5,
 *   filter: { include: ['customers.>', 'sales.>'] },
 *   commandBus,
 *   container,
 * })
 * await consumer.start()
 *
 * // Check stats
 * const stats = consumer.getStats()
 * console.log(`Processed: ${stats.totalProcessed}, In-flight: ${stats.inFlight}`)
 *
 * // Graceful shutdown
 * await consumer.stop()
 * ```
 */
export function createAsyncInboundConsumer(
  driver: NatsDriverExtended,
  eventBus: EventBus,
  options?: AsyncInboundConsumerOptions
): AsyncInboundConsumer {
  const config = buildConfig(eventBus, options)

  // State
  let active = false
  let startedAt: Date | undefined
  let shouldStop = false

  // Worker state tracking
  const workers: WorkerState[] = []
  const workerPromises: Promise<void>[] = []

  // Stats
  let totalProcessed = 0
  let totalFailed = 0

  // JetStream consumer
  let consumerHandle: Awaited<ReturnType<JetStreamClient['consumers']['get']>> | null = null

  // Events-only: no router context needed anymore

  function log(...args: unknown[]): void {
    if (config.debug) console.log('[messaging:async-inbound]', ...args)
  }

  /**
   * Ensure the JetStream stream exists for inbound messages.
   */
  async function ensureStream(jsm: JetStreamManager): Promise<void> {
    const streamSubjects = buildStreamSubjects()

    try {
      // Try to get existing stream
      const stream = await jsm.streams.info(STREAM_NAME)
      log(`Stream ${STREAM_NAME} exists with ${stream.state.messages} messages`)

      // Update subjects if needed
      const currentSubjects = stream.config.subjects || []
      const needsUpdate = !streamSubjects.every((s) => currentSubjects.includes(s))

      if (needsUpdate) {
        log(`Updating stream subjects to: ${streamSubjects.join(', ')}`)
        await jsm.streams.update(STREAM_NAME, {
          ...stream.config,
          subjects: streamSubjects,
        })
      }
    } catch (error) {
      // Stream doesn't exist, create it
      log(`Creating stream ${STREAM_NAME} with subjects: ${streamSubjects.join(', ')}`)

      const nats = await import('nats')

      await jsm.streams.add({
        name: STREAM_NAME,
        subjects: streamSubjects,
        retention: nats.RetentionPolicy.Workqueue, // Remove after ack
        storage: nats.StorageType.File,
        max_age: nanos(24 * 60 * 60 * 1000), // 24 hours
        discard: nats.DiscardPolicy.Old,
      })

      log(`Stream ${STREAM_NAME} created`)
    }
  }

  /**
   * Build stream subjects - listens to tenant-prefixed event messages.
   * 
   * Subject pattern: events.{tenantID}.>
   * 
   * This prefix ensures we don't overlap with NATS system subjects ($JS.*, $SYS.*, etc.)
   * and provides clear separation between events and commands.
   * 
   * Examples of matched subjects:
   * - events.acme-corp.customers.people.created
   * - events.tenant-123.sales.order.updated
   * - events.org-xyz.catalog.product.deleted
   * 
   * Examples of excluded subjects:
   * - $JS.* (JetStream API)
   * - $SYS.* (NATS system messages)
   * - _INBOX.* (reply subjects)
   * - inbound.* (commands - handled by reply handlers)
   */
  function buildStreamSubjects(): string[] {
    return ['events.*.>']
  }

  /**
   * Ensure the durable consumer exists.
   */
  async function ensureConsumer(jsm: JetStreamManager): Promise<void> {
    const nats = await import('nats')

    const consumerConfig = {
      durable_name: CONSUMER_NAME,
      ack_policy: nats.AckPolicy.Explicit,
      max_ack_pending: config.concurrency * 10,
      ack_wait: nanos(config.ackWaitMs),
      max_deliver: config.maxRetries + 1,
      filter_subjects: buildStreamSubjects(),
    }

    try {
      // Try to get existing consumer
      await jsm.consumers.info(STREAM_NAME, CONSUMER_NAME)
      log(`Consumer ${CONSUMER_NAME} exists`)

      // Update consumer config
      await jsm.consumers.update(STREAM_NAME, CONSUMER_NAME, consumerConfig)
      log(`Consumer ${CONSUMER_NAME} updated`)
    } catch {
      // Consumer doesn't exist, create it
      log(`Creating consumer ${CONSUMER_NAME}`)
      await jsm.consumers.add(STREAM_NAME, consumerConfig)
      log(`Consumer ${CONSUMER_NAME} created`)
    }
  }

  /**
   * Initialize a worker.
   */
  function initWorker(id: number): WorkerState {
    return {
      id,
      busy: false,
      messagesProcessed: 0,
      errorsEncountered: 0,
    }
  }

  /**
   * Check if a message originated from this app (has our source header).
   * Used to prevent processing our own events and creating infinite loops.
   */
  function isOwnMessage(headers?: Record<string, string[]>): boolean {
    if (!headers) return false
    const source = headers['x-source']
    return source?.includes('open-mercato') ?? false
  }

  /**
   * Process a single message.
   */
  async function processMessage(
    workerId: number,
    msg: { 
      subject: string
      data: Uint8Array
      headers?: Record<string, string[]>
      info: { redeliveryCount: number; streamSequence: number }
    },
    ack: () => void,
    nak: (delay?: number) => void,
    term: () => void,
    working: () => void
  ): Promise<MessageProcessingResult> {
    const startTime = Date.now()
    const worker = workers[workerId]

    // Strip events and tenant prefixes from NATS subject to get internal event name
    // NATS: "events.tenant-123.customers.people.created"
    // Internal: "customers.people.created"
    const subject = stripEventsPrefixes(msg.subject)

    // Skip messages that originated from this app (prevent loops)
    // Open Mercato adds x-source: open-mercato header to all outbound messages
    if (isOwnMessage(msg.headers)) {
      log(`Worker ${workerId}: Skipping own message on ${subject}`)
      ack()
      return { success: true, routedAs: 'event', durationMs: Date.now() - startTime }
    }

    // Update worker state
    worker.busy = true
    worker.currentMessage = {
      subject,
      sequence: msg.info.streamSequence,
      startedAt: new Date(),
    }

    try {
      // Parse payload
      const payload = JSON.parse(new TextDecoder().decode(msg.data))

      // Check exclude filter
      if (!shouldProcessSubject(subject, { exclude: config.filter?.exclude })) {
        log(`Worker ${workerId}: Skipping excluded event: ${subject}`)
        ack()
        return { success: true, routedAs: 'event', durationMs: Date.now() - startTime }
      }

      log(`Worker ${workerId}: Processing message: ${subject} (seq: ${msg.info.streamSequence})`)

      // Extend ack deadline while processing
      working()

      // Emit event directly (events-only, no command routing)
      try {
        await config.eventBus.emit(subject, payload)
        ack()
        worker.messagesProcessed++
        totalProcessed++
        log(`Worker ${workerId}: Event processed successfully: ${subject}`)
        return {
          success: true,
          routedAs: 'event',
          durationMs: Date.now() - startTime,
        }
      } catch (error) {
        const emitError = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to emit event: ${emitError}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      worker.errorsEncountered++
      totalFailed++

      console.error(`[messaging:async-inbound] Worker ${workerId}: Error processing ${subject}:`, error)

      // Check if we should retry or terminate
      if (msg.info.redeliveryCount >= config.maxRetries) {
        log(`Worker ${workerId}: Max retries reached for ${subject}, terminating`)
        term()
      } else {
        log(`Worker ${workerId}: Requeuing ${subject} for retry (attempt ${msg.info.redeliveryCount + 1}/${config.maxRetries})`)
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.pow(2, msg.info.redeliveryCount) * 1000
        nak(delay)
      }

      return {
        success: false,
        routedAs: 'event', // We don't know if it was a command since it failed
        durationMs: Date.now() - startTime,
        error: errorMsg,
      }
    } finally {
      worker.busy = false
      worker.currentMessage = undefined
    }
  }

  /**
   * Worker loop that fetches and processes messages.
   */
  async function workerLoop(workerId: number): Promise<void> {
    log(`Worker ${workerId}: Starting`)

    while (!shouldStop && consumerHandle) {
      try {
        // Fetch a batch of messages (just 1 for now to keep it simple)
        const messages = await consumerHandle.fetch({
          max_messages: 1,
          expires: 5000, // Wait up to 5 seconds for a message
        })

        for await (const msg of messages) {
          if (shouldStop) break

          // Extract headers from NATS message
          const headers: Record<string, string[]> = {}
          if (msg.headers) {
            for (const [key, values] of msg.headers) {
              headers[key] = values
            }
          }

          await processMessage(
            workerId,
            {
              subject: msg.subject,
              data: msg.data,
              headers: Object.keys(headers).length > 0 ? headers : undefined,
              info: {
                redeliveryCount: msg.info.redeliveryCount,
                streamSequence: msg.seq,
              },
            },
            () => msg.ack(),
            (delay?: number) => msg.nak(delay),
            () => msg.term(),
            () => msg.working()
          )
        }
      } catch (error) {
        // Ignore timeout errors (normal when no messages available)
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (!errorMsg.includes('timeout') && !errorMsg.includes('408')) {
          console.error(`[messaging:async-inbound] Worker ${workerId}: Fetch error:`, error)
          // Brief pause before retrying on unexpected errors
          await sleep(1000)
        }
      }
    }

    log(`Worker ${workerId}: Stopped`)
  }

  return {
    async start(): Promise<void> {
      if (active) {
        log('Consumer already active')
        return
      }

      if (!driver.isConnected()) {
        throw new Error('Messaging driver is not connected')
      }

      const js = driver.getJetStream()
      const jsm = driver.getJetStreamManager()

      if (!js || !jsm) {
        throw new Error('JetStream is not enabled. Set NATS_JETSTREAM_ENABLED=true')
      }

      log(`Starting async inbound consumer with ${config.concurrency} workers...`)

      // Ensure stream and consumer exist
      await ensureStream(jsm)
      await ensureConsumer(jsm)

      // Get consumer handle
      consumerHandle = await js.consumers.get(STREAM_NAME, CONSUMER_NAME)

      active = true
      shouldStop = false
      startedAt = new Date()

      // Defensive: clear any stale state
      workers.length = 0
      workerPromises.length = 0

      // Initialize workers
      for (let i = 0; i < config.concurrency; i++) {
        workers.push(initWorker(i))
      }

      // Start worker loops
      for (let i = 0; i < config.concurrency; i++) {
        const promise = workerLoop(i).catch((error) => {
          console.error(`[messaging:async-inbound] Worker ${i} crashed:`, error)
        })
        workerPromises.push(promise)
      }

      log(`Started with ${config.concurrency} worker(s)`)
    },

    async stop(): Promise<void> {
      if (!active) {
        return
      }

      log('Stopping async inbound consumer...')
      shouldStop = true

      // Wait for workers to finish with timeout
      const deadline = Date.now() + config.drainTimeoutMs

      // Poll for workers to finish
      while (Date.now() < deadline) {
        const busyWorkers = workers.filter((w) => w.busy).length
        if (busyWorkers === 0) break
        log(`Waiting for ${busyWorkers} worker(s) to finish...`)
        await sleep(100)
      }

      // Wait for all worker promises to resolve
      await Promise.allSettled(workerPromises)

      // Clear state
      active = false
      workers.length = 0
      workerPromises.length = 0
      consumerHandle = null
      startedAt = undefined

      log('Stopped')
    },

    isActive(): boolean {
      return active
    },

    getStats(): InboundStats {
      const inFlight = workers.filter((w) => w.busy).length

      return {
        active,
        workerCount: config.concurrency,
        workers: workers.map((w) => ({ ...w })),
        totalProcessed,
        totalFailed,
        inFlight,
        startedAt,
        jetstream: consumerHandle
          ? {
              stream: STREAM_NAME,
              consumer: CONSUMER_NAME,
              numPending: 0, // Would need to query consumer info for accurate count
              numWaiting: 0,
              numAckPending: inFlight,
            }
          : undefined,
      }
    },
  }
}
