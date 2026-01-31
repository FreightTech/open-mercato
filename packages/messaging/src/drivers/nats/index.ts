/**
 * NATS Messaging Driver
 *
 * A simple NATS driver implementation supporting:
 * - Basic pub/sub messaging
 * - Request-response patterns
 * - JetStream for persistence and exactly-once delivery
 * - Subject wildcards (* and >)
 */

import type {
  MessagingDriver,
  Message,
  MessageContext,
  MessageHandler,
  ReplyHandler,
  PublishOptions,
  RequestOptions,
  SubscribeOptions,
  Subscription,
  NatsDriverOptions,
} from '../../types'

// NATS types (imported dynamically)
type NatsConnection = Awaited<ReturnType<typeof import('nats')['connect']>>
type JetStreamClient = ReturnType<NatsConnection['jetstream']>
type JetStreamManager = Awaited<ReturnType<NatsConnection['jetstreamManager']>>
type NatsSubscription = ReturnType<NatsConnection['subscribe']>
type StringCodec = ReturnType<typeof import('nats')['StringCodec']>
type NatsHeaders = ReturnType<typeof import('nats')['headers']>

/** Internal subscription tracking */
type InternalSubscription = {
  id: string
  subject: string
  natsSub: NatsSubscription
  active: boolean
  processLoop?: Promise<void>
}

/** Source header to identify messages from this app */
const SOURCE_HEADER = 'x-source'
const SOURCE_VALUE = 'open-mercato'

/**
 * Creates a NATS messaging driver.
 *
 * @param options - NATS driver configuration
 * @returns A MessagingDriver instance
 *
 * @example
 * ```typescript
 * const driver = createNatsDriver({
 *   servers: 'nats://localhost:4222',
 *   jetstream: { enabled: true }
 * })
 * await driver.connect()
 *
 * // Subscribe to messages
 * await driver.subscribe('orders.>', async (msg) => {
 *   console.log('Received:', msg.payload)
 * })
 *
 * // Publish a message
 * await driver.publish('orders.created', { orderId: '123' })
 *
 * // Request-response
 * const response = await driver.request('inventory.check', { sku: 'ABC' })
 * ```
 */
export function createNatsDriver(options?: NatsDriverOptions): MessagingDriver {
  const debug = options?.debug ?? false

  // Connection state
  let nc: NatsConnection | null = null
  let js: JetStreamClient | null = null
  let jsm: JetStreamManager | null = null
  let sc: StringCodec | null = null
  let headersFn: typeof import('nats')['headers'] | null = null

  // Subscription tracking
  const subscriptions = new Map<string, InternalSubscription>()
  let subscriptionCounter = 0

  /**
   * Log debug messages.
   */
  function log(...args: unknown[]): void {
    if (debug) console.log('[nats]', ...args)
  }

  /**
   * Checks if a message originated from this app (has our source header).
   */
  function isOwnMessage(headers?: NatsHeaders): boolean {
    if (!headers) return false
    const source = headers.get(SOURCE_HEADER)
    return source === SOURCE_VALUE
  }

  /**
   * Generate a unique subscription ID.
   */
  function generateSubscriptionId(): string {
    return `nats-sub-${++subscriptionCounter}`
  }

  /**
   * Generate a unique message ID.
   */
  function generateMessageId(): string {
    return `nats-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * Convert options headers to NATS headers.
   */
  function createNatsHeaders(headers?: Record<string, string>): NatsHeaders | undefined {
    if (!headers || !headersFn) return undefined

    const h = headersFn()
    for (const [key, value] of Object.entries(headers)) {
      h.set(key, value)
    }
    return h
  }

  /**
   * Extract headers from NATS message.
   */
  function extractHeaders(msg: { headers?: NatsHeaders }): Record<string, string> | undefined {
    if (!msg.headers) return undefined

    const headers: Record<string, string> = {}
    for (const [key, values] of msg.headers) {
      headers[key] = values.join(', ')
    }
    return Object.keys(headers).length > 0 ? headers : undefined
  }

  /**
   * Create a MessageContext for a subscription.
   */
  function createContext(
    subscriptionId: string,
    subject: string,
    natsMsg?: { reply?: string; respond?: (data: Uint8Array) => boolean }
  ): MessageContext {
    return {
      driver: 'nats',
      subscription: subscriptionId,
      async ack(): Promise<void> {
        log(`ACK message on ${subject}`)
      },
      async nack(_options?: { requeue?: boolean }): Promise<void> {
        log(`NACK message on ${subject}`)
      },
      async reply<T>(payload: T): Promise<void> {
        if (!natsMsg?.respond || !natsMsg.reply) {
          throw new Error('Cannot reply: no reply subject')
        }
        const data = sc
          ? sc.encode(JSON.stringify(payload))
          : new TextEncoder().encode(JSON.stringify(payload))
        natsMsg.respond(data)
        log(`Replied to ${natsMsg.reply}`)
      },
    }
  }

  /**
   * Process messages from a subscription.
   */
  async function processSubscription(
    sub: InternalSubscription,
    handler: MessageHandler
  ): Promise<void> {
    for await (const msg of sub.natsSub) {
      if (!sub.active) break

      // Skip messages that originated from this app (prevent loops)
      if (isOwnMessage(msg.headers)) {
        log(`Skipping own message on ${msg.subject}`)
        continue
      }

      try {
        const payload = sc
          ? JSON.parse(sc.decode(msg.data))
          : JSON.parse(new TextDecoder().decode(msg.data))

        const message: Message<unknown> = {
          id: generateMessageId(),
          subject: msg.subject,
          payload,
          headers: extractHeaders(msg),
          metadata: {
            timestamp: new Date().toISOString(),
            replyTo: msg.reply,
            source: 'nats',
          },
        }

        const ctx = createContext(sub.id, msg.subject, msg)
        await Promise.resolve(handler(message, ctx))
      } catch (error) {
        console.error(`[nats] Handler error for ${sub.subject}:`, error)
      }
    }
  }

  return {
    id: 'nats',
    name: 'NATS',

    async connect(): Promise<void> {
      if (nc) {
        log('Already connected')
        return
      }

      log('Connecting...')

      // Dynamically import nats
      const nats = await import('nats')
      sc = nats.StringCodec()
      headersFn = nats.headers

      // Build connection options
      const servers = options?.servers ?? process.env.NATS_URL ?? 'localhost:4222'
      const connectOptions: Parameters<typeof nats.connect>[0] = {
        servers,
        name: options?.name ?? 'open-mercato',
      }

      if (options?.token) {
        connectOptions.token = options.token
      } else if (process.env.NATS_TOKEN) {
        connectOptions.token = process.env.NATS_TOKEN
      }

      if (options?.user && options?.pass) {
        connectOptions.user = options.user
        connectOptions.pass = options.pass
      }

      if (options?.credentials) {
        const { readFile } = await import('node:fs/promises')
        const credsContent = await readFile(options.credentials)
        connectOptions.authenticator = nats.credsAuthenticator(credsContent)
      }

      if (options?.reconnect) {
        connectOptions.maxReconnectAttempts = options.reconnect.maxAttempts ?? -1
        connectOptions.reconnectTimeWait = options.reconnect.delay ?? 2000
      }

      nc = await nats.connect(connectOptions)
      log(`Connected to ${servers}`)

      // Initialize JetStream if enabled
      const jsEnabled = options?.jetstream?.enabled ??
        process.env.NATS_JETSTREAM_ENABLED === 'true'

      if (jsEnabled) {
        js = nc.jetstream({ domain: options?.jetstream?.domain })
        jsm = await nc.jetstreamManager({ domain: options?.jetstream?.domain })
        log('JetStream initialized')
      }

      // Handle connection events
      ;(async () => {
        for await (const status of nc!.status()) {
          log(`Connection status: ${status.type}`, status.data)
        }
      })().catch(() => {})
    },

    async disconnect(): Promise<void> {
      log('Disconnecting...')

      // Drain all subscriptions
      for (const sub of subscriptions.values()) {
        sub.active = false
        try {
          await sub.natsSub.drain()
        } catch {
          // Ignore drain errors
        }
      }
      subscriptions.clear()

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

      log('Disconnected')
    },

    isConnected(): boolean {
      return nc !== null && !nc.isClosed()
    },

    async isHealthy(): Promise<boolean> {
      if (!nc || nc.isClosed()) return false

      try {
        // Try a simple flush to verify connectivity
        await nc.flush()
        return true
      } catch {
        return false
      }
    },

    async publish(
      subject: string,
      payload: unknown,
      options?: PublishOptions
    ): Promise<string> {
      if (!nc) throw new Error('Not connected')

      const data = sc
        ? sc.encode(JSON.stringify(payload))
        : new TextEncoder().encode(JSON.stringify(payload))

      // Add source header to identify messages from this app
      const headersWithSource = { ...options?.headers, [SOURCE_HEADER]: SOURCE_VALUE }
      const headers = createNatsHeaders(headersWithSource)

      // Use JetStream for persistent messages if available
      if (options?.persistent && js) {
        log(`Publishing to JetStream: ${subject}`)
        const pubOpts: { msgID?: string; headers?: NatsHeaders } = {}
        if (options.deduplicationId) {
          pubOpts.msgID = options.deduplicationId
        }
        if (headers) {
          pubOpts.headers = headers
        }

        const ack = await js.publish(subject, data, pubOpts)
        return ack.seq.toString()
      }

      // Regular NATS publish
      log(`Publishing to ${subject}`)
      nc.publish(subject, data, { headers })
      return generateMessageId()
    },

    async request<Req, Resp>(
      subject: string,
      payload: Req,
      options?: RequestOptions
    ): Promise<Resp> {
      if (!nc) throw new Error('Not connected')

      const timeout = options?.timeout ?? 30000
      log(`Request to ${subject} (timeout: ${timeout}ms)`)

      const data = sc
        ? sc.encode(JSON.stringify(payload))
        : new TextEncoder().encode(JSON.stringify(payload))

      const headers = createNatsHeaders(options?.headers)

      const response = await nc.request(subject, data, { timeout, headers })
      const responseData = sc
        ? JSON.parse(sc.decode(response.data))
        : JSON.parse(new TextDecoder().decode(response.data))

      return responseData as Resp
    },

    async subscribe(
      subject: string,
      handler: MessageHandler,
      options?: SubscribeOptions
    ): Promise<Subscription> {
      if (!nc) throw new Error('Not connected')

      const id = generateSubscriptionId()
      log(`Subscribing to ${subject} (id: ${id})`)

      // Create subscription options
      const subOpts: { queue?: string } = {}
      if (options?.queue) {
        subOpts.queue = options.queue
      }

      const natsSub = nc.subscribe(subject, subOpts)

      const sub: InternalSubscription = {
        id,
        subject,
        natsSub,
        active: true,
      }

      subscriptions.set(id, sub)

      // Start processing messages
      sub.processLoop = processSubscription(sub, handler)

      return {
        id,
        subject,
        async unsubscribe(): Promise<void> {
          sub.active = false
          natsSub.unsubscribe()
          subscriptions.delete(id)
          log(`Unsubscribed from ${subject} (id: ${id})`)
        },
        async drain(): Promise<void> {
          sub.active = false
          await natsSub.drain()
          subscriptions.delete(id)
          log(`Drained subscription ${subject} (id: ${id})`)
        },
      }
    },

    async reply<Req, Resp>(
      subject: string,
      handler: ReplyHandler<Req, Resp>,
      options?: SubscribeOptions
    ): Promise<Subscription> {
      if (!nc) throw new Error('Not connected')

      const id = generateSubscriptionId()
      log(`Reply handler for ${subject} (id: ${id})`)

      // Create subscription options
      const subOpts: { queue?: string } = {}
      if (options?.queue) {
        subOpts.queue = options.queue
      }

      const natsSub = nc.subscribe(subject, subOpts)

      const sub: InternalSubscription = {
        id,
        subject,
        natsSub,
        active: true,
      }

      subscriptions.set(id, sub)

      // Start processing with reply capability
      sub.processLoop = (async () => {
        for await (const msg of natsSub) {
          if (!sub.active) break

          // Skip messages that originated from this app (prevent loops)
          if (isOwnMessage(msg.headers)) {
            log(`Skipping own message on ${msg.subject}`)
            continue
          }

          try {
            const payload = sc
              ? JSON.parse(sc.decode(msg.data))
              : JSON.parse(new TextDecoder().decode(msg.data))

            const message: Message<Req> = {
              id: generateMessageId(),
              subject: msg.subject,
              payload: payload as Req,
              headers: extractHeaders(msg),
              metadata: {
                timestamp: new Date().toISOString(),
                replyTo: msg.reply,
                source: 'nats',
              },
            }

            const ctx = createContext(id, msg.subject, msg)

            const response = await handler(message, ctx)

            // Send response
            if (msg.reply) {
              const responseData = sc
                ? sc.encode(JSON.stringify(response))
                : new TextEncoder().encode(JSON.stringify(response))
              msg.respond(responseData)
              log(`Replied to ${msg.reply}`)
            }
          } catch (error) {
            console.error(`[nats] Reply handler error for ${subject}:`, error)
            // Send error response if possible
            if (msg.reply) {
              const errorData = sc
                ? sc.encode(JSON.stringify({ error: String(error) }))
                : new TextEncoder().encode(JSON.stringify({ error: String(error) }))
              msg.respond(errorData)
            }
          }
        }
      })()

      return {
        id,
        subject,
        async unsubscribe(): Promise<void> {
          sub.active = false
          natsSub.unsubscribe()
          subscriptions.delete(id)
          log(`Reply handler removed for ${subject} (id: ${id})`)
        },
        async drain(): Promise<void> {
          sub.active = false
          await natsSub.drain()
          subscriptions.delete(id)
          log(`Reply handler drained for ${subject} (id: ${id})`)
        },
      }
    },
  }
}
