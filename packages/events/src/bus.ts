import { createQueue } from '@open-mercato/queue'
import type { Queue } from '@open-mercato/queue'
import type { TransportDriver } from '@open-mercato/shared/lib/transport'
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
 */
export function createEventBus(opts: CreateBusOptions): EventBus {
  // In-memory listeners for immediate event delivery
  const listeners = new Map<string, Set<SubscriberHandler>>()

  // Lazy-resolved transport driver from DI (optional)
  let transportDriver: TransportDriver | null | undefined = undefined

  // Determine queue strategy from options or environment
  const queueStrategy = opts.queueStrategy ??
    (process.env.QUEUE_STRATEGY === 'async' ? 'async' : 'local')

  // Lazy-initialized queue for persistent events
  let queue: Queue<EventJobData> | null = null

  const debug = process.env.MESSAGING_DEBUG === 'true'

  /**
   * Lazily resolves the transport driver from DI.
   * Returns null if not registered (no external transport).
   */
  function getTransportDriver(): TransportDriver | null {
    if (transportDriver === undefined) {
      try {
        transportDriver = opts.resolve<TransportDriver>(DI_TOKENS.TRANSPORT_DRIVER)
        if (debug && transportDriver) {
          console.log(`[events] Transport driver resolved: ${transportDriver.id}`)
        }
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

    if (!driver) {
      return
    }

    if (!driver.isConnected()) {
      if (debug) {
        console.log(`[events] Transport driver not connected for "${event}" (driver: ${driver.id})`)
      }
      return
    }

    try {
      if (debug) {
        console.log(`[events] Forwarding to external transport: "${event}"`)
      }
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
    forwardToExternalTransport(event, payload).catch((error) => {
      console.warn(`[events] External transport error for "${event}":`, error)
    })
  }

  /**
   * Registers a handler for an event.
   */
  function on(event: string, handler: SubscriberHandler): void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(handler)
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
      off(event, wrappedHandler)
      await Promise.resolve(handler(payload, ctx))
    }

    on(event, wrappedHandler)

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
    emitEvent,
    on,
    once,
    registerModuleSubscribers,
    clearQueue,
  }
}
