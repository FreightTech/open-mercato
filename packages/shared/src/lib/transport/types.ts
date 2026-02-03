/**
 * Abstract Transport Driver Interface
 *
 * Defines a minimal, package-agnostic interface for external messaging transport.
 * This allows the events package to forward events to external systems without
 * directly depending on the messaging package.
 *
 * The messaging package implements this interface and registers via DI.
 * The events package resolves it lazily and uses it for additive forwarding.
 */

/**
 * Represents an active transport subscription.
 */
export interface TransportSubscription {
  /** Unique subscription identifier */
  id: string
  /** Subject pattern being subscribed to */
  subject: string
  /** Unsubscribe and stop receiving messages */
  unsubscribe(): Promise<void>
  /** Process pending messages then unsubscribe */
  drain(): Promise<void>
}

/**
 * Message structure for transport operations.
 */
export interface TransportMessage<T = unknown> {
  /** Unique message identifier */
  id: string
  /** Subject/topic the message was published to */
  subject: string
  /** Message payload */
  payload: T
  /** Optional headers for metadata */
  headers?: Record<string, string>
  /** Message metadata */
  metadata: {
    /** ISO timestamp when message was created */
    timestamp: string
    /** Correlation ID for request-response patterns */
    correlationId?: string
    /** Reply-to subject for responses */
    replyTo?: string
  }
}

/**
 * Handler function for transport messages.
 */
export type TransportMessageHandler<T = unknown> = (
  message: TransportMessage<T>
) => Promise<void> | void

/**
 * Abstract transport driver interface.
 *
 * This is a minimal subset of MessagingDriver that the events package needs
 * for additive external forwarding. It does not include request-reply or
 * advanced subscription options.
 */
export interface TransportDriver {
  /** Unique identifier for this driver */
  readonly id: string
  /** Human-readable name */
  readonly name: string

  // Lifecycle
  /** Establish connection to the transport system */
  connect(): Promise<void>
  /** Gracefully disconnect */
  disconnect(): Promise<void>
  /** Check if currently connected */
  isConnected(): boolean
  /** Health check for the transport system */
  isHealthy(): Promise<boolean>

  // One-way messaging (fire-and-forget)
  /**
   * Publish a message to a subject.
   * @returns Message ID or sequence number
   */
  publish(subject: string, payload: unknown, options?: Record<string, unknown>): Promise<string>

  // Subscriptions (inbound messages)
  /**
   * Subscribe to messages on a subject pattern.
   * @returns Subscription handle for management
   */
  subscribe(
    subject: string,
    handler: TransportMessageHandler,
    options?: Record<string, unknown>
  ): Promise<TransportSubscription>
}

/**
 * DI tokens for transport-related services.
 */
export const DI_TOKENS = {
  /** Token for the transport driver (optional, registered by messaging package) */
  TRANSPORT_DRIVER: 'transportDriver',
} as const
