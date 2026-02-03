/**
 * Messaging Module DI Registration
 *
 * Provides dependency injection registration for the messaging module,
 * following the pattern established by the search module.
 */

import { asValue } from 'awilix'
import type { EventBus } from '@open-mercato/events'
import type { MessagingDriver, MessagingDriverId } from './types'
import { MessagingService } from './service'
import { createMessagingDriverFromEnv, getMessagingStrategyFromEnv } from './factory'
import { createEventBusBridge, type EventBusBridge } from './bridge'

/**
 * Container interface - minimal subset needed for registration.
 */
export interface MessagingContainer {
  resolve<T = unknown>(name: string): T
  register(registrations: Record<string, unknown>): void
}

/**
 * Configuration options for messaging module registration.
 */
export interface MessagingModuleOptions {
  /** Override the default messaging strategy */
  strategy?: MessagingDriverId
  /** Custom drivers to register (in addition to or instead of env-based) */
  drivers?: MessagingDriver[]
  /** ID of the default driver */
  defaultDriver?: MessagingDriverId
  /** Skip automatic driver creation from environment */
  skipEnvDriver?: boolean
  /** Enable debug logging */
  debug?: boolean
  /** Auto-connect drivers during registration */
  autoConnect?: boolean
  /** Create EventBus bridge */
  createBridge?: boolean
}

/**
 * Register the messaging module in the DI container.
 *
 * This creates and registers:
 * - MessagingService instance
 * - Configured messaging drivers
 * - EventBusBridge (optional)
 *
 * @param container - Awilix container
 * @param options - Optional configuration overrides
 *
 * @example
 * ```typescript
 * // Basic registration using environment variables
 * registerMessagingModule(container)
 *
 * // With custom configuration
 * registerMessagingModule(container, {
 *   strategy: 'nats',
 *   debug: true,
 *   createBridge: true,
 * })
 *
 * // With custom drivers
 * registerMessagingModule(container, {
 *   drivers: [createMemoryDriver(), createNatsDriver()],
 *   defaultDriver: 'nats',
 *   skipEnvDriver: true,
 * })
 * ```
 */
export function registerMessagingModule(
  container: MessagingContainer,
  options?: MessagingModuleOptions
): void {
  const debug = options?.debug ?? process.env.MESSAGING_DEBUG === 'true'
  const drivers: MessagingDriver[] = options?.drivers ? [...options.drivers] : []

  // Create driver from environment if not skipped
  if (!options?.skipEnvDriver) {
    try {
      const envDriver = createMessagingDriverFromEnv()
      // Only add if not already in the list
      if (!drivers.some((d) => d.id === envDriver.id)) {
        drivers.push(envDriver)
      }
      if (debug) {
        const strategy = getMessagingStrategyFromEnv()
        console.log(`[messaging] Created ${strategy} driver from environment`)
      }
    } catch (error) {
      console.warn('[messaging] Failed to create driver from environment:', error)
    }
  }

  // Determine default driver
  const defaultDriver = options?.defaultDriver ??
    options?.strategy ??
    (drivers.length > 0 ? drivers[0].id : undefined)

  // Create messaging service
  const messagingService = new MessagingService({
    drivers,
    defaultDriver,
    debug,
  })

  // Register in container
  container.register({
    messagingService: asValue(messagingService),
    messagingDrivers: asValue(drivers),
  })

  if (debug) {
    console.log(`[messaging] Registered ${drivers.length} driver(s), default: ${defaultDriver}`)
  }

  // Auto-connect if requested
  if (options?.autoConnect) {
    messagingService.connectAll().catch((error) => {
      console.error('[messaging] Auto-connect failed:', error)
    })
  }

  // Create EventBus bridge if requested
  if (options?.createBridge) {
    try {
      const eventBus = container.resolve<EventBus>('eventBus')
      const bridge = createEventBusBridge(eventBus, messagingService)
      container.register({
        messagingBridge: asValue(bridge),
      })
      if (debug) {
        console.log('[messaging] EventBus bridge created')
      }
    } catch (error) {
      console.warn('[messaging] Failed to create EventBus bridge:', error)
    }
  }
}

/**
 * Add a custom messaging driver to the service.
 *
 * @param container - DI container
 * @param driver - Driver to add
 */
export function addMessagingDriver(
  container: MessagingContainer,
  driver: MessagingDriver
): void {
  const service = container.resolve<MessagingService>('messagingService')
  service.addDriver(driver)

  const drivers = container.resolve<MessagingDriver[]>('messagingDrivers')
  drivers.push(driver)
}

/**
 * Get the messaging bridge from the container.
 *
 * @param container - DI container
 * @returns The EventBusBridge if registered
 */
export function getMessagingBridge(
  container: MessagingContainer
): EventBusBridge | undefined {
  try {
    return container.resolve<EventBusBridge>('messagingBridge')
  } catch {
    return undefined
  }
}
