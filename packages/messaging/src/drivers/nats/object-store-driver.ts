/**
 * NATS Object Store Storage Driver
 *
 * Implements the StorageDriver interface from @open-mercato/shared/lib/drivers.
 * Uses NATS Object Store for distributed file/blob storage.
 *
 * This driver is registered in DI by the messaging module when NATS is enabled.
 *
 * @example
 * ```typescript
 * // Register in DI (done by messaging module):
 * const driver = createNatsObjectStoreDriver()
 * container.register({ [DI_TOKENS.STORAGE_DRIVER]: asValue(driver) })
 *
 * // Then use via the StorageDriver interface:
 * await driver.writeFile('attachments', 'invoice.pdf', fileBuffer)
 * const data = await driver.readFile('attachments', 'invoice.pdf')
 * ```
 */

import type { StorageDriver } from '@open-mercato/shared/lib/drivers'

// NATS types (minimal interface for Object Store operations)
type NatsConnection = {
  jetstream(opts?: { domain?: string }): JetStreamClient
  drain(): Promise<void>
  isClosed(): boolean
}

type JetStreamClient = {
  views: {
    os(name: string, options?: ObjectStoreOptions): Promise<ObjectStore>
  }
}

type ObjectStoreOptions = {
  description?: string
}

type ObjectInfo = {
  name: string
  size: number
  chunks: number
  deleted: boolean
  metadata?: Record<string, string>
}

type ObjectStore = {
  putBlob(meta: { name: string; metadata?: Record<string, string> }, data: Uint8Array | null): Promise<ObjectInfo>
  getBlob(name: string): Promise<Uint8Array | null>
  delete(name: string): Promise<{ purged: boolean }>
  info(name: string): Promise<ObjectInfo | null>
}

type NatsModule = {
  connect(opts: {
    servers: string | string[]
    token?: string
    user?: string
    pass?: string
    name?: string
  }): Promise<NatsConnection>
}

/**
 * Options for the NATS Object Store driver.
 */
export interface NatsObjectStoreDriverOptions {
  /** NATS server URL(s). Defaults to NATS_URL env var or localhost:4222 */
  servers?: string | string[]
  /** Authentication token. Defaults to NATS_TOKEN env var */
  token?: string
  /** Prefix for Object Store bucket names. Defaults to 'attachments' */
  bucketPrefix?: string
  /** Enable debug logging */
  debug?: boolean
  /** Pre-existing NATS connection (skips internal connection management) */
  connection?: NatsConnection
}

// Shared connection state (mirrors cache-driver.ts)
let sharedNc: NatsConnection | null = null
let connectionPromise: Promise<void> | null = null

/**
 * Creates a NATS Object Store storage driver.
 *
 * The driver manages its own NATS connection (shared across all storage instances),
 * or accepts an externally managed connection via the `connection` option.
 *
 * @param options - Driver options
 * @returns A StorageDriver instance
 */
export function createNatsObjectStoreDriver(options?: NatsObjectStoreDriverOptions): StorageDriver {
  const debug = options?.debug ?? process.env.MESSAGING_DEBUG === 'true'
  const servers = options?.servers ?? process.env.NATS_URL ?? 'localhost:4222'
  const token = options?.token ?? process.env.NATS_TOKEN
  const bucketPrefix = options?.bucketPrefix ?? 'attachments'
  const externalConnection = options?.connection ?? null

  // Bucket cache: avoids re-opening the same Object Store bucket on every call
  const bucketCache = new Map<string, ObjectStore>()

  function log(...args: unknown[]): void {
    if (debug) console.log('[nats:objstore]', ...args)
  }

  async function ensureConnection(): Promise<NatsConnection> {
    // Use external connection if provided
    if (externalConnection && !externalConnection.isClosed()) {
      return externalConnection
    }

    if (sharedNc && !sharedNc.isClosed()) {
      return sharedNc
    }

    if (connectionPromise) {
      await connectionPromise
      if (sharedNc) {
        return sharedNc
      }
    }

    connectionPromise = (async () => {
      const nats = await import('nats') as unknown as NatsModule

      const connectOptions: Parameters<NatsModule['connect']>[0] = {
        servers,
        name: 'open-mercato-objstore',
      }

      if (token) {
        connectOptions.token = token
      }

      sharedNc = await nats.connect(connectOptions)
      log(`Connected to NATS at ${servers}`)
    })()

    await connectionPromise
    connectionPromise = null

    return sharedNc!
  }

  function getBucketName(bucketKey: string): string {
    return `${bucketPrefix}-${bucketKey}`
  }

  async function getBucket(bucketKey: string): Promise<ObjectStore> {
    const name = getBucketName(bucketKey)
    const cached = bucketCache.get(name)
    if (cached) return cached

    const nc = await ensureConnection()
    const js = nc.jetstream()
    const os = await js.views.os(name)
    bucketCache.set(name, os)
    log(`Opened Object Store bucket: ${name}`)
    return os
  }

  return {
    id: 'nats',
    name: 'NATS Object Store',

    async writeFile(
      bucketKey: string,
      objectName: string,
      data: Buffer,
      metadata?: Record<string, string>
    ): Promise<void> {
      const os = await getBucket(bucketKey)
      const meta: { name: string; metadata?: Record<string, string> } = { name: objectName }
      if (metadata && Object.keys(metadata).length > 0) {
        meta.metadata = metadata
      }
      await os.putBlob(meta, new Uint8Array(data))
      log(`Written ${objectName} to ${getBucketName(bucketKey)} (${data.length} bytes)`)
    },

    async readFile(bucketKey: string, objectName: string): Promise<Buffer> {
      const os = await getBucket(bucketKey)
      const data = await os.getBlob(objectName)
      if (!data) {
        throw new Error(`Object not found: ${objectName} in ${getBucketName(bucketKey)}`)
      }
      log(`Read ${objectName} from ${getBucketName(bucketKey)} (${data.byteLength} bytes)`)
      return Buffer.from(data)
    },

    async deleteFile(bucketKey: string, objectName: string): Promise<void> {
      const os = await getBucket(bucketKey)
      await os.delete(objectName)
      log(`Deleted ${objectName} from ${getBucketName(bucketKey)}`)
    },

    async fileExists(bucketKey: string, objectName: string): Promise<boolean> {
      const os = await getBucket(bucketKey)
      try {
        const info = await os.info(objectName)
        return info !== null && !info.deleted
      } catch {
        return false
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        const nc = await ensureConnection()
        return !nc.isClosed()
      } catch {
        return false
      }
    },
  }
}
