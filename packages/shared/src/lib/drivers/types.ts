/**
 * Driver Abstraction Layer
 *
 * Provides package-agnostic interfaces for queue and cache drivers.
 * Drivers are implemented in external packages (e.g., messaging) and registered via DI.
 * The queue/cache packages resolve them lazily when `strategy: 'custom'` is configured.
 *
 * This follows the same pattern as TransportDriver for events.
 */

// ============================================================================
// Queue Driver
// ============================================================================

/**
 * Options for creating a queue via a custom driver.
 */
export interface QueueDriverOptions {
  /** Number of concurrent job processors. Defaults to 1 */
  concurrency?: number
  /** Additional driver-specific options */
  [key: string]: unknown
}

/**
 * Abstract Queue Driver Interface.
 *
 * Implemented by external packages (e.g., messaging) to provide custom queue backends.
 * When QUEUE_STRATEGY=custom, the queue package resolves this from DI.
 *
 * @example
 * ```typescript
 * // In messaging package:
 * const natsQueueDriver: QueueDriver = {
 *   id: 'nats',
 *   name: 'NATS JetStream',
 *   createQueue: (name, options) => createNatsQueue(connection, name, options),
 *   isAvailable: () => connection.isConnected(),
 * }
 *
 * // Register in DI:
 * container.register({ [DI_TOKENS.QUEUE_DRIVER]: asValue(natsQueueDriver) })
 * ```
 */
export interface QueueDriver {
  /** Unique identifier for this driver (e.g., 'nats', 'sqs') */
  readonly id: string
  /** Human-readable name (e.g., 'NATS JetStream') */
  readonly name: string

  /**
   * Creates a queue instance using this driver.
   *
   * @param name - Unique name for the queue
   * @param options - Optional queue configuration
   * @returns A Queue instance compatible with @open-mercato/queue
   */
  createQueue<T = unknown>(name: string, options?: QueueDriverOptions): QueueInterface<T>

  /**
   * Check if the driver is available and ready to create queues.
   * Optional - defaults to true if not implemented.
   */
  isAvailable?(): Promise<boolean> | boolean
}

/**
 * Minimal queue interface that drivers must return.
 * This matches the Queue interface from @open-mercato/queue.
 */
export interface QueueInterface<T = unknown> {
  readonly name: string
  readonly strategy: 'local' | 'async' | 'custom'
  readonly provider?: string

  enqueue(data: T): Promise<string>
  process(
    handler: (job: QueuedJobInterface<T>, ctx: JobContextInterface) => Promise<void> | void,
    options?: { limit?: number }
  ): Promise<{ processed: number; failed: number; lastJobId?: string }>
  clear(): Promise<{ removed: number }>
  close(): Promise<void>
  getJobCounts(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
  }>
}

/**
 * Minimal job interface that drivers must use.
 */
export interface QueuedJobInterface<T = unknown> {
  id: string
  payload: T
  createdAt: string
  metadata?: Record<string, unknown>
}

/**
 * Minimal job context interface that drivers must provide.
 */
export interface JobContextInterface {
  jobId: string
  attemptNumber: number
  queueName: string
}

// ============================================================================
// Cache Driver
// ============================================================================

/**
 * Options for creating a cache strategy via a custom driver.
 */
export interface CacheDriverOptions {
  /** Default TTL in milliseconds */
  defaultTtl?: number
  /** Additional driver-specific options */
  [key: string]: unknown
}

/**
 * Abstract Cache Driver Interface.
 *
 * Implemented by external packages (e.g., messaging) to provide custom cache backends.
 * When CACHE_STRATEGY=custom, the cache package resolves this from DI.
 *
 * @example
 * ```typescript
 * // In messaging package:
 * const natsCacheDriver: CacheDriver = {
 *   id: 'nats',
 *   name: 'NATS KV',
 *   createStrategy: (options) => createNatsKVStrategy(connection, options),
 *   isAvailable: () => connection.isConnected(),
 * }
 *
 * // Register in DI:
 * container.register({ [DI_TOKENS.CACHE_DRIVER]: asValue(natsCacheDriver) })
 * ```
 */
export interface CacheDriver {
  /** Unique identifier for this driver (e.g., 'nats', 'dynamodb') */
  readonly id: string
  /** Human-readable name (e.g., 'NATS KV') */
  readonly name: string

  /**
   * Creates a cache strategy using this driver.
   *
   * @param options - Optional cache configuration
   * @returns A CacheStrategy instance compatible with @open-mercato/cache
   */
  createStrategy(options?: CacheDriverOptions): CacheStrategyInterface

  /**
   * Check if the driver is available and ready to create strategies.
   * Optional - defaults to true if not implemented.
   */
  isAvailable?(): Promise<boolean> | boolean
}

/**
 * Minimal cache strategy interface that drivers must return.
 * This matches the CacheStrategy interface from @open-mercato/cache.
 */
export interface CacheStrategyInterface {
  get(key: string, options?: { returnExpired?: boolean }): Promise<unknown | null>
  set(key: string, value: unknown, options?: { ttl?: number; tags?: string[] }): Promise<void>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<boolean>
  deleteByTags(tags: string[]): Promise<number>
  clear(): Promise<number>
  keys(pattern?: string): Promise<string[]>
  stats(): Promise<{ size: number; expired: number }>
  cleanup?(): Promise<number>
  close?(): Promise<void>
}

// ============================================================================
// Storage Driver
// ============================================================================

/**
 * Abstract Storage Driver Interface.
 *
 * Implemented by external packages (e.g., messaging) to provide custom storage backends.
 * Uses a bucket + object key model suitable for object stores (NATS Object Store, S3, etc.).
 *
 * @example
 * ```typescript
 * // In messaging package:
 * const natsStorageDriver: StorageDriver = {
 *   id: 'nats',
 *   name: 'NATS Object Store',
 *   writeFile: (bucket, name, data, meta) => putBlob(bucket, name, data, meta),
 *   readFile: (bucket, name) => getBlob(bucket, name),
 *   deleteFile: (bucket, name) => deleteBlob(bucket, name),
 *   fileExists: (bucket, name) => blobExists(bucket, name),
 * }
 *
 * // Register in DI:
 * container.register({ [DI_TOKENS.STORAGE_DRIVER]: asValue(natsStorageDriver) })
 * ```
 */
export interface StorageDriver {
  /** Unique identifier for this driver (e.g., 'nats', 's3') */
  readonly id: string
  /** Human-readable name (e.g., 'NATS Object Store') */
  readonly name: string

  /**
   * Write a file to the store.
   *
   * @param bucketKey - Logical bucket/partition name
   * @param objectName - Object key within the bucket
   * @param data - File contents
   * @param metadata - Optional key-value metadata to store alongside the file
   */
  writeFile(bucketKey: string, objectName: string, data: Buffer, metadata?: Record<string, string>): Promise<void>

  /**
   * Read a file from the store.
   *
   * @param bucketKey - Logical bucket/partition name
   * @param objectName - Object key within the bucket
   * @returns File contents as a Buffer
   * @throws When the object does not exist
   */
  readFile(bucketKey: string, objectName: string): Promise<Buffer>

  /**
   * Delete a file from the store.
   *
   * @param bucketKey - Logical bucket/partition name
   * @param objectName - Object key within the bucket
   */
  deleteFile(bucketKey: string, objectName: string): Promise<void>

  /**
   * Check whether a file exists in the store.
   *
   * @param bucketKey - Logical bucket/partition name
   * @param objectName - Object key within the bucket
   */
  fileExists(bucketKey: string, objectName: string): Promise<boolean>

  /**
   * Check if the driver is available and ready.
   * Optional — defaults to true if not implemented.
   */
  isAvailable?(): Promise<boolean> | boolean
}

// ============================================================================
// DI Tokens
// ============================================================================

/**
 * DI tokens for driver injection.
 *
 * External packages register drivers using these tokens.
 * Queue/cache packages resolve drivers using these tokens when strategy is 'custom'.
 */
export const DI_TOKENS = {
  /** Token for the queue driver (optional, registered by messaging or other packages) */
  QUEUE_DRIVER: 'queueDriver',
  /** Token for the cache driver (optional, registered by messaging or other packages) */
  CACHE_DRIVER: 'cacheDriver',
  /** Token for the storage driver (optional, registered by messaging or other packages) */
  STORAGE_DRIVER: 'storageDriver',
} as const
