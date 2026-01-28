/**
 * In-Memory Messaging Driver
 *
 * A simple in-memory implementation of the MessagingDriver interface
 * for testing and development purposes. Supports all messaging patterns
 * including pub/sub, request-reply, and subscriptions.
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
  MemoryDriverOptions,
} from '../../types'

/** Internal subscription representation */
type InternalSubscription = {
  id: string
  subject: string
  handler: MessageHandler
  options?: SubscribeOptions
  active: boolean
}

/** Internal reply handler representation */
type InternalReplyHandler = {
  id: string
  subject: string
  handler: ReplyHandler<unknown, unknown>
  options?: SubscribeOptions
  active: boolean
}

/**
 * Creates an in-memory messaging driver for testing.
 *
 * @param options - Driver configuration options
 * @returns A MessagingDriver instance
 *
 * @example
 * ```typescript
 * const driver = createMemoryDriver()
 * await driver.connect()
 *
 * // Subscribe to messages
 * await driver.subscribe('orders.*', async (msg) => {
 *   console.log('Received:', msg.payload)
 * })
 *
 * // Publish a message
 * await driver.publish('orders.created', { orderId: '123' })
 * ```
 */
export function createMemoryDriver(options?: MemoryDriverOptions): MessagingDriver {
  const debug = options?.debug ?? false
  const latency = options?.latency ?? 0

  // Subscription storage
  const subscriptions = new Map<string, InternalSubscription>()
  const replyHandlers = new Map<string, InternalReplyHandler>()

  // Pending requests for request-reply pattern
  const pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >()

  let connected = false
  let subscriptionCounter = 0

  /**
   * Generate a unique message ID.
   */
  function generateMessageId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * Generate a unique subscription ID.
   */
  function generateSubscriptionId(): string {
    return `sub-${++subscriptionCounter}`
  }

  /**
   * Check if a subject matches a pattern (supports * and > wildcards).
   * - `*` matches a single token
   * - `>` matches one or more tokens (only at end)
   */
  function subjectMatches(pattern: string, subject: string): boolean {
    const patternParts = pattern.split('.')
    const subjectParts = subject.split('.')

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]

      if (patternPart === '>') {
        // '>' matches rest of the subject
        return i < subjectParts.length
      }

      if (patternPart === '*') {
        // '*' matches exactly one token
        if (i >= subjectParts.length) return false
        continue
      }

      // Exact match required
      if (patternPart !== subjectParts[i]) return false
    }

    // All pattern parts matched, check subject length
    return patternParts.length === subjectParts.length
  }

  /**
   * Find all subscriptions that match a subject.
   */
  function findMatchingSubscriptions(subject: string): InternalSubscription[] {
    const matches: InternalSubscription[] = []
    for (const sub of subscriptions.values()) {
      if (sub.active && subjectMatches(sub.subject, subject)) {
        matches.push(sub)
      }
    }
    return matches
  }

  /**
   * Find all reply handlers that match a subject.
   */
  function findMatchingReplyHandlers(subject: string): InternalReplyHandler[] {
    const matches: InternalReplyHandler[] = []
    for (const handler of replyHandlers.values()) {
      if (handler.active && subjectMatches(handler.subject, subject)) {
        matches.push(handler)
      }
    }
    return matches
  }

  /**
   * Create a message object.
   */
  function createMessage<T>(
    subject: string,
    payload: T,
    options?: PublishOptions
  ): Message<T> {
    return {
      id: generateMessageId(),
      subject,
      payload,
      headers: options?.headers,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: options?.correlationId,
        source: 'memory',
      },
    }
  }

  /**
   * Create a message context.
   */
  function createContext(
    subscriptionId: string,
    message: Message<unknown>,
    replyFn?: (payload: unknown) => Promise<void>
  ): MessageContext {
    return {
      driver: 'memory',
      subscription: subscriptionId,
      ack: async () => {
        if (debug) console.log(`[memory] ACK message ${message.id}`)
      },
      nack: async (_options?: { requeue?: boolean }) => {
        if (debug) console.log(`[memory] NACK message ${message.id}`)
      },
      reply: replyFn ?? (async () => {
        throw new Error('No reply function available for this message')
      }),
    }
  }

  /**
   * Simulate network latency if configured.
   */
  async function simulateLatency(): Promise<void> {
    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency))
    }
  }

  /**
   * Deliver a message to matching subscribers.
   */
  async function deliver(message: Message<unknown>): Promise<void> {
    await simulateLatency()

    const matches = findMatchingSubscriptions(message.subject)
    if (debug) {
      console.log(`[memory] Delivering to ${matches.length} subscribers: ${message.subject}`)
    }

    // Deliver to all matching subscriptions
    for (const sub of matches) {
      try {
        const ctx = createContext(sub.id, message)
        await Promise.resolve(sub.handler(message, ctx))
      } catch (error) {
        console.error(`[memory] Handler error for subscription ${sub.id}:`, error)
      }
    }
  }

  return {
    id: 'memory',
    name: 'In-Memory (Testing)',

    async connect(): Promise<void> {
      if (debug) console.log('[memory] Connecting...')
      await simulateLatency()
      connected = true
      if (debug) console.log('[memory] Connected')
    },

    async disconnect(): Promise<void> {
      if (debug) console.log('[memory] Disconnecting...')

      // Clear all subscriptions
      for (const sub of subscriptions.values()) {
        sub.active = false
      }
      subscriptions.clear()

      // Clear all reply handlers
      for (const handler of replyHandlers.values()) {
        handler.active = false
      }
      replyHandlers.clear()

      // Reject all pending requests
      for (const [correlationId, pending] of pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Driver disconnected'))
        pendingRequests.delete(correlationId)
      }

      connected = false
      if (debug) console.log('[memory] Disconnected')
    },

    isConnected(): boolean {
      return connected
    },

    async isHealthy(): Promise<boolean> {
      return connected
    },

    async publish(
      subject: string,
      payload: unknown,
      options?: PublishOptions
    ): Promise<string> {
      if (!connected) {
        throw new Error('Driver not connected')
      }

      const message = createMessage(subject, payload, options)
      if (debug) console.log(`[memory] Publishing to ${subject}:`, payload)

      // Deliver asynchronously
      setImmediate(() => {
        deliver(message).catch((err) => {
          console.error('[memory] Delivery error:', err)
        })
      })

      return message.id
    },

    async request<Req, Resp>(
      subject: string,
      payload: Req,
      options?: RequestOptions
    ): Promise<Resp> {
      if (!connected) {
        throw new Error('Driver not connected')
      }

      await simulateLatency()

      const correlationId = generateMessageId()
      const timeout = options?.timeout ?? 30000

      // Find reply handler
      const handlers = findMatchingReplyHandlers(subject)
      if (handlers.length === 0) {
        throw new Error(`No reply handler for subject: ${subject}`)
      }

      if (debug) {
        console.log(`[memory] Request to ${subject} (timeout: ${timeout}ms):`, payload)
      }

      // Create message
      const message = createMessage(subject, payload, {
        correlationId,
        headers: options?.headers,
      })

      // Use the first matching handler
      const handler = handlers[0]

      return new Promise<Resp>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(correlationId)
          reject(new Error(`Request timeout after ${timeout}ms`))
        }, timeout)

        pendingRequests.set(correlationId, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timeout: timeoutId,
        })

        // Execute handler
        const ctx = createContext(handler.id, message, async (response) => {
          const pending = pendingRequests.get(correlationId)
          if (pending) {
            clearTimeout(pending.timeout)
            pendingRequests.delete(correlationId)
            pending.resolve(response)
          }
        })

        Promise.resolve(handler.handler(message, ctx))
          .then((response) => {
            // Handler returned a value directly
            const pending = pendingRequests.get(correlationId)
            if (pending) {
              clearTimeout(pending.timeout)
              pendingRequests.delete(correlationId)
              pending.resolve(response)
            }
          })
          .catch((error) => {
            const pending = pendingRequests.get(correlationId)
            if (pending) {
              clearTimeout(pending.timeout)
              pendingRequests.delete(correlationId)
              pending.reject(error)
            }
          })
      })
    },

    async subscribe(
      subject: string,
      handler: MessageHandler,
      options?: SubscribeOptions
    ): Promise<Subscription> {
      if (!connected) {
        throw new Error('Driver not connected')
      }

      const id = generateSubscriptionId()
      const subscription: InternalSubscription = {
        id,
        subject,
        handler,
        options,
        active: true,
      }

      subscriptions.set(id, subscription)
      if (debug) console.log(`[memory] Subscribed to ${subject} (id: ${id})`)

      return {
        id,
        subject,
        async unsubscribe(): Promise<void> {
          subscription.active = false
          subscriptions.delete(id)
          if (debug) console.log(`[memory] Unsubscribed from ${subject} (id: ${id})`)
        },
        async drain(): Promise<void> {
          // In memory driver, drain is same as unsubscribe
          subscription.active = false
          subscriptions.delete(id)
          if (debug) console.log(`[memory] Drained subscription ${subject} (id: ${id})`)
        },
      }
    },

    async reply<Req, Resp>(
      subject: string,
      handler: ReplyHandler<Req, Resp>,
      options?: SubscribeOptions
    ): Promise<Subscription> {
      if (!connected) {
        throw new Error('Driver not connected')
      }

      const id = generateSubscriptionId()
      const replyHandler: InternalReplyHandler = {
        id,
        subject,
        handler: handler as ReplyHandler<unknown, unknown>,
        options,
        active: true,
      }

      replyHandlers.set(id, replyHandler)
      if (debug) console.log(`[memory] Reply handler registered for ${subject} (id: ${id})`)

      return {
        id,
        subject,
        async unsubscribe(): Promise<void> {
          replyHandler.active = false
          replyHandlers.delete(id)
          if (debug) console.log(`[memory] Reply handler removed for ${subject} (id: ${id})`)
        },
        async drain(): Promise<void> {
          replyHandler.active = false
          replyHandlers.delete(id)
          if (debug) console.log(`[memory] Reply handler drained for ${subject} (id: ${id})`)
        },
      }
    },
  }
}
