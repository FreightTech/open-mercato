/**
 * Messaging Module DI Registrar
 *
 * Registers the TransportDriver, QueueDriver, and CacheDriver in the DI container
 * when external messaging (NATS) is configured.
 *
 * - TransportDriver: Used by the event bus for external event forwarding
 * - QueueDriver: Used when QUEUE_STRATEGY=custom
 * - CacheDriver: Used when CACHE_STRATEGY=custom
 *
 * Each driver manages its own NATS connection.
 *
 * Configuration via environment variables:
 * - MESSAGING_STRATEGY: Driver type (nats, kafka, redis-streams, memory)
 * - NATS_URL, NATS_TOKEN, etc.: Driver-specific configuration
 * - MESSAGING_PUBLISH_INCLUDE/EXCLUDE: Event filtering for publish
 * - MESSAGING_INBOUND_CONCURRENCY: Number of concurrent workers (default: 1)
 * - MESSAGING_INBOUND_ACK_WAIT_MS: Ack timeout before redelivery (default: 30000)
 * - MESSAGING_INBOUND_MAX_RETRIES: Max retry attempts (default: 3)
 * - MESSAGING_INBOUND_DRAIN_TIMEOUT_MS: Shutdown drain timeout (default: 10000)
 */

import { asFunction } from 'awilix'
import type { AwilixContainer } from 'awilix'
import { DI_TOKENS as TRANSPORT_DI_TOKENS } from '@open-mercato/shared/lib/transport'
import { DI_TOKENS as DRIVER_DI_TOKENS } from '@open-mercato/shared/lib/drivers'
import type { TransportDriver } from '@open-mercato/shared/lib/transport'
import type { EventBus } from '@open-mercato/events'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import {
  createMessagingDriverFromEnv,
  getMessagingStrategyFromEnv,
} from '../../factory'
import type { MessagingDriver } from '../../types'
import { createAsyncInboundConsumer } from './async-inbound'
import type { AsyncInboundConsumer } from './inbound-types'
import type { NatsDriverExtended } from '../../drivers/nats'
import { createNatsQueueDriver } from '../../drivers/nats/queue-driver'
import { createNatsCacheDriver } from '../../drivers/nats/cache-driver'

// Singleton instance - created once and reused
let driverInstance: MessagingDriver | null = null
let connectionPromise: Promise<void> | null = null
let inboundConsumer: AsyncInboundConsumer | null = null

/**
 * Registers the messaging transport driver in the DI container.
 *
 * The driver is registered as a lazy singleton that connects asynchronously.
 * If the messaging strategy is 'memory', no driver is registered since
 * there's no external transport to forward to.
 *
 * When NATS strategy is used, also registers:
 * - QUEUE_DRIVER: For QUEUE_STRATEGY=custom
 * - CACHE_DRIVER: For CACHE_STRATEGY=custom
 *
 * When JetStream is enabled, starts the async inbound consumer to receive
 * external events and route them to the local event bus or command bus.
 */
export function register(container: AwilixContainer): void {
  const strategy = getMessagingStrategyFromEnv()

  // Skip registration if memory strategy (no external driver needed)
  // In-memory event delivery will work without external transport
  if (strategy === 'memory') {
    return
  }

  // Register the transport driver as a lazy singleton
  container.register({
    [TRANSPORT_DI_TOKENS.TRANSPORT_DRIVER]: asFunction(() => {
      if (!driverInstance) {
        try {
          driverInstance = createMessagingDriverFromEnv()

          // Connect asynchronously - don't block DI resolution
          connectionPromise = driverInstance.connect()
            .then(() => {
              console.log(`[messaging] Connected to ${strategy} driver`)

              // Start inbound consumer after connection if subscribe filter is configured
              startInboundConsumerDeferred(container)
            })
            .catch((err) => {
              console.warn(`[messaging] Driver connection failed: ${err?.message || err}`)
              // Don't clear instance - allow reconnection attempts
            })
        } catch (err: unknown) {
          console.warn(`[messaging] Failed to create driver: ${(err as Error)?.message || err}`)
          return null
        }
      }
      return driverInstance as TransportDriver
    }).singleton(),
  })

  // Also register the full messaging driver for consumers that need
  // the full MessagingDriver interface (request-reply, etc.)
  container.register({
    messagingDriver: asFunction(() => {
      // Reuse the same instance from transportDriver
      try {
        return container.resolve(TRANSPORT_DI_TOKENS.TRANSPORT_DRIVER)
      } catch {
        return null
      }
    }).singleton(),
  })

  // Register Queue Driver for NATS strategy
  // This is used when QUEUE_STRATEGY=custom
  if (strategy === 'nats') {
    container.register({
      [DRIVER_DI_TOKENS.QUEUE_DRIVER]: asFunction(() => {
        const debug = process.env.MESSAGING_DEBUG === 'true'
        return createNatsQueueDriver({ debug })
      }).singleton(),
    })

    // Register Cache Driver for NATS strategy
    // This is used when CACHE_STRATEGY=custom
    container.register({
      [DRIVER_DI_TOKENS.CACHE_DRIVER]: asFunction(() => {
        const debug = process.env.MESSAGING_DEBUG === 'true'
        return createNatsCacheDriver({ debug })
      }).singleton(),
    })
  }

  // Eagerly resolve transport driver to trigger connection and start inbound consumer
  // This is done via setImmediate to not block DI registration
  setImmediate(() => {
    try {
      container.resolve(TRANSPORT_DI_TOKENS.TRANSPORT_DRIVER)
    } catch {
      // Ignore resolution errors - driver creation errors are already logged
    }
  })
}

/**
 * Starts the async inbound consumer after DI registration is complete.
 * Uses retry logic to handle cases where the event bus or command bus are not yet registered.
 *
 * The async consumer uses JetStream for durable message processing with:
 * - Configurable concurrency (MESSAGING_INBOUND_CONCURRENCY)
 * - Explicit ack/nack with configurable timeout
 * - Automatic retries with exponential backoff
 * - Graceful shutdown with drain timeout
 *
 * If commandBus is available, the inbound consumer will automatically route
 * messages to commands when the subject matches a registered command ID.
 */
function startInboundConsumerDeferred(container: AwilixContainer): void {
  const strategy = getMessagingStrategyFromEnv()

  // Async inbound consumer requires NATS with JetStream
  if (strategy !== 'nats') {
    console.warn(`[messaging] Async inbound consumer requires NATS strategy, got: ${strategy}`)
    return
  }

  // Defer startup with retry logic to ensure dependencies are registered
  const attemptStart = async (retries = 3): Promise<void> => {
    try {
      // Try to resolve event bus from DI
      let eventBus: EventBus | undefined
      try {
        eventBus = container.resolve<EventBus>('eventBus')
      } catch {
        if (retries > 0) {
          // EventBus not yet registered, retry after a short delay
          setTimeout(() => attemptStart(retries - 1), 50)
          return
        }
        console.warn('[messaging] Event bus not found in DI container after retries, skipping inbound consumer')
        return
      }

      if (!eventBus) {
        console.warn('[messaging] Event bus not found in DI container, skipping inbound consumer')
        return
      }

      if (!driverInstance) {
        console.warn('[messaging] Driver not available, skipping inbound consumer')
        return
      }

      // Cast to extended driver for JetStream access
      const natsDriver = driverInstance as NatsDriverExtended

      // Check if JetStream is available
      if (!natsDriver.getJetStream || !natsDriver.getJetStream()) {
        console.warn('[messaging] JetStream not available, skipping async inbound consumer. Set NATS_JETSTREAM_ENABLED=true')
        return
      }

      // Try to resolve command bus (optional - enables command routing)
      let commandBus: CommandBus | undefined
      try {
        commandBus = container.resolve<CommandBus>('commandBus')
      } catch {
        // Command bus not available - command routing will be disabled
      }

      // Get concurrency from env
      const concurrency = parseInt(process.env.MESSAGING_INBOUND_CONCURRENCY || '1', 10)

      // Create and start async inbound consumer
      inboundConsumer = createAsyncInboundConsumer(natsDriver, eventBus, {
        commandBus,
        container: commandBus ? container : undefined,
        concurrency,
      })

      await inboundConsumer.start()
      const stats = inboundConsumer.getStats()
      console.log(`[messaging] Async inbound consumer started with ${stats.workerCount} worker(s)${commandBus ? ' (command routing enabled)' : ''}`)
    } catch (err: unknown) {
      console.warn(`[messaging] Failed to start async inbound consumer: ${(err as Error)?.message || err}`)
    }
  }

  setImmediate(() => attemptStart())
}

/**
 * Waits for the driver connection to complete.
 * Useful for graceful startup sequences.
 */
export async function waitForConnection(): Promise<void> {
  if (connectionPromise) {
    await connectionPromise
  }
}

/**
 * Disconnects the driver if connected.
 * Useful for graceful shutdown.
 */
export async function disconnect(): Promise<void> {
  // Stop inbound consumer first
  if (inboundConsumer?.isActive()) {
    try {
      await inboundConsumer.stop()
      console.log('[messaging] Inbound consumer stopped')
    } catch (err: unknown) {
      console.warn(`[messaging] Inbound consumer stop error: ${(err as Error)?.message || err}`)
    }
    inboundConsumer = null
  }

  // Then disconnect driver
  if (driverInstance?.isConnected()) {
    try {
      await driverInstance.disconnect()
      console.log('[messaging] Driver disconnected')
    } catch (err: unknown) {
      console.warn(`[messaging] Disconnect error: ${(err as Error)?.message || err}`)
    }
  }
}
