/**
 * Types for Async Inbound Message Processing
 *
 * These types support the JetStream-based async inbound consumer
 * that processes messages concurrently with configurable worker pools.
 */

import type { PublishFilter } from '../../types'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { EventBus } from '@open-mercato/events'
import type { AwilixContainer } from 'awilix'

/**
 * Configuration for the async inbound consumer.
 */
export interface AsyncInboundConfig {
  /**
   * Number of concurrent workers for message processing.
   * Default: 1 (sync behavior for backwards compatibility)
   */
  concurrency: number

  /**
   * Time in milliseconds to wait for message acknowledgment before redelivery.
   * Default: 30000 (30 seconds)
   */
  ackWaitMs: number

  /**
   * Maximum number of retry attempts before message is terminated.
   * Default: 3
   */
  maxRetries: number

  /**
   * Time in milliseconds to wait for in-flight messages during shutdown.
   * Default: 10000 (10 seconds)
   */
  drainTimeoutMs: number

  /**
   * Enable debug logging.
   * Default: false (reads from MESSAGING_DEBUG env var)
   */
  debug: boolean

  /**
   * Subscribe filter patterns for incoming messages.
   */
  filter?: PublishFilter

  /**
   * Command bus for executing commands (enables command routing).
   */
  commandBus?: CommandBus

  /**
   * DI container for building command runtime context.
   * Required when commandBus is provided.
   */
  container?: AwilixContainer

  /**
   * Event bus for forwarding non-command messages.
   */
  eventBus: EventBus
}

/**
 * Wrapper for a queued message from JetStream.
 */
export interface QueuedMessage<T = unknown> {
  /** Unique message identifier from JetStream */
  id: string

  /** Subject the message was published to */
  subject: string

  /** Message payload */
  payload: T

  /** Optional headers */
  headers?: Record<string, string>

  /** JetStream message metadata */
  metadata: {
    /** Sequence number in the stream */
    sequence: number

    /** Timestamp when message was published */
    timestamp: Date

    /** Number of times this message has been delivered */
    redeliveryCount: number

    /** Stream name */
    stream: string

    /** Consumer name */
    consumer: string
  }

  /** Acknowledge successful processing */
  ack(): void

  /** Negative acknowledge - requeue for retry */
  nak(delay?: number): void

  /** Terminate - no more retries */
  term(): void

  /** Request more time for processing */
  working(): void
}

/**
 * State of an individual worker in the pool.
 */
export interface WorkerState {
  /** Worker identifier (0-indexed) */
  id: number

  /** Whether the worker is currently processing a message */
  busy: boolean

  /** Current message being processed (if any) */
  currentMessage?: {
    subject: string
    sequence: number
    startedAt: Date
  }

  /** Total messages processed by this worker */
  messagesProcessed: number

  /** Total errors encountered by this worker */
  errorsEncountered: number
}

/**
 * Statistics for the async inbound consumer.
 */
export interface InboundStats {
  /** Whether the consumer is currently active */
  active: boolean

  /** Number of workers in the pool */
  workerCount: number

  /** State of each worker */
  workers: WorkerState[]

  /** Total messages processed since start */
  totalProcessed: number

  /** Total messages that failed processing */
  totalFailed: number

  /** Total messages currently in-flight (being processed) */
  inFlight: number

  /** Consumer startup time */
  startedAt?: Date

  /** JetStream consumer info */
  jetstream?: {
    stream: string
    consumer: string
    numPending: number
    numWaiting: number
    numAckPending: number
  }
}

/**
 * Options for creating an async inbound consumer.
 */
export interface AsyncInboundConsumerOptions {
  /**
   * Number of concurrent workers for message processing.
   * Default: 1 (reads from MESSAGING_INBOUND_CONCURRENCY env var)
   */
  concurrency?: number

  /**
   * Time in milliseconds to wait for message acknowledgment before redelivery.
   * Default: 30000 (reads from MESSAGING_INBOUND_ACK_WAIT_MS env var)
   */
  ackWaitMs?: number

  /**
   * Maximum number of retry attempts before message is terminated.
   * Default: 3 (reads from MESSAGING_INBOUND_MAX_RETRIES env var)
   */
  maxRetries?: number

  /**
   * Time in milliseconds to wait for in-flight messages during shutdown.
   * Default: 10000 (reads from MESSAGING_INBOUND_DRAIN_TIMEOUT_MS env var)
   */
  drainTimeoutMs?: number

  /**
   * Enable debug logging.
   * Default: false (reads from MESSAGING_DEBUG env var)
   */
  debug?: boolean

  /**
   * Subscribe filter patterns for incoming messages.
   */
  filter?: PublishFilter

  /**
   * Command bus for executing commands (enables command routing).
   */
  commandBus?: CommandBus

  /**
   * DI container for building command runtime context.
   * Required when commandBus is provided.
   */
  container?: AwilixContainer
}

/**
 * Async inbound consumer instance.
 */
export interface AsyncInboundConsumer {
  /** Start consuming messages from JetStream */
  start(): Promise<void>

  /** Stop consuming and wait for in-flight messages to complete */
  stop(): Promise<void>

  /** Check if consumer is active */
  isActive(): boolean

  /** Get current statistics */
  getStats(): InboundStats
}

/**
 * Result of processing a single message.
 */
export interface MessageProcessingResult {
  /** Whether the message was processed successfully */
  success: boolean

  /** How the message was routed (command or event) */
  routedAs: 'command' | 'event'

  /** Processing duration in milliseconds */
  durationMs: number

  /** Error message if processing failed */
  error?: string
}
