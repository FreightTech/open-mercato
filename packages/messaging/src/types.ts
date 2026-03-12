/**
 * Messaging Package Type Definitions
 *
 * Provides type-safe abstractions for pluggable messaging drivers
 * that enable two-way communication with external systems (NATS, Kafka, etc.).
 */

// ============================================================================
// Driver Types
// ============================================================================

/** Available messaging driver types */
export type MessagingDriverId = 'nats' | 'kafka' | 'redis-streams' | 'memory' | (string & {})

/** Message structure for all messaging operations */
export interface Message<T = unknown> {
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
    /** Source driver ID */
    source?: MessagingDriverId
  }
}

/** Context provided to message handlers */
export interface MessageContext {
  /** Driver that received the message */
  driver: MessagingDriverId
  /** Subscription identifier */
  subscription: string
  /** Acknowledge message processing */
  ack(): Promise<void>
  /** Negative acknowledge (requeue or discard) */
  nack(options?: { requeue?: boolean }): Promise<void>
  /** Reply to a request message */
  reply<T>(payload: T): Promise<void>
}

/** Handler function for subscribed messages */
export type MessageHandler<T = unknown> = (
  message: Message<T>,
  ctx: MessageContext
) => Promise<void> | void

/** Handler function for request-reply patterns */
export type ReplyHandler<Req, Resp> = (
  message: Message<Req>,
  ctx: MessageContext
) => Promise<Resp>

// ============================================================================
// Options Types
// ============================================================================

/** Options for publishing messages */
export interface PublishOptions {
  /** Custom headers to include */
  headers?: Record<string, string>
  /** Correlation ID for tracking */
  correlationId?: string
  /** Persist to stream/queue for durability */
  persistent?: boolean
  /** Deduplication ID for exactly-once semantics */
  deduplicationId?: string
}

/** Options for request-response operations */
export interface RequestOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Custom headers to include */
  headers?: Record<string, string>
}

/** Start position for subscriptions */
export type StartFrom =
  | 'beginning'
  | 'end'
  | 'last'
  | { sequence: number }
  | { time: Date }

/** Options for creating subscriptions */
export interface SubscribeOptions {
  /** Queue group name for load balancing */
  queue?: string
  /** Durable subscription name for persistence */
  durable?: string
  /** Where to start consuming messages */
  startFrom?: StartFrom
  /** Maximum concurrent message processing */
  maxInFlight?: number
  /** Time to wait for acknowledgment before redelivery (ms) */
  ackWait?: number
}

/** Represents an active subscription */
export interface Subscription {
  /** Unique subscription identifier */
  id: string
  /** Subject pattern being subscribed to */
  subject: string
  /** Unsubscribe and stop receiving messages */
  unsubscribe(): Promise<void>
  /** Process pending messages then unsubscribe */
  drain(): Promise<void>
}

// ============================================================================
// Driver Interface
// ============================================================================

/**
 * Main interface that all messaging drivers must implement.
 *
 * Drivers provide a unified abstraction over different messaging systems
 * (NATS, Kafka, Redis Streams, etc.) for:
 * - One-way messaging (fire-and-forget publish)
 * - Request-response patterns (bidirectional)
 * - Subscriptions (inbound message handling)
 */
export interface MessagingDriver {
  /** Unique identifier for this driver */
  readonly id: MessagingDriverId
  /** Human-readable name */
  readonly name: string

  // Lifecycle
  /** Establish connection to the messaging system */
  connect(): Promise<void>
  /** Gracefully disconnect */
  disconnect(): Promise<void>
  /** Check if currently connected */
  isConnected(): boolean
  /** Health check for the messaging system */
  isHealthy(): Promise<boolean>

  // One-way messaging (fire-and-forget)
  /**
   * Publish a message to a subject.
   * @returns Message ID or sequence number
   */
  publish(subject: string, payload: unknown, options?: PublishOptions): Promise<string>

  // Request-response (bidirectional)
  /**
   * Send a request and wait for a response.
   * @throws Error on timeout or if no responder is available
   */
  request<Req, Resp>(
    subject: string,
    payload: Req,
    options?: RequestOptions
  ): Promise<Resp>

  // Subscriptions (inbound messages)
  /**
   * Subscribe to messages on a subject pattern.
   * @returns Subscription handle for management
   */
  subscribe(
    subject: string,
    handler: MessageHandler,
    options?: SubscribeOptions
  ): Promise<Subscription>

  /**
   * Register a reply handler for request-response patterns.
   * @returns Subscription handle for management
   */
  reply<Req, Resp>(
    subject: string,
    handler: ReplyHandler<Req, Resp>,
    options?: SubscribeOptions
  ): Promise<Subscription>
}

// ============================================================================
// Driver Options
// ============================================================================

/** Base options shared by all drivers */
export interface BaseDriverOptions {
  /** Enable debug logging */
  debug?: boolean
  /** Filter which events are published externally */
  publishFilter?: PublishFilter
  /** Filter which events are subscribed to from external systems */
  subscribeFilter?: PublishFilter
}

/** NATS driver configuration */
export interface NatsDriverOptions extends BaseDriverOptions {
  /** NATS server URL(s) */
  servers?: string | string[]
  /** Path to credentials file */
  credentials?: string
  /** Authentication token */
  token?: string
  /** Username for authentication */
  user?: string
  /** Password for authentication */
  pass?: string
  /** JetStream configuration */
  jetstream?: {
    /** Enable JetStream for persistence */
    enabled?: boolean
    /** JetStream domain */
    domain?: string
  }
  /** Connection name (for monitoring) */
  name?: string
  /** Reconnection options */
  reconnect?: {
    /** Maximum reconnection attempts */
    maxAttempts?: number
    /** Delay between attempts (ms) */
    delay?: number
  }
  /**
   * Enable tenant prefix for subjects (default: true).
   * When true, extracts tenantId from payload and prefixes subject:
   * `customers.deal.created` becomes `{tenantId}.customers.deal.created`
   */
  tenantPrefix?: boolean
}

/** Kafka driver configuration */
export interface KafkaDriverOptions extends BaseDriverOptions {
  /** Kafka broker addresses */
  brokers?: string[]
  /** Client identifier */
  clientId?: string
  /** Enable SSL/TLS */
  ssl?: boolean
  /** SASL authentication */
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'
    username: string
    password: string
  }
  /** Consumer group ID */
  consumerGroup?: string
}

/** Redis Streams driver configuration */
export interface RedisStreamsOptions extends BaseDriverOptions {
  /** Redis connection URL */
  url?: string
  /** Redis host */
  host?: string
  /** Redis port */
  port?: number
  /** Redis password */
  password?: string
  /** Consumer group name */
  consumerGroup?: string
  /** Consumer name within group */
  consumerName?: string
}

/** Memory driver configuration (for testing) */
export interface MemoryDriverOptions extends BaseDriverOptions {
  /** Simulate network latency (ms) */
  latency?: number
}

/** Union of all driver options */
export type MessagingDriverOptions =
  | NatsDriverOptions
  | KafkaDriverOptions
  | RedisStreamsOptions
  | MemoryDriverOptions

// ============================================================================
// Service Types
// ============================================================================

/** Options for operations that can target a specific driver */
export interface DriverTargetOptions {
  /** Target a specific driver instead of the default */
  driver?: MessagingDriverId
}

/** Options for bridging messages */
export interface BridgeOptions extends DriverTargetOptions {
  /** Transform the message payload */
  transform?: (payload: unknown) => unknown
}

/**
 * Main messaging service interface.
 *
 * Manages multiple drivers and provides a unified API for messaging operations.
 */
export interface MessagingService {
  // Driver management
  /** Add a driver to the service */
  addDriver(driver: MessagingDriver): void
  /** Get a driver by ID */
  getDriver(id: MessagingDriverId): MessagingDriver | undefined
  /** Get the default driver */
  getDefaultDriver(): MessagingDriver
  /** List all registered driver IDs */
  getDriverIds(): MessagingDriverId[]

  // Lifecycle
  /** Connect all registered drivers */
  connectAll(): Promise<void>
  /** Disconnect all registered drivers */
  disconnectAll(): Promise<void>
  /** Health check all drivers */
  healthCheck(): Promise<Record<MessagingDriverId, boolean>>

  // Operations (delegate to default or specified driver)
  /** Publish a message */
  publish(
    subject: string,
    payload: unknown,
    options?: PublishOptions & DriverTargetOptions
  ): Promise<string>

  /** Send a request and wait for response */
  request<Req, Resp>(
    subject: string,
    payload: Req,
    options?: RequestOptions & DriverTargetOptions
  ): Promise<Resp>

  /** Subscribe to messages */
  subscribe(
    subject: string,
    handler: MessageHandler,
    options?: SubscribeOptions & DriverTargetOptions
  ): Promise<Subscription>

  /** Register a reply handler */
  reply<Req, Resp>(
    subject: string,
    handler: ReplyHandler<Req, Resp>,
    options?: SubscribeOptions & DriverTargetOptions
  ): Promise<Subscription>
}

// ============================================================================
// Module Configuration Types
// ============================================================================

/** Bridge direction configuration */
export type BridgeDirection = 'inbound' | 'outbound' | 'request-reply'

/** Bridge configuration for declarative setup */
export interface BridgeConfig {
  /** Bridge direction */
  direction: BridgeDirection
  /** External subject pattern */
  subject: string
  /** Internal event name */
  event: string
  /** Target driver */
  driver?: MessagingDriverId
  /** Payload transformer */
  transform?: (payload: unknown) => unknown
}

/** Subscription configuration for declarative setup */
export interface SubscriptionConfig {
  /** Subject pattern to subscribe to */
  subject: string
  /** Handler function name (resolved at runtime) */
  handler: string
  /** Subscription options */
  options?: SubscribeOptions
}

/** Module-level messaging configuration */
export interface MessagingModuleConfig {
  /** Subscriptions to create */
  subscriptions?: SubscriptionConfig[]
  /** Bridges to configure */
  bridges?: BridgeConfig[]
}

// ============================================================================
// Publish Filter Types
// ============================================================================

/**
 * Filter configuration for controlling which events are published to external messaging.
 *
 * Events are matched using glob-style patterns:
 * - `*` matches any single segment (e.g., `customers.*` matches `customers.created`)
 * - `>` matches any remaining segments (e.g., `customers.>` matches `customers.deal.created`)
 * - Exact strings match exactly (e.g., `customers.deal.created`)
 *
 * Processing order:
 * 1. If `include` is specified, only events matching at least one include pattern are considered
 * 2. If `exclude` is specified, events matching any exclude pattern are filtered out
 * 3. If neither is specified, all events are published
 */
export interface PublishFilter {
  /**
   * Patterns for events that SHOULD be published to external messaging.
   * If specified, only events matching at least one pattern will be published.
   * @example ['customers.*', 'catalog.*', 'sales.>']
   */
  include?: string[]
  /**
   * Patterns for events that should NOT be published to external messaging.
   * Events matching any of these patterns will be filtered out.
   * @example ['query_index.*', 'search.*', '*.internal']
   */
  exclude?: string[]
}

