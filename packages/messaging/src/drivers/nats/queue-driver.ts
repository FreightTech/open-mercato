/**
 * NATS JetStream Queue Driver
 *
 * Implements the QueueDriver interface from @open-mercato/shared/lib/drivers.
 * Uses NATS JetStream for persistent, distributed job queues.
 *
 * This driver is registered in DI by the messaging module when NATS is enabled.
 * It's used when QUEUE_STRATEGY=custom to provide NATS-backed queues.
 *
 * @example
 * ```typescript
 * // Register in DI (done by messaging module):
 * const driver = createNatsQueueDriver()
 * container.register({ [DI_TOKENS.QUEUE_DRIVER]: asValue(driver) })
 *
 * // Then use via queue package:
 * const queue = createQueue('my-queue', 'custom')
 * await queue.enqueue({ userId: '123' })
 * ```
 */

import type {
  QueueDriver,
  QueueDriverOptions,
  QueueInterface,
  QueuedJobInterface,
  JobContextInterface,
} from '@open-mercato/shared/lib/drivers'

// NATS types (imported dynamically to match the messaging driver pattern)
type NatsConnection = {
  jetstream(opts?: { domain?: string }): JetStreamClient
  jetstreamManager(opts?: { domain?: string }): Promise<JetStreamManager>
  drain(): Promise<void>
  isClosed(): boolean
}

type JetStreamClient = {
  publish(subject: string, data: Uint8Array, opts?: { msgID?: string }): Promise<{ seq: number }>
  consumers: {
    get(stream: string, consumer: string): Promise<Consumer>
  }
}

type JetStreamManager = {
  streams: {
    info(name: string): Promise<{ state: { messages: number; consumer_count: number } }>
    add(config: StreamConfig): Promise<unknown>
    purge(name: string): Promise<unknown>
  }
  consumers: {
    info(stream: string, consumer: string): Promise<{ num_pending: number; num_ack_pending: number }>
    add(stream: string, config: ConsumerConfig): Promise<unknown>
  }
}

type StreamConfig = {
  name: string
  subjects: string[]
  retention: 'limits' | 'interest' | 'workqueue'
  storage: 'file' | 'memory'
  max_age?: number
  max_msgs?: number
  max_bytes?: number
  num_replicas?: number
  discard?: 'old' | 'new'
  duplicate_window?: number
}

type ConsumerConfig = {
  durable_name: string
  ack_policy: unknown
  max_ack_pending: number
  ack_wait: number
  max_deliver: number
  filter_subject: string
}

type Consumer = {
  consume(): Promise<ConsumerMessages>
}

type ConsumerMessages = AsyncIterable<JetStreamMessage> & {
  stop(): void
}

type JetStreamMessage = {
  data: Uint8Array
  info: { redeliveryCount: number }
  ack(): void
  nak(): void
  term(): void
}

type StringCodec = {
  encode(data: string): Uint8Array
  decode(data: Uint8Array): string
}

type AckPolicyType = { Explicit: unknown }

type NatsModule = {
  connect(opts: {
    servers: string | string[]
    token?: string
    user?: string
    pass?: string
    name?: string
  }): Promise<NatsConnection>
  StringCodec(): StringCodec
  AckPolicy: AckPolicyType
}

/**
 * Options for the NATS queue driver.
 */
export interface NatsQueueDriverOptions {
  /** NATS server URL(s). Defaults to NATS_URL env var or localhost:4222. Supports nats://user:pass@host:port format. */
  servers?: string | string[]
  /** Authentication token. Defaults to NATS_TOKEN env var */
  token?: string
  /** Username for authentication (can also be embedded in servers URL) */
  user?: string
  /** Password for authentication (can also be embedded in servers URL) */
  pass?: string
  /** Storage type: 'file' for persistence, 'memory' for speed. Defaults to 'file' */
  storage?: 'file' | 'memory'
  /** Number of replicas for high availability. Defaults to 1 */
  replicas?: number
  /** Maximum time to wait for acknowledgment in milliseconds. Defaults to 30000 */
  ackWait?: number
  /** Maximum redelivery attempts before giving up. Defaults to 3 */
  maxDeliver?: number
  /** Enable debug logging */
  debug?: boolean
}

// Shared connection state
let sharedNc: NatsConnection | null = null
let sharedNatsModule: NatsModule | null = null
let connectionPromise: Promise<void> | null = null
let connectionRefCount = 0

/**
 * Creates a NATS JetStream queue driver.
 *
 * The driver manages its own NATS connection (shared across all queues).
 *
 * @param options - Driver options
 * @returns A QueueDriver instance
 */
export function createNatsQueueDriver(options?: NatsQueueDriverOptions): QueueDriver {
  const debug = options?.debug ?? process.env.MESSAGING_DEBUG === 'true'
  const servers = options?.servers ?? process.env.NATS_URL ?? 'localhost:4222'
  const token = options?.token ?? process.env.NATS_TOKEN
  const user = options?.user ?? process.env.NATS_USER
  const pass = options?.pass ?? process.env.NATS_PASS
  const storage = options?.storage ?? 'file'
  const replicas = options?.replicas ?? 1
  const ackWait = options?.ackWait ?? 30000
  const maxDeliver = options?.maxDeliver ?? 3

  function log(...args: unknown[]): void {
    if (debug) console.log('[nats:queue]', ...args)
  }

  async function ensureConnection(): Promise<{ nc: NatsConnection; nats: NatsModule }> {
    if (sharedNc && !sharedNc.isClosed() && sharedNatsModule) {
      return { nc: sharedNc, nats: sharedNatsModule }
    }

    if (connectionPromise) {
      await connectionPromise
      if (sharedNc && sharedNatsModule) {
        return { nc: sharedNc, nats: sharedNatsModule }
      }
    }

    connectionPromise = (async () => {
      const nats = await import('nats') as unknown as NatsModule
      sharedNatsModule = nats

      const connectOptions: Parameters<NatsModule['connect']>[0] = {
        servers,
        name: 'open-mercato-queue',
      }

      if (token) {
        connectOptions.token = token
      }
      if (user && pass) {
        connectOptions.user = user
        connectOptions.pass = pass
      }

      sharedNc = await nats.connect(connectOptions)
      log(`Connected to NATS at ${servers}`)
    })()

    await connectionPromise
    connectionPromise = null

    return { nc: sharedNc!, nats: sharedNatsModule! }
  }

  return {
    id: 'nats',
    name: 'NATS JetStream',

    createQueue<T = unknown>(name: string, driverOptions?: QueueDriverOptions): QueueInterface<T> {
      const concurrency = driverOptions?.concurrency ?? 1

      const streamName = `QUEUE_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
      const subject = `queue.${name}`
      const consumerName = `worker_${name.replace(/[^a-zA-Z0-9]/g, '_')}`

      connectionRefCount++

      let js: JetStreamClient | null = null
      let jsm: JetStreamManager | null = null
      let sc: StringCodec | null = null
      let AckPolicy: AckPolicyType | null = null

      let consumerMessages: ConsumerMessages | null = null
      let isProcessing = false
      let shouldStop = false

      async function init(): Promise<void> {
        if (js) return

        const { nc, nats } = await ensureConnection()
        sc = nats.StringCodec()
        AckPolicy = nats.AckPolicy

        js = nc.jetstream()
        jsm = await nc.jetstreamManager()

        log(`Initialized for queue ${name}`)
      }

      async function ensureStream(): Promise<void> {
        if (!jsm) await init()

        try {
          await jsm!.streams.info(streamName)
          log(`Using existing stream ${streamName}`)
        } catch {
          const streamConfig: StreamConfig = {
            name: streamName,
            subjects: [subject],
            retention: 'workqueue',
            storage: storage === 'memory' ? 'memory' : 'file',
            num_replicas: replicas,
            discard: 'old',
            duplicate_window: 120000000000, // 2 minutes in nanoseconds
          }

          await jsm!.streams.add(streamConfig)
          log(`Created stream ${streamName}`)
        }
      }

      async function ensureConsumer(): Promise<void> {
        if (!jsm) await init()
        await ensureStream()

        try {
          await jsm!.consumers.info(streamName, consumerName)
          log(`Using existing consumer ${consumerName}`)
        } catch {
          await jsm!.consumers.add(streamName, {
            durable_name: consumerName,
            ack_policy: AckPolicy!.Explicit,
            max_ack_pending: concurrency,
            ack_wait: ackWait * 1000000, // Convert ms to nanoseconds
            max_deliver: maxDeliver,
            filter_subject: subject,
          })
          log(`Created consumer ${consumerName}`)
        }
      }

      return {
        name,
        strategy: 'custom',
        provider: 'nats',

        async enqueue(data: T): Promise<string> {
          if (!js) {
            await init()
            await ensureStream()
          }

          const jobData: QueuedJobInterface<T> = {
            id: crypto.randomUUID(),
            payload: data,
            createdAt: new Date().toISOString(),
          }

          const encodedData = sc!.encode(JSON.stringify(jobData))

          const pubAck = await js!.publish(subject, encodedData, {
            msgID: jobData.id,
          })

          log(`Enqueued job ${jobData.id} (seq: ${pubAck.seq})`)
          return jobData.id
        },

        async process(
          handler: (job: QueuedJobInterface<T>, ctx: JobContextInterface) => Promise<void> | void
        ): Promise<{ processed: number; failed: number; lastJobId?: string }> {
          await init()
          await ensureConsumer()

          const consumer = await js!.consumers.get(streamName, consumerName)

          log(`Worker started with concurrency ${concurrency}`)

          shouldStop = false
          isProcessing = true

          consumerMessages = await consumer.consume()

          ;(async () => {
            try {
              for await (const msg of consumerMessages!) {
                if (shouldStop) break

                try {
                  const jobData: QueuedJobInterface<T> = JSON.parse(sc!.decode(msg.data))

                  await handler(jobData, {
                    jobId: jobData.id,
                    attemptNumber: msg.info.redeliveryCount + 1,
                    queueName: name,
                  })

                  msg.ack()
                  log(`Job ${jobData.id} completed`)
                } catch (err) {
                  console.error(`[nats:queue:${name}] Job failed:`, err)

                  if (msg.info.redeliveryCount + 1 >= maxDeliver) {
                    msg.term()
                    console.error(`[nats:queue:${name}] Job exceeded max deliveries, terminated`)
                  } else {
                    msg.nak()
                  }
                }
              }
            } catch (err) {
              if (!shouldStop) {
                console.error(`[nats:queue:${name}] Consumer error:`, err)
              }
            } finally {
              isProcessing = false
            }
          })()

          return { processed: -1, failed: -1, lastJobId: undefined }
        },

        async clear(): Promise<{ removed: number }> {
          if (!jsm) await init()

          try {
            await ensureStream()
            await jsm!.streams.purge(streamName)
            log(`Purged stream ${streamName}`)
            return { removed: -1 }
          } catch (err) {
            console.error(`[nats:queue:${name}] Failed to purge stream:`, err)
            return { removed: 0 }
          }
        },

        async close(): Promise<void> {
          shouldStop = true

          if (consumerMessages) {
            try {
              consumerMessages.stop()
            } catch {
              // Ignore stop errors
            }
            consumerMessages = null
          }

          const SHUTDOWN_TIMEOUT = 5000
          const startTime = Date.now()

          while (isProcessing) {
            if (Date.now() - startTime > SHUTDOWN_TIMEOUT) {
              console.warn(`[nats:queue:${name}] Force closing after ${SHUTDOWN_TIMEOUT}ms timeout`)
              break
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
          }

          connectionRefCount--
          if (connectionRefCount <= 0 && sharedNc) {
            try {
              await sharedNc.drain()
              log('Shared NATS connection closed')
            } catch {
              // Ignore drain errors
            }
            sharedNc = null
            sharedNatsModule = null
          }

          log(`Queue ${name} closed`)
        },

        async getJobCounts(): Promise<{
          waiting: number
          active: number
          completed: number
          failed: number
        }> {
          if (!jsm) await init()

          try {
            await ensureStream()
            const streamInfo = await jsm!.streams.info(streamName)

            let numPending = 0
            let numAckPending = 0

            try {
              const consumerInfo = await jsm!.consumers.info(streamName, consumerName)
              numPending = consumerInfo.num_pending
              numAckPending = consumerInfo.num_ack_pending
            } catch {
              // Consumer may not exist yet
            }

            return {
              waiting: numPending,
              active: numAckPending,
              completed: streamInfo.state.consumer_count,
              failed: 0,
            }
          } catch {
            return { waiting: 0, active: 0, completed: 0, failed: 0 }
          }
        },
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        const { nc } = await ensureConnection()
        return !nc.isClosed()
      } catch {
        return false
      }
    },
  }
}
