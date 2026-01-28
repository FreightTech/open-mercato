/**
 * Messaging Driver Factory
 *
 * Factory function for creating messaging drivers based on strategy type.
 * Follows the same pattern as the queue package for consistency.
 */

import type {
  MessagingDriver,
  NatsDriverOptions,
  KafkaDriverOptions,
  RedisStreamsOptions,
  MemoryDriverOptions,
  MessagingDriverOptions,
} from './types'
import { createMemoryDriver } from './drivers/memory'
import { createNatsDriver } from './drivers/nats'

/** Available messaging strategy types */
export type MessagingStrategyType = 'nats' | 'kafka' | 'redis-streams' | 'memory'

/**
 * Creates a messaging driver based on the specified strategy.
 *
 * @param strategy - The messaging strategy to use
 * @param options - Strategy-specific configuration options
 * @returns A MessagingDriver instance
 *
 * @example
 * ```typescript
 * // Memory driver for testing
 * const memoryDriver = createMessagingDriver('memory')
 *
 * // NATS driver for production
 * const natsDriver = createMessagingDriver('nats', {
 *   servers: 'nats://localhost:4222',
 *   jetstream: { enabled: true }
 * })
 * ```
 */
export function createMessagingDriver(
  strategy: 'memory',
  options?: MemoryDriverOptions
): MessagingDriver

export function createMessagingDriver(
  strategy: 'nats',
  options?: NatsDriverOptions
): MessagingDriver

export function createMessagingDriver(
  strategy: 'kafka',
  options?: KafkaDriverOptions
): MessagingDriver

export function createMessagingDriver(
  strategy: 'redis-streams',
  options?: RedisStreamsOptions
): MessagingDriver

export function createMessagingDriver(
  strategy: MessagingStrategyType,
  options?: MessagingDriverOptions
): MessagingDriver

export function createMessagingDriver(
  strategy: MessagingStrategyType,
  options?: MessagingDriverOptions
): MessagingDriver {
  switch (strategy) {
    case 'nats':
      return createNatsDriver(options as NatsDriverOptions)

    case 'kafka':
      // Kafka driver is not yet implemented
      // Return a placeholder that throws on use
      return createPlaceholderDriver('kafka', 'Kafka driver is not yet implemented')

    case 'redis-streams':
      // Redis Streams driver is not yet implemented
      return createPlaceholderDriver('redis-streams', 'Redis Streams driver is not yet implemented')

    case 'memory':
    default:
      return createMemoryDriver(options as MemoryDriverOptions)
  }
}

/**
 * Creates a placeholder driver that throws on all operations.
 * Used for strategies that are not yet implemented.
 */
function createPlaceholderDriver(id: string, message: string): MessagingDriver {
  const notImplemented = () => {
    throw new Error(message)
  }

  return {
    id,
    name: `${id} (Not Implemented)`,
    connect: notImplemented,
    disconnect: notImplemented,
    isConnected: () => false,
    isHealthy: async () => false,
    publish: notImplemented,
    request: notImplemented,
    subscribe: notImplemented,
    reply: notImplemented,
  }
}

/**
 * Determines the messaging strategy from environment variables.
 *
 * Checks the following variables in order:
 * 1. MESSAGING_STRATEGY
 * 2. MESSAGING_DRIVER
 *
 * @returns The strategy type, defaulting to 'memory'
 */
export function getMessagingStrategyFromEnv(): MessagingStrategyType {
  const strategy = process.env.MESSAGING_STRATEGY ?? process.env.MESSAGING_DRIVER

  if (strategy && ['nats', 'kafka', 'redis-streams', 'memory'].includes(strategy)) {
    return strategy as MessagingStrategyType
  }

  return 'memory'
}

/**
 * Creates a messaging driver from environment configuration.
 *
 * Reads configuration from environment variables:
 * - MESSAGING_STRATEGY: Driver type (nats, kafka, redis-streams, memory)
 * - NATS_URL: NATS server URL
 * - NATS_TOKEN: NATS authentication token
 * - NATS_JETSTREAM_ENABLED: Enable JetStream
 * - KAFKA_BROKERS: Comma-separated Kafka brokers
 * - KAFKA_CLIENT_ID: Kafka client ID
 *
 * @returns A configured MessagingDriver instance
 */
export function createMessagingDriverFromEnv(): MessagingDriver {
  const strategy = getMessagingStrategyFromEnv()

  switch (strategy) {
    case 'nats': {
      const servers = process.env.NATS_URL ?? 'localhost:4222'
      const token = process.env.NATS_TOKEN
      const jetstreamEnabled = process.env.NATS_JETSTREAM_ENABLED === 'true'
      const debug = process.env.MESSAGING_DEBUG === 'true'

      return createNatsDriver({
        servers,
        token,
        jetstream: { enabled: jetstreamEnabled },
        debug,
      })
    }

    case 'kafka': {
      const brokers = process.env.KAFKA_BROKERS?.split(',') ?? ['localhost:9092']
      const clientId = process.env.KAFKA_CLIENT_ID ?? 'open-mercato'
      const debug = process.env.MESSAGING_DEBUG === 'true'

      return createMessagingDriver('kafka', {
        brokers,
        clientId,
        debug,
      })
    }

    case 'redis-streams': {
      const url = process.env.REDIS_STREAMS_URL ?? process.env.REDIS_URL
      const debug = process.env.MESSAGING_DEBUG === 'true'

      return createMessagingDriver('redis-streams', {
        url,
        debug,
      })
    }

    case 'memory':
    default: {
      const debug = process.env.MESSAGING_DEBUG === 'true'
      return createMemoryDriver({ debug })
    }
  }
}
