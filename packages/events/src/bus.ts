import { createQueue } from '@open-mercato/queue'
import type { Queue } from '@open-mercato/queue'
import type { TransportDriver, TransportSubscription } from '@open-mercato/shared/lib/transport'
import { DI_TOKENS } from '@open-mercato/shared/lib/transport'
import type {
  EventBus,
  CreateBusOptions,
  SubscriberHandler,
  SubscriberDescriptor,
  EventPayload,
  EmitOptions,
} from './types'

/** Queue name for persistent events */
const EVENTS_QUEUE_NAME = 'events'

/** Job data structure for queued events */
type EventJobData = {
  event: string
  payload: EventPayload
}

/**
 * Creates an event bus instance.
 *
 * The event bus provides:
 * - In-memory event delivery to registered handlers (ALWAYS happens)
 * - Optional external transport forwarding via TransportDriver (additive layer)
 * - Optional persistence via the queue package when `persistent: true`
 *
 * External transport is resolved lazily from DI. If the messaging package
 * registers a TransportDriver, events will be forwarded externally in addition
 * to local delivery. Local delivery is never skipped or dependent on external systems.
 *
 * @param opts - Configuration options
 * @returns An EventBus instance
 *
 * @example
 * ```typescript
 * const bus = createEventBus({
 *   resolve: container.resolve.bind(container),
 *   queueStrategy: 'local', // or 'async' for BullMQ
 * })
 *
 * // Register a handler
 * bus.on('user.created', async (payload, ctx) => {
 *   const userService = ctx.resolve('userService')
 *   await userService.sendWelcomeEmail(payload.userId)
 * })
 *
 * // Emit an event (immediate local delivery + optional external forward)
 * await bus.emit('user.created', { userId: '123' })
 *
 * // Emit with persistence (for async worker processing)
 * await bus.emit('order.placed', { orderId: '456' }, { persistent: true })
 * ```
 */
export function createEventBus(opts: CreateBusOptions): EventBus {
  // In-memory listeners for immediate event delivery
  const listeners = new Map<string, Set<SubscriberHandler>>()

  // Lazy-resolved transport driver from DI (optional)
  let transportDriver: TransportDriver | null | undefined = undefined

  // Track transport subscriptions for cleanup
  const transportSubscriptions = new Map<string, TransportSubscription>()

  // Determine queue strategy from options or environment
  const queueStrategy = opts.queueStrategy ??
    (process.env.QUEUE_STRATEGY === 'async' ? 'async' : 'local')

  // Lazy-initialized queue for persistent events
  let queue: Queue<EventJobData> | null = null

  /**
   * Lazily resolves the transport driver from DI.
   * Returns null if not registered (no external transport).
   */
  function getTransportDriver(): TransportDriver | null {
    if (transportDriver === undefined) {
      try {
        transportDriver = opts.resolve<TransportDriver>(DI_TOKENS.TRANSPORT_DRIVER)
      } catch {
        // Not registered - no external transport available
        transportDriver = null
      }
    }
    return transportDriver
  }

  /**
   * Gets or creates the queue instance for persistent events.
   */
  function getQueue(): Queue<EventJobData> {
    if (!queue) {
      if (queueStrategy === 'async') {
        const redisUrl = process.env.REDIS_URL || process.env.QUEUE_REDIS_URL
        if (!redisUrl) {
          console.warn('[events] No REDIS_URL configured, falling back to localhost:6379')
        }
        queue = createQueue<EventJobData>(EVENTS_QUEUE_NAME, 'async', {
          connection: { url: redisUrl }
        })
      } else {
        queue = createQueue<EventJobData>(EVENTS_QUEUE_NAME, 'local')
      }
    }
    return queue
  }

  /**
   * Delivers an event to all registered in-memory handlers.
   * This is the PRIMARY delivery mechanism and always executes.
   */
  async function deliverToLocalHandlers(event: string, payload: EventPayload): Promise<void> {
    const handlers = listeners.get(event)
    if (!handlers || handlers.size === 0) return

    for (const handler of handlers) {
      try {
        await Promise.resolve(handler(payload, { resolve: opts.resolve }))
      } catch (error) {
        console.error(`[events] Handler error for "${event}":`, error)
      }
    }
  }

  /**
   * Forwards an event to the external transport system.
   * This is ADDITIVE - local delivery has already happened.
   * Errors are logged but don't affect the emit() result.
   */
  async function forwardToExternalTransport(event: string, payload: EventPayload): Promise<void> {
    const driver = getTransportDriver()
    if (!driver || !driver.isConnected()) return

    try {
      await driver.publish(event, payload)
    } catch (error) {
      // Log but don't fail - external forward is best-effort
      console.warn(`[events] External forward failed for "${event}":`, error)
    }
  }

  /**
   * Delivers an event to handlers.
   *
   * Delivery is ADDITIVE:
   * 1. ALWAYS deliver to local in-memory handlers (primary)
   * 2. ADDITIONALLY forward to external transport if available (secondary)
   *
   * External transport failures never affect local delivery.
   */
  async function deliver(event: string, payload: EventPayload): Promise<void> {
    // PRIMARY: Always deliver to local handlers first
    await deliverToLocalHandlers(event, payload)

    // SECONDARY: Additionally forward to external transport (fire-and-forget)
    // This is async but we don't await to avoid blocking
    forwardToExternalTransport(event, payload).catch((error) => {
      console.warn(`[events] External transport error for "${event}":`, error)
    })
  }

  /**
   * Sets up an inbound subscription from external transport.
   * When messages arrive from external systems, they are delivered to local handlers.
   */
  async function setupExternalSubscription(event: string): Promise<void> {
    const driver = getTransportDriver()
    if (!driver || !driver.isConnected()) return
    if (transportSubscriptions.has(event)) return

    try {
      const subscription = await driver.subscribe(event, async (msg) => {
        // Deliver external messages to local handlers
        await deliverToLocalHandlers(event, msg.payload)
      })
      transportSubscriptions.set(event, subscription)
    } catch (error) {
      console.error(`[events] External subscribe error for "${event}":`, error)
    }
  }

  /**
   * Registers a handler for an event.
   * When a transport driver is available, also sets up external subscription
   * to receive messages from external systems.
   */
  function on(event: string, handler: SubscriberHandler): void {
    // Always register in local listeners map
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(handler)

    // Set up external subscription if transport is available
    // This is async but we don't await - subscription setup happens in background
    setupExternalSubscription(event).catch((error) => {
      console.warn(`[events] Failed to setup external subscription for "${event}":`, error)
    })
  }

  /**
   * Removes a handler from an event.
   */
  function off(event: string, handler: SubscriberHandler): void {
    const handlers = listeners.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        listeners.delete(event)
      }
    }
  }

  /**
   * Registers a one-time handler for an event.
   * The handler is automatically removed after the first invocation.
   *
   * @returns A function to manually unsubscribe before the event fires
   */
  function once(event: string, handler: SubscriberHandler): () => void {
    const wrappedHandler: SubscriberHandler = async (payload, ctx) => {
      // Remove handler before invoking to prevent re-entrancy issues
      off(event, wrappedHandler)
      await Promise.resolve(handler(payload, ctx))
    }

    on(event, wrappedHandler)

    // Return unsubscribe function
    return () => off(event, wrappedHandler)
  }

  /**
   * Registers multiple module subscribers at once.
   */
  function registerModuleSubscribers(subs: SubscriberDescriptor[]): void {
    for (const sub of subs) {
      on(sub.event, sub.handler)
    }
  }

  /**
   * Emits an event to all registered handlers.
   *
   * If `persistent: true`, also enqueues the event for async processing.
   */
  async function emit(
    event: string,
    payload: EventPayload,
    options?: EmitOptions
  ): Promise<void> {
    // Deliver to local handlers + forward to external transport
    await deliver(event, payload)

    // If persistent, also enqueue for async processing
    if (options?.persistent) {
      const q = getQueue()
      await q.enqueue({ event, payload })
    }
  }

  /**
   * Clears all events from the persistent queue.
   */
  async function clearQueue(): Promise<{ removed: number }> {
    const q = getQueue()
    return q.clear()
  }

  // Backward compatibility alias
  const emitEvent = emit

  return {
    emit,
    emitEvent, // Alias for backward compatibility
    on,
    once,
    registerModuleSubscribers,
    clearQueue,
  }
}
