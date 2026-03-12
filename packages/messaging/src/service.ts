/**
 * Messaging Service
 *
 * A unified service that manages multiple messaging drivers and provides
 * a consistent API for all messaging operations. Supports driver selection
 * per operation and automatic fallback to a default driver.
 */

import type {
  MessagingService as IMessagingService,
  MessagingDriver,
  MessagingDriverId,
  MessageHandler,
  ReplyHandler,
  PublishOptions,
  RequestOptions,
  SubscribeOptions,
  Subscription,
  DriverTargetOptions,
} from './types'

/** Options for creating a MessagingService */
export interface MessagingServiceOptions {
  /** Initial drivers to register */
  drivers?: MessagingDriver[]
  /** ID of the default driver (first registered driver if not specified) */
  defaultDriver?: MessagingDriverId
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Creates a new MessagingService instance.
 *
 * @param options - Service configuration
 * @returns MessagingService instance
 *
 * @example
 * ```typescript
 * const service = createMessagingService({
 *   drivers: [createMemoryDriver(), createNatsDriver()],
 *   defaultDriver: 'nats',
 * })
 *
 * await service.connectAll()
 *
 * // Use default driver
 * await service.publish('orders.created', { orderId: '123' })
 *
 * // Target specific driver
 * await service.publish('orders.created', { orderId: '123' }, { driver: 'memory' })
 * ```
 */
export function createMessagingService(options?: MessagingServiceOptions): IMessagingService {
  const debug = options?.debug ?? false
  const drivers = new Map<MessagingDriverId, MessagingDriver>()
  let defaultDriverId: MessagingDriverId | null = options?.defaultDriver ?? null

  /**
   * Log debug messages.
   */
  function log(...args: unknown[]): void {
    if (debug) console.log('[messaging]', ...args)
  }

  /**
   * Get a driver by ID, throwing if not found.
   */
  function requireDriver(id: MessagingDriverId): MessagingDriver {
    const driver = drivers.get(id)
    if (!driver) {
      throw new Error(`Messaging driver not found: ${id}`)
    }
    return driver
  }

  /**
   * Get the target driver for an operation.
   */
  function getTargetDriver(targetOptions?: DriverTargetOptions): MessagingDriver {
    if (targetOptions?.driver) {
      return requireDriver(targetOptions.driver)
    }
    if (!defaultDriverId) {
      throw new Error('No default messaging driver configured')
    }
    return requireDriver(defaultDriverId)
  }

  // Register initial drivers
  if (options?.drivers) {
    for (const driver of options.drivers) {
      drivers.set(driver.id, driver)
      log(`Registered driver: ${driver.id} (${driver.name})`)
    }
    // Set default to first driver if not specified
    if (!defaultDriverId && options.drivers.length > 0) {
      defaultDriverId = options.drivers[0].id
      log(`Default driver: ${defaultDriverId}`)
    }
  }

  return {
    addDriver(driver: MessagingDriver): void {
      drivers.set(driver.id, driver)
      log(`Registered driver: ${driver.id} (${driver.name})`)

      // Set as default if first driver
      if (!defaultDriverId) {
        defaultDriverId = driver.id
        log(`Default driver: ${defaultDriverId}`)
      }
    },

    getDriver(id: MessagingDriverId): MessagingDriver | undefined {
      return drivers.get(id)
    },

    getDefaultDriver(): MessagingDriver {
      if (!defaultDriverId) {
        throw new Error('No default messaging driver configured')
      }
      return requireDriver(defaultDriverId)
    },

    getDriverIds(): MessagingDriverId[] {
      return Array.from(drivers.keys())
    },

    async connectAll(): Promise<void> {
      log('Connecting all drivers...')

      const results = await Promise.allSettled(
        Array.from(drivers.values()).map(async (driver) => {
          try {
            await driver.connect()
            log(`Connected: ${driver.id}`)
          } catch (error) {
            console.error(`[messaging] Failed to connect ${driver.id}:`, error)
            throw error
          }
        })
      )

      const failures = results.filter((r) => r.status === 'rejected')
      if (failures.length > 0) {
        console.warn(`[messaging] ${failures.length}/${drivers.size} drivers failed to connect`)
      }
    },

    async disconnectAll(): Promise<void> {
      log('Disconnecting all drivers...')

      await Promise.allSettled(
        Array.from(drivers.values()).map(async (driver) => {
          try {
            await driver.disconnect()
            log(`Disconnected: ${driver.id}`)
          } catch (error) {
            console.error(`[messaging] Failed to disconnect ${driver.id}:`, error)
          }
        })
      )
    },

    async healthCheck(): Promise<Record<MessagingDriverId, boolean>> {
      const results: Record<MessagingDriverId, boolean> = {}

      await Promise.all(
        Array.from(drivers.entries()).map(async ([id, driver]) => {
          try {
            results[id] = await driver.isHealthy()
          } catch {
            results[id] = false
          }
        })
      )

      return results
    },

    async publish(
      subject: string,
      payload: unknown,
      options?: PublishOptions & DriverTargetOptions
    ): Promise<string> {
      const driver = getTargetDriver(options)
      log(`Publishing to ${subject} via ${driver.id}`)
      return driver.publish(subject, payload, options)
    },

    async request<Req, Resp>(
      subject: string,
      payload: Req,
      options?: RequestOptions & DriverTargetOptions
    ): Promise<Resp> {
      const driver = getTargetDriver(options)
      log(`Request to ${subject} via ${driver.id}`)
      return driver.request<Req, Resp>(subject, payload, options)
    },

    async subscribe(
      subject: string,
      handler: MessageHandler,
      options?: SubscribeOptions & DriverTargetOptions
    ): Promise<Subscription> {
      const driver = getTargetDriver(options)
      log(`Subscribing to ${subject} via ${driver.id}`)
      return driver.subscribe(subject, handler, options)
    },

    async reply<Req, Resp>(
      subject: string,
      handler: ReplyHandler<Req, Resp>,
      options?: SubscribeOptions & DriverTargetOptions
    ): Promise<Subscription> {
      const driver = getTargetDriver(options)
      log(`Reply handler for ${subject} via ${driver.id}`)
      return driver.reply<Req, Resp>(subject, handler, options)
    },
  }
}

/**
 * MessagingService class implementation for direct instantiation.
 */
export class MessagingService implements IMessagingService {
  private readonly service: IMessagingService

  constructor(options?: MessagingServiceOptions) {
    this.service = createMessagingService(options)
  }

  addDriver(driver: MessagingDriver): void {
    this.service.addDriver(driver)
  }

  getDriver(id: MessagingDriverId): MessagingDriver | undefined {
    return this.service.getDriver(id)
  }

  getDefaultDriver(): MessagingDriver {
    return this.service.getDefaultDriver()
  }

  getDriverIds(): MessagingDriverId[] {
    return this.service.getDriverIds()
  }

  connectAll(): Promise<void> {
    return this.service.connectAll()
  }

  disconnectAll(): Promise<void> {
    return this.service.disconnectAll()
  }

  healthCheck(): Promise<Record<MessagingDriverId, boolean>> {
    return this.service.healthCheck()
  }

  publish(
    subject: string,
    payload: unknown,
    options?: PublishOptions & DriverTargetOptions
  ): Promise<string> {
    return this.service.publish(subject, payload, options)
  }

  request<Req, Resp>(
    subject: string,
    payload: Req,
    options?: RequestOptions & DriverTargetOptions
  ): Promise<Resp> {
    return this.service.request<Req, Resp>(subject, payload, options)
  }

  subscribe(
    subject: string,
    handler: MessageHandler,
    options?: SubscribeOptions & DriverTargetOptions
  ): Promise<Subscription> {
    return this.service.subscribe(subject, handler, options)
  }

  reply<Req, Resp>(
    subject: string,
    handler: ReplyHandler<Req, Resp>,
    options?: SubscribeOptions & DriverTargetOptions
  ): Promise<Subscription> {
    return this.service.reply<Req, Resp>(subject, handler, options)
  }
}
