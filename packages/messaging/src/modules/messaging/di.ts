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
 * - MESSAGING_SUBSCRIBE_INCLUDE/EXCLUDE: Event filtering for subscribe
 */

import { asFunction } from 'awilix'
import type { AwilixContainer } from 'awilix'
import { DI_TOKENS } from '@open-mercato/shared/lib/transport'
import type { TransportDriver } from '@open-mercato/shared/lib/transport'
import {
  createMessagingDriverFromEnv,
  getMessagingStrategyFromEnv,
} from '../../factory'
import type { MessagingDriver } from '../../types'

// Singleton instance - created once and reused
let driverInstance: MessagingDriver | null = null
let connectionPromise: Promise<void> | null = null

/**
 * Registers the messaging transport driver in the DI container.
 *
 * The driver is registered as a lazy singleton that connects asynchronously.
 * If the messaging strategy is 'memory', no driver is registered since
 * there's no external transport to forward to.
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
  if (driverInstance?.isConnected()) {
    try {
      await driverInstance.disconnect()
      console.log('[messaging] Driver disconnected')
    } catch (err: unknown) {
      console.warn(`[messaging] Disconnect error: ${(err as Error)?.message || err}`)
    }
  }
}
