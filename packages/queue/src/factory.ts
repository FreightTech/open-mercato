import type { Queue, LocalQueueOptions, AsyncQueueOptions, BullMQProviderOptions, CustomQueueOptions, QueueStrategyType } from './types'
import type { QueueDriver } from '@open-mercato/shared/lib/drivers'
import { DI_TOKENS } from '@open-mercato/shared/lib/drivers'
import { createLocalQueue } from './strategies/local'
import { createAsyncQueue } from './strategies/async'
import { getRedisUrlOrThrow } from '@open-mercato/shared/lib/redis/connection'

// ============================================================================
// DI Resolver for Custom Strategy
// ============================================================================

/** DI resolver function type */
type DIResolver = <T>(token: string) => T

/** DI resolver - set at bootstrap by calling setQueueDIResolver */
let diResolver: DIResolver | null = null

/**
 * Sets the DI resolver for custom queue strategy.
 *
 * Call this at application bootstrap to enable the 'custom' queue strategy.
 * The resolver will be used to resolve the QUEUE_DRIVER token from the DI container.
 *
 * @param resolver - A function that resolves DI tokens (e.g., container.resolve)
 *
 * @example
 * ```typescript
 * // In bootstrap.ts:
 * import { setQueueDIResolver } from '@open-mercato/queue'
 *
 * setQueueDIResolver(container.resolve.bind(container))
 * ```
 */
export function setQueueDIResolver(resolver: DIResolver): void {
  diResolver = resolver
}

/**
 * Resolves the custom queue driver from DI.
 * Throws if DI resolver is not set or driver is not registered.
 */
function resolveCustomDriver(): QueueDriver {
  if (!diResolver) {
    throw new Error(
      '[queue] Custom strategy requires DI resolver. Call setQueueDIResolver() at application bootstrap.'
    )
  }

  try {
    const driver = diResolver<QueueDriver>(DI_TOKENS.QUEUE_DRIVER)

    if (!driver || typeof driver.createQueue !== 'function') {
      throw new Error('[queue] QUEUE_DRIVER not registered or invalid. Ensure the messaging module is loaded.')
    }

    return driver
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUEUE_DRIVER')) {
      throw error
    }
    throw new Error(
      `[queue] Failed to resolve QUEUE_DRIVER from DI: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// ============================================================================
// Queue Factory
// ============================================================================

/**
 * Creates a queue instance with the specified strategy.
 *
 * @template T - The payload type for jobs in this queue
 * @param name - Unique name for the queue
 * @param strategy - Queue strategy: 'local' for file-based, 'async' for distributed, 'custom' for DI-resolved
 * @param options - Strategy-specific options
 * @returns A Queue instance
 *
 * @example
 * ```typescript
 * // Local file-based queue (development)
 * const localQueue = createQueue<MyJobData>('my-queue', 'local')
 *
 * // BullMQ-based queue (production)
 * const bullmqQueue = createQueue<MyJobData>('my-queue', 'async', {
 *   connection: { url: 'redis://localhost:6379' },
 *   concurrency: 5
 * })
 *
 * // Custom strategy (e.g., NATS via messaging module)
 * // Requires QUEUE_STRATEGY=custom and QUEUE_DRIVER registered in DI
 * const customQueue = createQueue<MyJobData>('my-queue', 'custom', {
 *   concurrency: 5
 * })
 * ```
 */
export function createQueue<T = unknown>(
  name: string,
  strategy: 'local',
  options?: LocalQueueOptions
): Queue<T>

export function createQueue<T = unknown>(
  name: string,
  strategy: 'async',
  options?: AsyncQueueOptions
): Queue<T>

export function createQueue<T = unknown>(
  name: string,
  strategy: 'custom',
  options?: CustomQueueOptions
): Queue<T>

// General overload for dynamic strategy (union type)
export function createQueue<T = unknown>(
  name: string,
  strategy: 'local' | 'async' | 'custom',
  options?: LocalQueueOptions | AsyncQueueOptions | CustomQueueOptions
): Queue<T>

export function createQueue<T = unknown>(
  name: string,
  strategy: 'local' | 'async' | 'custom',
  options?: LocalQueueOptions | AsyncQueueOptions | CustomQueueOptions
): Queue<T> {
  // Custom strategy: resolve driver from DI
  if (strategy === 'custom') {
    const driver = resolveCustomDriver()
    console.log(`[queue] Using custom driver: ${driver.id}`)
    return driver.createQueue<T>(name, options as CustomQueueOptions) as Queue<T>
  }

  // Async strategy: BullMQ
  if (strategy === 'async') {
    return createAsyncQueue<T>(name, options as BullMQProviderOptions)
  }

  // Local strategy
  return createLocalQueue<T>(name, options as LocalQueueOptions)
}

/**
 * Resolve the queue strategy from `QUEUE_STRATEGY`. Defaults to `'local'`.
 */
export function resolveQueueStrategy(): QueueStrategyType {
  return process.env.QUEUE_STRATEGY === 'async' ? 'async' : 'local'
}

/**
 * Create a module-owned queue using the strategy declared in `QUEUE_STRATEGY`.
 *
 * - When `QUEUE_STRATEGY=async`, builds a BullMQ queue and resolves the
 *   Redis URL via `getRedisUrlOrThrow('QUEUE')` so missing config fails loudly.
 * - Otherwise builds a local file-based queue.
 *
 * Replaces the boilerplate `process.env.QUEUE_STRATEGY === 'async' ? ... : ...`
 * pattern that every module queue helper used to repeat. Concurrency applies
 * to both strategies so the same number means the same thing in dev and prod.
 *
 * @example
 * ```typescript
 * export function getDataSyncQueue(name: string) {
 *   return createModuleQueue<MyJob>(name, { concurrency: 5 })
 * }
 * ```
 */
export function createModuleQueue<T = unknown>(
  name: string,
  options?: { concurrency?: number },
): Queue<T> {
  const strategy = resolveQueueStrategy()
  if (strategy === 'async') {
    return createAsyncQueue<T>(name, {
      connection: { url: getRedisUrlOrThrow('QUEUE') },
      concurrency: options?.concurrency,
    })
  }
  return createLocalQueue<T>(name, { concurrency: options?.concurrency })
}
