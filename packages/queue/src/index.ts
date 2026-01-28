/**
 * @open-mercato/queue
 *
 * Multi-strategy job queue package supporting local (file-based) and async (distributed) strategies.
 * The async strategy supports multiple providers: BullMQ (Redis) and NATS JetStream.
 *
 * @example
 * ```typescript
 * import { createQueue } from '@open-mercato/queue'
 *
 * // Create a local queue (development)
 * const localQueue = createQueue<{ userId: string }>('my-queue', 'local')
 *
 * // Create an async queue with BullMQ (default)
 * const bullmqQueue = createQueue<{ userId: string }>('my-queue', 'async', {
 *   connection: { url: 'redis://localhost:6379' }
 * })
 *
 * // Create an async queue with NATS JetStream
 * const natsQueue = createQueue<{ userId: string }>('my-queue', 'async', {
 *   provider: 'nats',
 *   connection: { servers: 'nats://localhost:4222' }
 * })
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
export { createQueue } from './factory'

// Provider-specific exports (for advanced use cases)
export { createBullMQQueue, createAsyncQueue } from './strategies/async'
export { createNatsQueue } from './strategies/nats'

// Worker utilities
export * from './worker/registry'
export { runWorker, createRoutedHandler } from './worker/runner'
