import { createQueue } from '@open-mercato/queue'
import type { Queue } from '@open-mercato/queue'
import type { MessagingDriver, Subscription } from '@open-mercato/messaging'
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
 * - In-memory event delivery to registered handlers
 * - Optional persistence via the queue package when `persistent: true`
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
 * // Emit an event (immediate delivery)
 * await bus.emit('user.created', { userId: '123' })
 *
 * // Emit with persistence (for async worker processing)
 * await bus.emit('order.placed', { orderId: '456' }, { persistent: true })
 * ```
 */
export function createEventBus(opts: CreateBusOptions): EventBus {
  // In-memory listeners for immediate event delivery
  const listeners = new Map<string, Set<SubscriberHandler>>()

  // Optional external messaging driver for two-way communication
  const driver: MessagingDriver | undefined = opts.driver

  // Track driver subscriptions for cleanup
  const driverSubscriptions = new Map<string, Subscription>()

  // Determine queue strategy from options or environment
  const queueStrategy = opts.queueStrategy ??
    (process.env.QUEUE_STRATEGY === 'async' ? 'async' : 'local')

  // Lazy-initialized queue for persistent events
  let queue: Queue<EventJobData> | null = null

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
   * When a driver is configured, this is called by the driver subscription handler.
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
   * Delivers an event to handlers.
   * When a driver is configured, publishes to the driver (which handles external + internal delivery).
   * Otherwise, delivers directly to in-memory handlers.
   */
  async function deliver(event: string, payload: EventPayload): Promise<void> {
    if (driver) {
      // When using a driver, publish to the messaging system.
      // Local handlers receive the event via driver subscription (set up in `on()`).
      try {
        await driver.publish(event, payload)
      } catch (error) {
        console.error(`[events] Driver publish error for "${event}":`, error)
        // Fall back to local delivery on driver failure
        await deliverToLocalHandlers(event, payload)
      }
      return
    }

    // Default: in-memory delivery only
    await deliverToLocalHandlers(event, payload)
  }

  /**
   * Registers a handler for an event.
   * When a driver is configured, also subscribes via the driver to receive
   * messages from external systems.
   */
  function on(event: string, handler: SubscriberHandler): void {
    // Always register in local listeners map
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(handler)

    // When using a driver, set up a subscription if not already done for this event
    if (driver && !driverSubscriptions.has(event)) {
      // Subscribe to the driver asynchronously
      driver
        .subscribe(event, async (msg) => {
          // Deliver to all local handlers for this event
          await deliverToLocalHandlers(event, msg.payload)
        })
        .then((subscription) => {
          driverSubscriptions.set(event, subscription)
        })
        .catch((error) => {
          console.error(`[events] Driver subscribe error for "${event}":`, error)
        })
    }
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
    // Always deliver to in-memory handlers first
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
