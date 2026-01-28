import type { Queue, LocalQueueOptions, AsyncQueueOptions, BullMQProviderOptions, NatsProviderOptions } from './types'
import { createLocalQueue } from './strategies/local'
import { createBullMQQueue } from './strategies/async'
import { createNatsQueue } from './strategies/nats'

/**
 * Type guard to check if options are for NATS provider.
 */
function isNatsProvider(options?: AsyncQueueOptions): options is NatsProviderOptions {
  return options?.provider === 'nats'
}

/**
 * Resolves the async provider from options or environment.
 */
function resolveAsyncProvider(options?: AsyncQueueOptions): 'bullmq' | 'nats' {
  // Explicit provider in options takes precedence
  if (options?.provider) {
    return options.provider
  }

  // Check environment variable
  const envProvider = process.env.QUEUE_PROVIDER?.toLowerCase()
  if (envProvider === 'nats') {
    return 'nats'
  }

  // Default to bullmq
  return 'bullmq'
}

/**
 * Creates a queue instance with the specified strategy.
 *
 * @template T - The payload type for jobs in this queue
 * @param name - Unique name for the queue
 * @param strategy - Queue strategy: 'local' for file-based, 'async' for distributed
 * @param options - Strategy-specific options
 * @returns A Queue instance
 *
 * @example
 * ```typescript
 * // Local file-based queue (development)
 * const localQueue = createQueue<MyJobData>('my-queue', 'local')
 *
 * // BullMQ-based queue (default async provider)
 * const bullmqQueue = createQueue<MyJobData>('my-queue', 'async', {
 *   connection: { url: 'redis://localhost:6379' },
 *   concurrency: 5
 * })
 *
 * // NATS JetStream-based queue
 * const natsQueue = createQueue<MyJobData>('my-queue', 'async', {
 *   provider: 'nats',
 *   connection: { servers: 'nats://localhost:4222' },
 *   concurrency: 5
 * })
 *
 * // Or via QUEUE_PROVIDER=nats environment variable
 * const queue = createQueue<MyJobData>('my-queue', 'async')
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

// General overload for dynamic strategy (union type)
export function createQueue<T = unknown>(
  name: string,
  strategy: 'local' | 'async',
  options?: LocalQueueOptions | AsyncQueueOptions
): Queue<T>

export function createQueue<T = unknown>(
  name: string,
  strategy: 'local' | 'async',
  options?: LocalQueueOptions | AsyncQueueOptions
): Queue<T> {
  if (strategy === 'async') {
    const asyncOptions = options as AsyncQueueOptions | undefined
    const provider = resolveAsyncProvider(asyncOptions)

    if (provider === 'nats') {
      // Build NATS options from async options
      const natsOptions: NatsProviderOptions = isNatsProvider(asyncOptions)
        ? asyncOptions
        : {
            provider: 'nats',
            concurrency: asyncOptions?.concurrency,
          }

      return createNatsQueue<T>(name, natsOptions)
    }

    // Default to BullMQ
    return createBullMQQueue<T>(name, asyncOptions as BullMQProviderOptions)
  }

  return createLocalQueue<T>(name, options as LocalQueueOptions)
}
