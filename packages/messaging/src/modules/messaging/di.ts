/**
 * Messaging Module DI Registrar
 *
 * Registers the TransportDriver, QueueDriver, and CacheDriver in the DI container
 * when external messaging (NATS) is configured.
 *
 * - TransportDriver: Used by the event bus for external event forwarding
 * - QueueDriver: Used when QUEUE_STRATEGY=custom
 * - CacheDriver: Used when CACHE_STRATEGY=custom
 * - Reply Handlers: For synchronous command execution via NATS request-reply (enabled by default)
 * - Async Consumer: For async event processing via JetStream (enabled by default)
 *
 * Each driver manages its own NATS connection.
 *
 * Configuration via environment variables:
 * - MESSAGING_STRATEGY: Driver type (nats, kafka, redis-streams, memory)
 * - NATS_URL, NATS_TOKEN, etc.: Driver-specific configuration
 * - MESSAGING_PUBLISH_INCLUDE/EXCLUDE: Event filtering for publish
 * - MESSAGING_REPLY_HANDLERS_ENABLED: Enable reply handlers for commands (default: true)
 * - MESSAGING_ASYNC_CONSUMER_ENABLED: Enable async consumer for events (default: true)
 * - MESSAGING_INBOUND_CONCURRENCY: Async consumer workers (default: 1)
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
import { createAsyncInboundConsumer } from './async-events'
import type { AsyncInboundConsumer } from './inbound-types'
import type { NatsDriverExtended } from '../../drivers/nats'
import { createNatsQueueDriver } from '../../drivers/nats/queue-driver'
import { createNatsCacheDriver } from '../../drivers/nats/cache-driver'
import {
  registerCommandReplyHandlers,
  unregisterCommandReplyHandlers,
} from './reply-handlers'

// Singleton instance - created once and reused
let driverInstance: MessagingDriver | null = null
let connectionPromise: Promise<void> | null = null
let inboundConsumer: AsyncInboundConsumer | null = null
// State tracker: whether reply handlers have been registered (not a config - see MESSAGING_REPLY_HANDLERS_ENABLED)
let replyHandlersRegistered = false

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

              // Start reply handlers and optionally async consumer after connection
              startMessagingHandlersDeferred(container)
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
 * Starts reply handlers and async event consumer after DI registration is complete.
 * Uses retry logic to handle cases where the event bus or command bus are not yet registered.
 *
 * Both reply handlers and async consumer are enabled by default:
 * - Reply handlers: Synchronous command execution via request-reply
 * - Async consumer: Asynchronous event processing via JetStream
 *
 * Configuration:
 * - MESSAGING_REPLY_HANDLERS_ENABLED: Enable reply handlers (default: true)
 * - MESSAGING_ASYNC_CONSUMER_ENABLED: Enable async consumer (default: true)
 * - MESSAGING_INBOUND_CONCURRENCY: Async consumer workers (default: 1)
 */
function startMessagingHandlersDeferred(container: AwilixContainer): void {
  const strategy = getMessagingStrategyFromEnv()

  if (strategy !== 'nats') {
    console.warn(`[messaging] Reply handlers require NATS strategy, got: ${strategy}`)
    return
  }

  // Defer startup with retry logic to ensure dependencies are registered
  const attemptStart = async (retries = 3): Promise<void> => {
    try {
      // Try to resolve command bus for reply handlers
      let commandBus: CommandBus | undefined
      try {
        commandBus = container.resolve<CommandBus>('commandBus')
      } catch {
        if (retries > 0) {
          // CommandBus not yet registered, retry after a short delay
          setTimeout(() => attemptStart(retries - 1), 50)
          return
        }
        console.warn('[messaging] Command bus not found in DI container after retries')
        return
      }

      if (!driverInstance) {
        console.warn('[messaging] Driver not available')
        return
      }

      // Register reply handlers for synchronous command execution
      // Note: Enabled by default unless MESSAGING_REPLY_HANDLERS_ENABLED=false
      if (commandBus && !replyHandlersRegistered) {
        try {
          await registerCommandReplyHandlers(driverInstance, commandBus, container)
          replyHandlersRegistered = true
        } catch (err: unknown) {
          console.warn(`[messaging] Failed to register reply handlers: ${(err as Error)?.message || err}`)
        }
      }

      // Start async consumer for event processing
      // Default: enabled (set MESSAGING_ASYNC_CONSUMER_ENABLED=false to disable)
      const asyncConsumerEnabled = process.env.MESSAGING_ASYNC_CONSUMER_ENABLED !== 'false'
      
      if (asyncConsumerEnabled) {
        await startAsyncConsumer(container, commandBus)
      } else {
        console.log('[messaging] Async event consumer disabled (set MESSAGING_ASYNC_CONSUMER_ENABLED=true to enable)')
      }
    } catch (err: unknown) {
      console.warn(`[messaging] Failed to start messaging handlers: ${(err as Error)?.message || err}`)
    }
  }

  setImmediate(() => attemptStart())
}

/**
 * Starts the async inbound consumer for event processing.
 * This is separate from reply handlers and is used for fire-and-forget event processing.
 */
async function startAsyncConsumer(container: AwilixContainer, commandBus?: CommandBus): Promise<void> {
  try {
    // Try to resolve event bus from DI
    let eventBus: EventBus | undefined
    try {
      eventBus = container.resolve<EventBus>('eventBus')
    } catch {
      console.warn('[messaging] Event bus not found, async consumer requires event bus')
      return
    }

    if (!eventBus) {
      console.warn('[messaging] Event bus not found in DI container')
      return
    }

    if (!driverInstance) {
      console.warn('[messaging] Driver not available')
      return
    }

    // Cast to extended driver for JetStream access
    const natsDriver = driverInstance as NatsDriverExtended

    // Check if JetStream is available
    if (!natsDriver.getJetStream || !natsDriver.getJetStream()) {
      console.warn('[messaging] JetStream not available, set NATS_JETSTREAM_ENABLED=true')
      return
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
    console.log(`[messaging] Async event consumer started with ${stats.workerCount} worker(s)`)
  } catch (err: unknown) {
    console.warn(`[messaging] Failed to start async consumer: ${(err as Error)?.message || err}`)
  }
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

  // Unregister reply handlers
  if (replyHandlersRegistered) {
    try {
      await unregisterCommandReplyHandlers()
      replyHandlersRegistered = false
    } catch (err: unknown) {
      console.warn(`[messaging] Reply handlers cleanup error: ${(err as Error)?.message || err}`)
    }
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
