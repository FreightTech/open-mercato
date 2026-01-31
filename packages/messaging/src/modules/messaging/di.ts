/**
 * Messaging Module DI Registrar
 *
 * Registers the TransportDriver in the DI container when external messaging
 * is configured. The driver is resolved lazily by the event bus for additive
 * external forwarding.
 *
 * Configuration via environment variables:
 * - MESSAGING_STRATEGY: Driver type (nats, kafka, redis-streams, memory)
 * - NATS_URL, NATS_TOKEN, etc.: Driver-specific configuration
 * - MESSAGING_PUBLISH_INCLUDE/EXCLUDE: Event filtering for publish
 * - MESSAGING_SUBSCRIBE_INCLUDE/EXCLUDE: Event filtering for subscribe (enables inbound)
 */

import { asFunction } from 'awilix'
import type { AwilixContainer } from 'awilix'
import { DI_TOKENS } from '@open-mercato/shared/lib/transport'
import type { TransportDriver } from '@open-mercato/shared/lib/transport'
import type { EventBus } from '@open-mercato/events'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import {
  createMessagingDriverFromEnv,
  getMessagingStrategyFromEnv,
} from '../../factory'
import type { MessagingDriver } from '../../types'
import {
  createInboundConsumer,
  parseSubscribeFilterFromEnv,
  type InboundConsumer,
} from './inbound'

// Singleton instance - created once and reused
let driverInstance: MessagingDriver | null = null
let connectionPromise: Promise<void> | null = null
let inboundConsumer: InboundConsumer | null = null

/**
 * Registers the messaging transport driver in the DI container.
 *
 * The driver is registered as a lazy singleton that connects asynchronously.
 * If the messaging strategy is 'memory', no driver is registered since
 * there's no external transport to forward to.
 *
 * If MESSAGING_SUBSCRIBE_INCLUDE is configured, also starts the inbound consumer
 * to receive external events and forward them to the local event bus.
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
    [DI_TOKENS.TRANSPORT_DRIVER]: asFunction(() => {
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
        return container.resolve(DI_TOKENS.TRANSPORT_DRIVER)
      } catch {
        return null
      }
    }).singleton(),
  })
}

/**
 * Starts the inbound consumer after DI registration is complete.
 * Uses setImmediate to defer startup until the event bus and command bus are registered.
 *
 * If commandBus is available, the inbound consumer will automatically route
 * messages to commands when the subject matches a registered command ID.
 */
function startInboundConsumerDeferred(container: AwilixContainer): void {
  const subscribeFilter = parseSubscribeFilterFromEnv()

  // Only start inbound consumer if subscribe include filter is configured
  if (!subscribeFilter?.include || subscribeFilter.include.length === 0) {
    return
  }

  // Defer startup to ensure event bus and command bus are registered
  setImmediate(async () => {
    try {
      // Resolve event bus from DI
      const eventBus = container.resolve<EventBus>('eventBus')

      if (!eventBus) {
        console.warn('[messaging] Event bus not found in DI container, skipping inbound consumer')
        return
      }

      if (!driverInstance) {
        console.warn('[messaging] Driver not available, skipping inbound consumer')
        return
      }

      // Try to resolve command bus (optional - enables command routing)
      let commandBus: CommandBus | undefined
      try {
        commandBus = container.resolve<CommandBus>('commandBus')
      } catch {
        // Command bus not available - command routing will be disabled
      }

      // Create and start inbound consumer
      inboundConsumer = createInboundConsumer(driverInstance, eventBus, {
        filter: subscribeFilter,
        commandBus,
        container: commandBus ? container : undefined,
      })

      await inboundConsumer.start()
      console.log(`[messaging] Inbound consumer started${commandBus ? ' (command routing enabled)' : ''}`)
    } catch (err: unknown) {
      console.warn(`[messaging] Failed to start inbound consumer: ${(err as Error)?.message || err}`)
    }
  })
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
