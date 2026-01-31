/**
 * Async Inbound Consumer for External Events
 *
 * Uses NATS JetStream's pull consumer for concurrent message processing
 * with configurable worker pools, graceful shutdown, and back-pressure handling.
 *
 * Key features:
 * - JetStream pull consumer with explicit ack/nack
 * - Configurable worker pool for concurrent processing
 * - Graceful shutdown with drain timeout
 * - Built-in back-pressure (only fetch when ready)
 * - Automatic retry with configurable max attempts
 *
 * Configuration:
 * - MESSAGING_INBOUND_CONCURRENCY: Number of concurrent workers (default: 1)
 * - MESSAGING_INBOUND_ACK_WAIT_MS: Ack timeout before redelivery (default: 30000)
 * - MESSAGING_INBOUND_MAX_RETRIES: Max retry attempts (default: 3)
 * - MESSAGING_INBOUND_DRAIN_TIMEOUT_MS: Shutdown drain timeout (default: 10000)
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
import {
  shouldProcessSubject,
  routeMessage,
  type MessageRouterContext,
} from './inbound'

// JetStream types (extracted from nats module)
type JetStreamClient = NonNullable<ReturnType<NatsDriverExtended['getJetStream']>>
type JetStreamManager = NonNullable<ReturnType<NatsDriverExtended['getJetStreamManager']>>
type NatsConnection = NonNullable<ReturnType<NatsDriverExtended['getConnection']>>

/** Stream name for inbound commands */
const STREAM_NAME = 'INBOUND_COMMANDS'

/** Consumer name for async processing */
const CONSUMER_NAME = 'async-processor'

/** Subject prefix for inbound messages - used to namespace inbound events */
export const INBOUND_PREFIX = 'inbound.'

/**
 * Convert a subject to its inbound-prefixed form.
 * External systems should publish to this subject for inbound processing.
 */
export function toInboundSubject(subject: string): string {
  return `${INBOUND_PREFIX}${subject}`
}

/**
 * Strip the inbound prefix from a subject.
 */
export function fromInboundSubject(subject: string): string {
  return subject.startsWith(INBOUND_PREFIX)
    ? subject.slice(INBOUND_PREFIX.length)
    : subject
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
    commandBus: options?.commandBus,
    container: options?.container,
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

  // Router context for message processing
  const routerCtx: MessageRouterContext = {
    commandBus: config.commandBus,
    container: config.container,
    debug: config.debug,
  }

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
   * Build stream subjects - listens to inbound prefixed events.
   * All inbound messages should be published to inbound.{original-subject}.
   */
  function buildStreamSubjects(): string[] {
    return [`${INBOUND_PREFIX}>`]
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
   * Process a single message.
   */
  async function processMessage(
    workerId: number,
    msg: { subject: string; data: Uint8Array; info: { redeliveryCount: number; streamSequence: number } },
    ack: () => void,
    nak: (delay?: number) => void,
    term: () => void,
    working: () => void
  ): Promise<MessageProcessingResult> {
    const startTime = Date.now()
    const worker = workers[workerId]

    // Strip inbound prefix to get the original subject
    const subject = msg.subject.startsWith(INBOUND_PREFIX)
      ? msg.subject.slice(INBOUND_PREFIX.length)
      : msg.subject

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

      // Route the message
      const result = await routeMessage(subject, payload, config.eventBus, routerCtx)

      if (result.success) {
        ack()
        worker.messagesProcessed++
        totalProcessed++
        log(`Worker ${workerId}: Message processed successfully: ${subject}`)
        return {
          success: true,
          routedAs: result.routedAs,
          durationMs: Date.now() - startTime,
        }
      } else {
        throw new Error(result.error || 'Unknown processing error')
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

          await processMessage(
            workerId,
            {
              subject: msg.subject,
              data: msg.data,
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
