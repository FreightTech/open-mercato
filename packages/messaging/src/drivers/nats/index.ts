/**
 * NATS Messaging Driver
 *
 * A full-featured NATS driver implementation supporting:
 * - Basic pub/sub messaging
 * - Request-response patterns
 * - JetStream for persistence and exactly-once delivery
 * - Subject wildcards (* and >)
 * - Durable subscriptions
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
  PublishFilter,
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

/** Regex to extract tenant prefix from subject: {tenantId}.{rest} */
const TENANT_PREFIX_REGEX = /^([^.]+)\.(.+)$/

/**
 * Converts a NATS-style pattern to a RegExp.
 * - `*` matches one token (non-dot chars)
 * - `>` matches rest of subject (one or more tokens)
 */
function patternToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]+')
    .replace(/>$/, '.+')
  return new RegExp(`^${regexStr}$`)
}

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
  const publishFilter = options?.publishFilter
  const subscribeFilter = options?.subscribeFilter
  const tenantPrefix = options?.tenantPrefix ?? true

  // Connection state
  let nc: NatsConnection | null = null
  let js: JetStreamClient | null = null
  let jsm: JetStreamManager | null = null
  let sc: StringCodec | null = null
  let headersFn: typeof import('nats')['headers'] | null = null

  // Subscription tracking
  const subscriptions = new Map<string, InternalSubscription>()
  let subscriptionCounter = 0

  // Precompile filter patterns to regex
  const publishIncludePatterns = publishFilter?.include?.map(patternToRegex) ?? []
  const publishExcludePatterns = publishFilter?.exclude?.map(patternToRegex) ?? []
  const subscribeIncludePatterns = subscribeFilter?.include?.map(patternToRegex) ?? []
  const subscribeExcludePatterns = subscribeFilter?.exclude?.map(patternToRegex) ?? []

  /**
   * Log debug messages.
   */
  function log(...args: unknown[]): void {
    if (debug) console.log('[nats]', ...args)
  }

  /**
   * Extracts tenantId from payload for subject prefixing.
   * Looks for tenantId in common locations within the payload.
   */
  function extractTenantId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined

    const p = payload as Record<string, unknown>

    // Direct tenantId field
    if (typeof p.tenantId === 'string') return p.tenantId

    // Nested in data object (common event structure)
    if (p.data && typeof p.data === 'object') {
      const data = p.data as Record<string, unknown>
      if (typeof data.tenantId === 'string') return data.tenantId
    }

    // Nested in payload object
    if (p.payload && typeof p.payload === 'object') {
      const inner = p.payload as Record<string, unknown>
      if (typeof inner.tenantId === 'string') return inner.tenantId
    }

    return undefined
  }

  /**
   * Applies tenant prefix to subject if enabled and tenantId is available.
   */
  function applyTenantPrefix(subject: string, payload: unknown): string {
    if (!tenantPrefix) return subject

    const tenantId = extractTenantId(payload)
    if (!tenantId) return subject

    return `${tenantId}.${subject}`
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
   * Strips tenant prefix from subject and returns the tenantId and clean subject.
   * Returns null if no tenant prefix found.
   */
  function stripTenantPrefix(subject: string): { tenantId: string; subject: string } | null {
    if (!tenantPrefix) return null

    const match = subject.match(TENANT_PREFIX_REGEX)
    if (!match) return null

    return {
      tenantId: match[1],
      subject: match[2],
    }
  }

  /**
   * Injects tenantId into payload if not already present.
   */
  function injectTenantId(payload: unknown, tenantId: string): unknown {
    if (!payload || typeof payload !== 'object') {
      return { tenantId, data: payload }
    }

    const p = payload as Record<string, unknown>
    if (p.tenantId) return payload // Already has tenantId

    return { ...p, tenantId }
  }

  /**
   * Checks if a subject should be published based on the filter configuration.
   */
  function shouldPublish(subject: string): boolean {
    if (!publishFilter) return true

    if (publishIncludePatterns.length > 0) {
      if (!publishIncludePatterns.some((regex) => regex.test(subject))) return false
    }

    if (publishExcludePatterns.length > 0) {
      if (publishExcludePatterns.some((regex) => regex.test(subject))) return false
    }

    return true
  }

  /**
   * Checks if a subject should be subscribed to based on the filter configuration.
   */
  function shouldSubscribe(subject: string): boolean {
    if (!subscribeFilter) return false // Default: don't subscribe to anything unless explicitly included

    if (subscribeIncludePatterns.length > 0) {
      if (!subscribeIncludePatterns.some((regex) => regex.test(subject))) return false
    }

    if (subscribeExcludePatterns.length > 0) {
      if (subscribeExcludePatterns.some((regex) => regex.test(subject))) return false
    }

    return true
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
   * Create a Message object from a NATS message.
   */
  function createMessage<T>(
    subject: string,
    data: Uint8Array,
    natsMsg?: { headers?: NatsHeaders; reply?: string }
  ): Message<T> {
    const payload = sc ? JSON.parse(sc.decode(data)) : JSON.parse(new TextDecoder().decode(data))

    return {
      id: generateMessageId(),
      subject,
      payload,
      headers: extractHeaders(natsMsg ?? {}),
      metadata: {
        timestamp: new Date().toISOString(),
        replyTo: natsMsg?.reply,
        source: 'nats',
      },
    }
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
        // For JetStream, ack is handled differently
      },
      async nack(_options?: { requeue?: boolean }): Promise<void> {
        log(`NACK message on ${subject}`)
        // For JetStream, nak is handled differently
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
        // Strip tenant prefix and extract tenantId if present
        const stripped = stripTenantPrefix(msg.subject)
        const effectiveSubject = stripped ? stripped.subject : msg.subject

        // Parse payload and inject tenantId if stripped from subject
        let payload = sc ? JSON.parse(sc.decode(msg.data)) : JSON.parse(new TextDecoder().decode(msg.data))
        if (stripped) {
          payload = injectTenantId(payload, stripped.tenantId)
        }

        const message: Message<unknown> = {
          id: generateMessageId(),
          subject: effectiveSubject,
          payload,
          headers: extractHeaders(msg),
          metadata: {
            timestamp: new Date().toISOString(),
            replyTo: msg.reply,
            source: 'nats',
          },
        }

        const ctx = createContext(sub.id, effectiveSubject, msg)
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
        connectOptions.authenticator = nats.credsAuthenticator(
          await Bun?.file?.(options.credentials).text?.() ??
          (await import('node:fs/promises')).readFile(options.credentials, 'utf-8')
        )
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
      if (!shouldPublish(subject)) return ''

      // Apply tenant prefix if enabled
      const targetSubject = applyTenantPrefix(subject, payload)

      const data = sc
        ? sc.encode(JSON.stringify(payload))
        : new TextEncoder().encode(JSON.stringify(payload))

      // Add source header to identify messages from this app
      const headersWithSource = { ...options?.headers, [SOURCE_HEADER]: SOURCE_VALUE }
      const headers = createNatsHeaders(headersWithSource)

      // Use JetStream for persistent messages if available
      if (options?.persistent && js) {
        log(`Publishing to JetStream: ${targetSubject}`)
        const pubOpts: { msgID?: string; headers?: NatsHeaders } = {}
        if (options.deduplicationId) {
          pubOpts.msgID = options.deduplicationId
        }
        if (headers) {
          pubOpts.headers = headers
        }

        const ack = await js.publish(targetSubject, data, pubOpts)
        return ack.seq.toString()
      }

      // Regular NATS publish
      log(`Publishing to ${targetSubject}`)
      nc.publish(targetSubject, data, { headers })
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

      // Skip subscription if subject is filtered out
      if (!shouldSubscribe(subject)) {
        return {
          id: `skipped-${subject}`,
          subject,
          async unsubscribe(): Promise<void> {},
          async drain(): Promise<void> {},
        }
      }

      // When tenant prefix is enabled, subscribe with wildcard to catch tenant-prefixed messages
      // e.g., "customers.deal.created" → "*.customers.deal.created"
      const subscribeSubject = tenantPrefix ? `*.${subject}` : subject

      const id = generateSubscriptionId()
      log(`Subscribing to ${subscribeSubject} (id: ${id})`)

      // Create subscription options
      const subOpts: { queue?: string } = {}
      if (options?.queue) {
        subOpts.queue = options.queue
      }

      const natsSub = nc.subscribe(subscribeSubject, subOpts)

      const sub: InternalSubscription = {
        id,
        subject: subscribeSubject,
        natsSub,
        active: true,
      }

      subscriptions.set(id, sub)

      // Start processing messages
      sub.processLoop = processSubscription(sub, handler)

      return {
        id,
        subject: subscribeSubject,
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

      // Skip subscription if subject is filtered out
      if (!shouldSubscribe(subject)) {
        return {
          id: `skipped-${subject}`,
          subject,
          async unsubscribe(): Promise<void> {},
          async drain(): Promise<void> {},
        }
      }

      // When tenant prefix is enabled, subscribe with wildcard to catch tenant-prefixed messages
      const subscribeSubject = tenantPrefix ? `*.${subject}` : subject

      const id = generateSubscriptionId()
      log(`Reply handler for ${subscribeSubject} (id: ${id})`)

      // Create subscription options
      const subOpts: { queue?: string } = {}
      if (options?.queue) {
        subOpts.queue = options.queue
      }

      const natsSub = nc.subscribe(subscribeSubject, subOpts)

      const sub: InternalSubscription = {
        id,
        subject: subscribeSubject,
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
            // Strip tenant prefix and extract tenantId if present
            const stripped = stripTenantPrefix(msg.subject)
            const effectiveSubject = stripped ? stripped.subject : msg.subject

            // Parse payload and inject tenantId if stripped from subject
            let payload = sc ? JSON.parse(sc.decode(msg.data)) : JSON.parse(new TextDecoder().decode(msg.data))
            if (stripped) {
              payload = injectTenantId(payload, stripped.tenantId)
            }

            const message: Message<Req> = {
              id: generateMessageId(),
              subject: effectiveSubject,
              payload: payload as Req,
              headers: extractHeaders(msg),
              metadata: {
                timestamp: new Date().toISOString(),
                replyTo: msg.reply,
                source: 'nats',
              },
            }

            const ctx = createContext(id, effectiveSubject, msg)

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
        subject: subscribeSubject,
        async unsubscribe(): Promise<void> {
          sub.active = false
          natsSub.unsubscribe()
          subscriptions.delete(id)
          log(`Reply handler removed for ${subscribeSubject} (id: ${id})`)
        },
        async drain(): Promise<void> {
          sub.active = false
          await natsSub.drain()
          subscriptions.delete(id)
          log(`Reply handler drained for ${subscribeSubject} (id: ${id})`)
        },
      }
    },
  }
}
