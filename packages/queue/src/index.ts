/**
 * @open-mercato/queue
 *
 * Multi-strategy job queue package supporting local, async, and custom strategies.
 * - local: File-based queue for development
 * - async: BullMQ (Redis) for production
 * - custom: DI-resolved driver (e.g., NATS via messaging module)
 *
 * @example
 * ```typescript
 * import { createQueue, setQueueDIResolver } from '@open-mercato/queue'
 *
 * // Create a local queue (development)
 * const localQueue = createQueue<{ userId: string }>('my-queue', 'local')
 *
 * // Create an async queue with BullMQ
 * const bullmqQueue = createQueue<{ userId: string }>('my-queue', 'async', {
 *   connection: { url: 'redis://localhost:6379' }
 * })
 *
 * // Create a custom queue (e.g., NATS via messaging module)
 * // First set up DI resolver at bootstrap:
 * setQueueDIResolver(container.resolve.bind(container))
 * // Then create the queue:
 * const customQueue = createQueue<{ userId: string }>('my-queue', 'custom')
 *
 * // Enqueue a job
 * await queue.enqueue({ userId: '123' })
 *
 * // Process jobs
 * await queue.process(async (job, ctx) => {
 *   console.log(`Processing job ${ctx.jobId}:`, job.payload)
 * })
 * ```
 */

export * from './types'
export { createQueue, setQueueDIResolver } from './factory'

// Provider-specific exports (for advanced use cases)
export { createAsyncQueue } from './strategies/async'

// Worker utilities
export * from './worker/registry'
export { runWorker, createRoutedHandler } from './worker/runner'
