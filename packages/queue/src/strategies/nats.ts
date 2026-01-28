import type { Queue, QueuedJob, JobHandler, NatsProviderOptions, ProcessResult } from '../types'

// NATS interface types - we define the shape we use to maintain type safety
// while keeping nats as an optional peer dependency

interface NatsConnectionInterface {
  jetstream(opts?: { domain?: string }): JetStreamClientInterface
  jetstreamManager(opts?: { domain?: string }): Promise<JetStreamManagerInterface>
  drain(): Promise<void>
  isClosed(): boolean
}

interface JetStreamClientInterface {
  publish(subject: string, data: Uint8Array, opts?: { msgID?: string }): Promise<{ seq: number }>
  consumers: {
    get(stream: string, consumer: string): Promise<ConsumerInterface>
  }
}

interface JetStreamManagerInterface {
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

interface StreamConfig {
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

interface ConsumerConfig {
  durable_name: string
  ack_policy: unknown // AckPolicy enum value
  max_ack_pending: number
  ack_wait: number
  max_deliver: number
  filter_subject: string
}

interface ConsumerInterface {
  consume(): Promise<ConsumerMessagesInterface>
}

interface ConsumerMessagesInterface extends AsyncIterable<JetStreamMessageInterface> {
  stop(): void
}

interface JetStreamMessageInterface {
  data: Uint8Array
  info: {
    redeliveryCount: number
  }
  ack(): void
  nak(): void
  term(): void
}

interface StringCodecInterface {
  encode(data: string): Uint8Array
  decode(data: Uint8Array): string
}

interface NatsModule {
  connect(opts: {
    servers: string | string[]
    token?: string
    user?: string
    pass?: string
    name?: string
  }): Promise<NatsConnectionInterface>
  StringCodec(): StringCodecInterface
  AckPolicy: {
    Explicit: unknown
  }
}

/**
 * Resolves NATS connection options from various sources.
 */
function resolveConnection(options?: NatsProviderOptions['connection']): {
  servers: string | string[]
  token?: string
  user?: string
  pass?: string
} {
  const servers = options?.servers ?? process.env.NATS_URL ?? 'localhost:4222'

  return {
    servers,
    token: options?.token ?? process.env.NATS_TOKEN,
    user: options?.user,
    pass: options?.pass,
  }
}

/**
 * Converts stream name to a valid NATS stream name.
 * Stream names must be alphanumeric with underscores, no dots or hyphens.
 */
function toStreamName(queueName: string): string {
  return `QUEUE_${queueName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

/**
 * Creates a NATS JetStream-based async queue.
 *
 * This provider uses NATS JetStream for:
 * - Persistent message storage with workqueue retention
 * - Exactly-once processing with explicit acknowledgments
 * - Pull-based consumers for controlled processing
 * - Durable subscriptions that survive restarts
 *
 * @template T - The payload type for jobs
 * @param name - Queue name (used for stream naming)
 * @param options - NATS provider options
 *
 * @example
 * ```typescript
 * const queue = createNatsQueue<{ userId: string }>('my-queue', {
 *   connection: { servers: 'nats://localhost:4222' },
 *   concurrency: 5,
 *   streamConfig: { storage: 'file' }
 * })
 *
 * await queue.enqueue({ userId: '123' })
 *
 * await queue.process(async (job, ctx) => {
 *   console.log(`Processing job ${ctx.jobId}:`, job.payload)
 * })
 * ```
 */
export function createNatsQueue<T = unknown>(
  name: string,
  options?: NatsProviderOptions
): Queue<T> {
  const connectionConfig = resolveConnection(options?.connection)
  const concurrency = options?.concurrency ?? 1
  const ackWait = options?.ackWait ?? 30000
  const maxDeliver = options?.maxDeliver ?? 3

  const streamName = toStreamName(name)
  const subject = `queue.${name}`
  const consumerName = `worker_${name.replace(/[^a-zA-Z0-9]/g, '_')}`

  // Connection state
  let nc: NatsConnectionInterface | null = null
  let js: JetStreamClientInterface | null = null
  let jsm: JetStreamManagerInterface | null = null
  let sc: StringCodecInterface | null = null
  let natsModule: NatsModule | null = null

  // Worker state
  let consumerMessages: ConsumerMessagesInterface | null = null
  let isProcessing = false
  let shouldStop = false

  // -------------------------------------------------------------------------
  // Lazy NATS initialization
  // -------------------------------------------------------------------------

  async function getNats(): Promise<NatsModule> {
    if (!natsModule) {
      try {
        natsModule = await import('nats') as unknown as NatsModule
      } catch {
        throw new Error(
          'NATS is required for nats queue provider. Install it with: npm install nats'
        )
      }
    }
    return natsModule
  }

  async function connect(): Promise<void> {
    if (nc) return

    const nats = await getNats()
    sc = nats.StringCodec()

    nc = await nats.connect({
      servers: connectionConfig.servers,
      token: connectionConfig.token,
      user: connectionConfig.user,
      pass: connectionConfig.pass,
      name: `queue-${name}`,
    })

    js = nc.jetstream()
    jsm = await nc.jetstreamManager()

    console.log(`[queue:${name}] Connected to NATS at ${connectionConfig.servers}`)
  }

  async function ensureStream(): Promise<void> {
    if (!jsm) await connect()

    const storage = options?.streamConfig?.storage ?? 'file'

    try {
      // Try to get existing stream info
      await jsm!.streams.info(streamName)
      console.log(`[queue:${name}] Using existing stream ${streamName}`)
    } catch {
      // Stream doesn't exist, create it
      const streamConfig: StreamConfig = {
        name: streamName,
        subjects: [subject],
        retention: 'workqueue', // Remove messages after ack (workqueue semantics)
        storage: storage === 'memory' ? 'memory' : 'file',
        max_age: options?.streamConfig?.maxAge,
        max_msgs: options?.streamConfig?.maxMsgs,
        max_bytes: options?.streamConfig?.maxBytes,
        num_replicas: options?.streamConfig?.replicas ?? 1,
        discard: 'old',
        duplicate_window: 120000000000, // 2 minutes in nanoseconds for deduplication
      }

      await jsm!.streams.add(streamConfig)
      console.log(`[queue:${name}] Created stream ${streamName}`)
    }
  }

  async function ensureConsumer(): Promise<void> {
    if (!jsm) await connect()
    await ensureStream()

    try {
      // Try to get existing consumer info
      await jsm!.consumers.info(streamName, consumerName)
      console.log(`[queue:${name}] Using existing consumer ${consumerName}`)
    } catch {
      // Consumer doesn't exist, create it
      const nats = await getNats()

      await jsm!.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: nats.AckPolicy.Explicit,
        max_ack_pending: concurrency,
        ack_wait: ackWait * 1000000, // Convert ms to nanoseconds
        max_deliver: maxDeliver,
        filter_subject: subject,
      })
      console.log(`[queue:${name}] Created consumer ${consumerName}`)
    }
  }

  // -------------------------------------------------------------------------
  // Queue Implementation
  // -------------------------------------------------------------------------

  async function enqueue(data: T): Promise<string> {
    if (!js) {
      await connect()
      await ensureStream()
    }

    const jobData: QueuedJob<T> = {
      id: crypto.randomUUID(),
      payload: data,
      createdAt: new Date().toISOString(),
    }

    const encodedData = sc!.encode(JSON.stringify(jobData))

    const pubAck = await js!.publish(subject, encodedData, {
      msgID: jobData.id, // Enable deduplication
    })

    console.log(`[queue:${name}] Enqueued job ${jobData.id} (seq: ${pubAck.seq})`)
    return jobData.id
  }

  async function process(handler: JobHandler<T>): Promise<ProcessResult> {
    await connect()
    await ensureConsumer()

    const consumer = await js!.consumers.get(streamName, consumerName)

    console.log(`[queue:${name}] NATS worker started with concurrency ${concurrency}`)

    shouldStop = false
    isProcessing = true

    // Start consuming messages
    consumerMessages = await consumer.consume()

    // Process messages in the background
    ;(async () => {
      try {
        for await (const msg of consumerMessages!) {
          if (shouldStop) {
            break
          }

          try {
            const jobData: QueuedJob<T> = JSON.parse(sc!.decode(msg.data))

            await handler(jobData, {
              jobId: jobData.id,
              attemptNumber: msg.info.redeliveryCount + 1,
              queueName: name,
            })

            msg.ack()
            console.log(`[queue:${name}] Job ${jobData.id} completed`)
          } catch (err) {
            console.error(`[queue:${name}] Job failed:`, err)

            // Check if we've exceeded max deliveries
            if (msg.info.redeliveryCount + 1 >= maxDeliver) {
              // Terminate to move to dead letter or discard
              msg.term()
              console.error(`[queue:${name}] Job exceeded max deliveries, terminated`)
            } else {
              // NAK to trigger redelivery
              msg.nak()
            }
          }
        }
      } catch (err) {
        if (!shouldStop) {
          console.error(`[queue:${name}] Consumer error:`, err)
        }
      } finally {
        isProcessing = false
      }
    })()

    // Return sentinel value indicating continuous worker mode
    return { processed: -1, failed: -1, lastJobId: undefined }
  }

  async function clear(): Promise<{ removed: number }> {
    if (!jsm) await connect()

    try {
      await ensureStream()
      await jsm!.streams.purge(streamName)
      console.log(`[queue:${name}] Purged stream ${streamName}`)
      return { removed: -1 } // NATS purge doesn't return count
    } catch (err) {
      console.error(`[queue:${name}] Failed to purge stream:`, err)
      return { removed: 0 }
    }
  }

  async function close(): Promise<void> {
    shouldStop = true

    // Stop the consumer
    if (consumerMessages) {
      try {
        consumerMessages.stop()
      } catch {
        // Ignore stop errors
      }
      consumerMessages = null
    }

    // Wait for processing to complete (with timeout)
    const SHUTDOWN_TIMEOUT = 5000
    const startTime = Date.now()

    while (isProcessing) {
      if (Date.now() - startTime > SHUTDOWN_TIMEOUT) {
        console.warn(`[queue:${name}] Force closing after ${SHUTDOWN_TIMEOUT}ms timeout`)
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    // Drain and close connection
    if (nc) {
      try {
        await nc.drain()
      } catch {
        // Ignore drain errors
      }
      nc = null
      js = null
      jsm = null
    }

    console.log(`[queue:${name}] NATS connection closed`)
  }

  async function getJobCounts(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
  }> {
    if (!jsm) await connect()

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
        completed: streamInfo.state.consumer_count, // Approximation
        failed: 0, // NATS doesn't track failed separately
      }
    } catch {
      return { waiting: 0, active: 0, completed: 0, failed: 0 }
    }
  }

  return {
    name,
    strategy: 'async',
    provider: 'nats',
    enqueue,
    process,
    clear,
    close,
    getJobCounts,
  }
}
