/**
 * Event Bus Bridge
 *
 * Provides bidirectional bridging between the internal EventBus and
 * external messaging systems (NATS, Kafka, etc.). Supports:
 * - Inbound: External messages → Internal events
 * - Outbound: Internal events → External messages
 * - Request-reply: External request → Internal processing → External response
 */

import type { EventBus } from '@open-mercato/events'
import type {
  MessagingService,
  MessagingDriverId,
  Message,
  Subscription,
  SubscribeOptions,
} from './types'

/** Options for bridge operations */
export interface BridgeOptions {
  /** Target a specific messaging driver */
  driver?: MessagingDriverId
  /** Transform the payload during bridging */
  transform?: (payload: unknown) => unknown
}

/** Options for request-reply bridging */
export interface RequestReplyBridgeOptions extends BridgeOptions {
  /** Timeout for internal processing (ms) */
  timeout?: number
}

/**
 * Creates an EventBus bridge for connecting internal events to external messaging.
 *
 * @param eventBus - The internal event bus
 * @param messagingService - The messaging service for external communication
 * @returns An EventBusBridge instance
 *
 * @example
 * ```typescript
 * const bridge = createEventBusBridge(eventBus, messagingService)
 *
 * // Inbound: External messages → Internal events
 * await bridge.bridgeInbound('erp.orders.*', 'sales.order.external')
 *
 * // Outbound: Internal events → External messages
 * bridge.bridgeOutbound('sales.order.created', 'orders.new')
 *
 * // Request-reply: External request → Internal processing → Response
 * await bridge.bridgeRequestReply('pricing.calculate', 'catalog.price.request')
 * ```
 */
export function createEventBusBridge(
  eventBus: EventBus,
  messagingService: MessagingService
): EventBusBridge {
  // Track active subscriptions for cleanup
  const activeSubscriptions: Subscription[] = []
  const outboundUnsubscribers: Array<() => void> = []

  return {
    async bridgeInbound(
      subject: string,
      eventName: string,
      options?: BridgeOptions & SubscribeOptions
    ): Promise<Subscription> {
      const subscription = await messagingService.subscribe(
        subject,
        async (msg) => {
          const payload = options?.transform ? options.transform(msg.payload) : msg.payload
          await eventBus.emit(eventName, payload, { persistent: true })
        },
        options
      )

      activeSubscriptions.push(subscription)
      return subscription
    },

    bridgeOutbound(
      eventName: string,
      subject: string,
      options?: BridgeOptions
    ): void {
      const handler = async (payload: unknown) => {
        const data = options?.transform ? options.transform(payload) : payload
        await messagingService.publish(subject, data, { driver: options?.driver })
      }

      eventBus.on(eventName, handler)

      // Track for cleanup (we can't easily unregister from EventBus currently)
      outboundUnsubscribers.push(() => {
        // Note: EventBus doesn't support off() yet, so this is a placeholder
      })
    },

    async bridgeRequestReply(
      subject: string,
      eventName: string,
      options?: RequestReplyBridgeOptions & SubscribeOptions
    ): Promise<Subscription> {
      const timeout = options?.timeout ?? 30000

      const subscription = await messagingService.reply(
        subject,
        async (msg) => {
          const correlationId = msg.metadata.correlationId ?? generateCorrelationId()
          const payload = options?.transform ? options.transform(msg.payload) : msg.payload

          return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error(`Bridge timeout after ${timeout}ms`))
            }, timeout)

            // Listen for response event
            const responseEvent = `${eventName}.response`

            // Use once() if available, otherwise use on() with manual cleanup
            const eventBusWithOnce = eventBus as EventBus & {
              once?: (event: string, handler: (payload: unknown) => void) => () => void
            }

            if (typeof eventBusWithOnce.once === 'function') {
              const unsubscribe = eventBusWithOnce.once(responseEvent, (response: unknown) => {
                const resp = response as { correlationId?: string; payload?: unknown }
                if (resp.correlationId === correlationId) {
                  clearTimeout(timeoutId)
                  resolve(resp.payload)
                }
              })

              // Emit the request event
              eventBus.emit(eventName, { ...payload as object, correlationId })
                .catch((err) => {
                  clearTimeout(timeoutId)
                  unsubscribe()
                  reject(err)
                })
            } else {
              // Fallback: use regular on() with correlation check
              let handled = false
              const handler = (response: unknown) => {
                if (handled) return
                const resp = response as { correlationId?: string; payload?: unknown }
                if (resp.correlationId === correlationId) {
                  handled = true
                  clearTimeout(timeoutId)
                  resolve(resp.payload)
                }
              }

              eventBus.on(responseEvent, handler)

              // Emit the request event
              eventBus.emit(eventName, { ...payload as object, correlationId })
                .catch((err) => {
                  clearTimeout(timeoutId)
                  reject(err)
                })
            }
          })
        },
        options
      )

      activeSubscriptions.push(subscription)
      return subscription
    },

    async cleanup(): Promise<void> {
      // Unsubscribe from all active subscriptions
      for (const subscription of activeSubscriptions) {
        try {
          await subscription.unsubscribe()
        } catch {
          // Ignore unsubscribe errors
        }
      }
      activeSubscriptions.length = 0

      // Call outbound unsubscribers
      for (const unsubscribe of outboundUnsubscribers) {
        try {
          unsubscribe()
        } catch {
          // Ignore errors
        }
      }
      outboundUnsubscribers.length = 0
    },
  }
}

/**
 * EventBusBridge interface.
 */
export interface EventBusBridge {
  /**
   * Bridge external messages to internal events.
   *
   * When a message is received on the external subject, it will be
   * emitted as an internal event via the EventBus.
   *
   * @param subject - External subject pattern to subscribe to
   * @param eventName - Internal event name to emit
   * @param options - Bridge and subscription options
   * @returns The subscription handle
   */
  bridgeInbound(
    subject: string,
    eventName: string,
    options?: BridgeOptions & SubscribeOptions
  ): Promise<Subscription>

  /**
   * Bridge internal events to external messages.
   *
   * When an internal event is emitted, it will be published to the
   * external messaging system.
   *
   * @param eventName - Internal event name to listen for
   * @param subject - External subject to publish to
   * @param options - Bridge options
   */
  bridgeOutbound(
    eventName: string,
    subject: string,
    options?: BridgeOptions
  ): void

  /**
   * Bridge external requests to internal processing with responses.
   *
   * External systems can send requests that trigger internal processing.
   * The response is sent back to the external system.
   *
   * Flow:
   * 1. External request arrives on `subject`
   * 2. Internal event `eventName` is emitted with correlationId
   * 3. Internal subscriber processes and emits `eventName.response`
   * 4. Response is sent back to external requester
   *
   * @param subject - External subject for requests
   * @param eventName - Internal event name for processing
   * @param options - Bridge and timeout options
   * @returns The subscription handle
   */
  bridgeRequestReply(
    subject: string,
    eventName: string,
    options?: RequestReplyBridgeOptions & SubscribeOptions
  ): Promise<Subscription>

  /**
   * Clean up all active bridges and subscriptions.
   */
  cleanup(): Promise<void>
}

/**
 * Generate a unique correlation ID.
 */
function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Class-based EventBusBridge for direct instantiation.
 */
export class EventBusBridgeClass implements EventBusBridge {
  private readonly bridge: EventBusBridge

  constructor(eventBus: EventBus, messagingService: MessagingService) {
    this.bridge = createEventBusBridge(eventBus, messagingService)
  }

  bridgeInbound(
    subject: string,
    eventName: string,
    options?: BridgeOptions & SubscribeOptions
  ): Promise<Subscription> {
    return this.bridge.bridgeInbound(subject, eventName, options)
  }

  bridgeOutbound(eventName: string, subject: string, options?: BridgeOptions): void {
    this.bridge.bridgeOutbound(eventName, subject, options)
  }

  bridgeRequestReply(
    subject: string,
    eventName: string,
    options?: RequestReplyBridgeOptions & SubscribeOptions
  ): Promise<Subscription> {
    return this.bridge.bridgeRequestReply(subject, eventName, options)
  }

  cleanup(): Promise<void> {
    return this.bridge.cleanup()
  }
}
