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
 * Extended NATS driver interface with JetStream access.
 *
 * This interface extends MessagingDriver to expose JetStream-specific
 * functionality needed by the async inbound consumer.
 */
export interface NatsDriverExtended extends MessagingDriver {
  /**
   * Get the JetStream client for advanced stream operations.
   * Returns null if JetStream is not enabled or not connected.
   */
  getJetStream(): JetStreamClient | null

  /**
   * Get the JetStream manager for stream/consumer management.
   * Returns null if JetStream is not enabled or not connected.
   */
  getJetStreamManager(): JetStreamManager | null

  /**
   * Get the underlying NATS connection.
   * Returns null if not connected.
   */
  getConnection(): NatsConnection | null

  /**
   * Get the string codec for encoding/decoding messages.
   * Returns null if not connected.
   */
  getStringCodec(): StringCodec | null
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
export function createNatsDriver(options?: NatsDriverOptions): NatsDriverExtended {
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
   * Extracts tenant ID from payload for multi-tenant subject prefixing.
   * 
   * For multi-tenancy isolation, NATS subjects are automatically prefixed with tenant ID:
   * - Event: "customers.people.created" + tenantId: "tenant-a"
   * - NATS subject: "tenant-a.customers.people.created"
   * 
   * This provides complete tenant isolation at the messaging layer without
   * requiring any changes to the event bus or application code.
   * 
   * @param payload - The message payload to extract tenant ID from
   * @returns The tenant ID if found, null otherwise
   */
  function extractTenantId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null
    }

    const obj = payload as Record<string, unknown>
    
    // Modern field: tenantId
    if (typeof obj.tenantId === 'string' && obj.tenantId) {
      return obj.tenantId
    }

    // Legacy field: tenant_id
    if (typeof obj.tenant_id === 'string' && obj.tenant_id) {
      return obj.tenant_id
    }

    return null
  }

  /**
   * Builds a tenant-prefixed subject for multi-tenant isolation.
   * 
   * If a tenant ID is present in the payload, the subject is prefixed with "events."
   * namespace followed by the tenant ID to ensure complete isolation at the NATS level.
   * This allows external subscribers to filter events by tenant without receiving
   * other tenants' data, and avoids overlap with NATS system subjects.
   * 
   * Examples:
   * - With tenant: subject="customers.people.created", tenantId="acme-corp"
   *   → "events.acme-corp.customers.people.created"
   * 
   * - Without tenant: subject="system.startup"
   *   → "system.startup" (unchanged - system events don't need events prefix)
   * 
   * @param subject - The base subject (event name)
   * @param payload - The message payload
   * @returns The prefixed subject for NATS
   */
  function buildTenantPrefixedSubject(subject: string, payload: unknown): string {
    const tenantId = extractTenantId(payload)
    return tenantId ? `events.${tenantId}.${subject}` : subject
  }

  /**
   * Strips the events prefix and tenant prefix from a NATS subject to get the internal event name.
   * 
   * This is the inverse of buildTenantPrefixedSubject for inbound message processing.
   * 
   * Examples:
   * - "events.tenant-123.fms_locations.fms_location.created" → "fms_locations.fms_location.created"
   * - "events.acme-corp.customers.people.created" → "customers.people.created"
   * - "system.startup" → "system.startup" (unchanged if no events prefix)
   * 
   * @param natsSubject - The full NATS subject with potential events and tenant prefix
   * @returns The internal subject without prefixes
   */
  function stripTenantPrefix(natsSubject: string): string {
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

        // Strip tenant prefix from NATS subject to get internal event name
        // NATS: "tenant-123.fms_locations.fms_location.created"
        // Internal: "fms_locations.fms_location.created"
        const internalSubject = stripTenantPrefix(msg.subject)

        const message: Message<unknown> = {
          id: generateMessageId(),
          subject: internalSubject,
          payload,
          headers: extractHeaders(msg),
          metadata: {
            timestamp: new Date().toISOString(),
            replyTo: msg.reply,
            source: 'nats',
          },
        }

        const ctx = createContext(sub.id, internalSubject, msg)
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

      // Build tenant-prefixed subject for multi-tenant isolation
      // This is transparent to the event bus - tenant ID is automatically
      // extracted from payload and used to prefix the NATS subject
      const natsSubject = buildTenantPrefixedSubject(subject, payload)

      const data = sc
        ? sc.encode(JSON.stringify(payload))
        : new TextEncoder().encode(JSON.stringify(payload))

      // Add source header to identify messages from this app
      const headersWithSource = { ...options?.headers, [SOURCE_HEADER]: SOURCE_VALUE }
      const headers = createNatsHeaders(headersWithSource)

      // Use JetStream for persistent messages if available
      if (options?.persistent && js) {
        log(`Publishing to JetStream: ${natsSubject}`)
        const pubOpts: { msgID?: string; headers?: NatsHeaders } = {}
        if (options.deduplicationId) {
          pubOpts.msgID = options.deduplicationId
        }
        if (headers) {
          pubOpts.headers = headers
        }

        const ack = await js.publish(natsSubject, data, pubOpts)
        return ack.seq.toString()
      }

      // Regular NATS publish
      log(`Publishing to ${natsSubject}`)
      nc.publish(natsSubject, data, { headers })
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
      
      // Wrap subject with events prefix and tenant wildcard to match tenant-prefixed messages
      // Internal subject: "fms_locations.fms_location.*"
      // NATS subject: "events.*.fms_locations.fms_location.*" (matches any tenant under events namespace)
      const natsSubject = `events.*.${subject}`
      
      log(`Subscribing to ${subject} (NATS pattern: ${natsSubject}, id: ${id})`)

      // Create subscription options
      const subOpts: { queue?: string } = {}
      if (options?.queue) {
        subOpts.queue = options.queue
      }

      const natsSub = nc.subscribe(natsSubject, subOpts)

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

    // Extended methods for JetStream access

    getJetStream(): JetStreamClient | null {
      return js
    },

    getJetStreamManager(): JetStreamManager | null {
      return jsm
    },

    getConnection(): NatsConnection | null {
      return nc
    },

    getStringCodec(): StringCodec | null {
      return sc
    },
  }
}
