/**
 * NATS KV Cache Driver
 *
 * Implements the CacheDriver interface from @open-mercato/shared/lib/drivers.
 * Uses NATS KV (Key-Value) store for distributed caching.
 *
 * This driver is registered in DI by the messaging module when NATS is enabled.
 * It's used when CACHE_STRATEGY=custom to provide NATS-backed caching.
 *
 * @example
 * ```typescript
 * // Register in DI (done by messaging module):
 * const driver = createNatsCacheDriver()
 * container.register({ [DI_TOKENS.CACHE_DRIVER]: asValue(driver) })
 *
 * // Then use via cache package:
 * const cache = createCacheService({ strategy: 'custom' })
 * await cache.set('user:123', { name: 'John' })
 * ```
 */

import type {
  CacheDriver,
  CacheDriverOptions,
  CacheStrategyInterface,
} from '@open-mercato/shared/lib/drivers'

// NATS types (minimal interface for KV operations)
type NatsConnection = {
  jetstream(opts?: { domain?: string }): JetStreamClient
  drain(): Promise<void>
  isClosed(): boolean
}

type JetStreamClient = {
  views: {
    kv(name: string, options?: KvOptions): Promise<KV>
  }
}

type KvOptions = {
  history?: number
  ttl?: number // nanoseconds
}

type KvEntry = {
  key: string
  value: Uint8Array
  revision: number
}

type KV = {
  put(key: string, value: Uint8Array): Promise<number>
  get(key: string): Promise<KvEntry | null>
  delete(key: string): Promise<void>
  keys(filter?: string): Promise<AsyncIterable<string>>
  purge(key: string): Promise<void>
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
 * Cache entry stored in NATS KV.
 */
type CacheEntry = {
  key: string
  value: unknown
  tags: string[]
  expiresAt: number | null
  createdAt: number
}

/**
 * Options for the NATS cache driver.
 */
export interface NatsCacheDriverOptions {
  /** NATS server URL(s). Defaults to NATS_URL env var or localhost:4222 */
  servers?: string | string[]
  /** Authentication token. Defaults to NATS_TOKEN env var */
  token?: string
  /** KV bucket name. Defaults to 'cache' */
  bucketName?: string
  /** Enable debug logging */
  debug?: boolean
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function encodeValue(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value))
}

function decodeValue(data: Uint8Array): unknown {
  return JSON.parse(textDecoder.decode(data))
}

// Shared connection state
let sharedNc: NatsConnection | null = null
let connectionPromise: Promise<void> | null = null
let connectionRefCount = 0

/**
 * Creates a NATS KV cache driver.
 *
 * The driver manages its own NATS connection (shared across all cache instances).
 *
 * @param options - Driver options
 * @returns A CacheDriver instance
 */
export function createNatsCacheDriver(options?: NatsCacheDriverOptions): CacheDriver {
  const debug = options?.debug ?? process.env.MESSAGING_DEBUG === 'true'
  const servers = options?.servers ?? process.env.NATS_URL ?? 'localhost:4222'
  const token = options?.token ?? process.env.NATS_TOKEN
  const defaultBucketName = options?.bucketName ?? process.env.CACHE_NATS_BUCKET ?? 'cache'

  function log(...args: unknown[]): void {
    if (debug) console.log('[nats:cache]', ...args)
  }

  async function ensureConnection(): Promise<NatsConnection> {
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
        name: 'open-mercato-cache',
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

  return {
    id: 'nats',
    name: 'NATS KV',

    createStrategy(driverOptions?: CacheDriverOptions): CacheStrategyInterface {
      const defaultTtl = driverOptions?.defaultTtl
      const bucketName = (driverOptions?.bucketName as string) ?? defaultBucketName

      const dataPrefix = 'data.'
      const tagPrefix = 'tag.'

      // NATS KV TTL is in nanoseconds, we receive milliseconds
      const defaultTtlNanos = defaultTtl ? defaultTtl * 1_000_000 : undefined

      connectionRefCount++

      let kv: KV | null = null

      async function getKv(): Promise<KV> {
        if (kv) return kv

        const nc = await ensureConnection()
        const js = nc.jetstream()
        const kvOptions: KvOptions = { history: 1 }
        if (defaultTtlNanos) {
          kvOptions.ttl = defaultTtlNanos
        }

        kv = await js.views.kv(bucketName, kvOptions)
        log(`Connected to KV bucket ${bucketName}`)
        return kv
      }

      function getDataKey(key: string): string {
        const encoded = Buffer.from(key).toString('base64url')
        return `${dataPrefix}${encoded}`
      }

      function getTagKey(tag: string): string {
        const encoded = Buffer.from(tag).toString('base64url')
        return `${tagPrefix}${encoded}`
      }

      function isExpired(entry: CacheEntry): boolean {
        if (entry.expiresAt === null) return false
        return Date.now() > entry.expiresAt
      }

      function matchPattern(key: string, pattern: string): boolean {
        const regexPattern = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
        const regex = new RegExp(`^${regexPattern}$`)
        return regex.test(key)
      }

      async function getTagMembers(bucket: KV, tag: string): Promise<string[]> {
        const tagKey = getTagKey(tag)
        try {
          const entry = await bucket.get(tagKey)
          if (!entry) return []
          const members = decodeValue(entry.value) as string[]
          return Array.isArray(members) ? members : []
        } catch {
          return []
        }
      }

      async function setTagMembers(bucket: KV, tag: string, members: string[]): Promise<void> {
        const tagKey = getTagKey(tag)
        if (members.length === 0) {
          try {
            await bucket.purge(tagKey)
          } catch {
            // Key might not exist
          }
        } else {
          await bucket.put(tagKey, encodeValue(members))
        }
      }

      async function addKeyToTags(bucket: KV, key: string, tags: string[]): Promise<void> {
        for (const tag of tags) {
          const members = await getTagMembers(bucket, tag)
          if (!members.includes(key)) {
            members.push(key)
            await setTagMembers(bucket, tag, members)
          }
        }
      }

      async function removeKeyFromTags(bucket: KV, key: string, tags: string[]): Promise<void> {
        for (const tag of tags) {
          const members = await getTagMembers(bucket, tag)
          const index = members.indexOf(key)
          if (index !== -1) {
            members.splice(index, 1)
            await setTagMembers(bucket, tag, members)
          }
        }
      }

      async function deleteKey(key: string): Promise<boolean> {
        const bucket = await getKv()
        const dataKey = getDataKey(key)

        try {
          const kvEntry = await bucket.get(dataKey)
          if (!kvEntry) return false

          const entry = decodeValue(kvEntry.value) as CacheEntry

          if (entry.tags && entry.tags.length > 0) {
            await removeKeyFromTags(bucket, key, entry.tags)
          }

          await bucket.purge(dataKey)
          return true
        } catch {
          try {
            await bucket.purge(dataKey)
            return true
          } catch {
            return false
          }
        }
      }

      return {
        async get(key: string, options?: { returnExpired?: boolean }): Promise<unknown | null> {
          const bucket = await getKv()
          const dataKey = getDataKey(key)

          try {
            const kvEntry = await bucket.get(dataKey)
            if (!kvEntry) return null

            const entry = decodeValue(kvEntry.value) as CacheEntry

            if (isExpired(entry)) {
              if (options?.returnExpired) {
                return entry.value
              }
              await deleteKey(key)
              return null
            }

            return entry.value
          } catch {
            return null
          }
        },

        async set(key: string, value: unknown, options?: { ttl?: number; tags?: string[] }): Promise<void> {
          const bucket = await getKv()
          const dataKey = getDataKey(key)

          try {
            const oldKvEntry = await bucket.get(dataKey)
            if (oldKvEntry) {
              const oldEntry = decodeValue(oldKvEntry.value) as CacheEntry
              if (oldEntry.tags && oldEntry.tags.length > 0) {
                await removeKeyFromTags(bucket, key, oldEntry.tags)
              }
            }
          } catch {
            // Ignore errors when getting old entry
          }

          const ttl = options?.ttl ?? defaultTtl
          const tags = options?.tags ?? []
          const expiresAt = ttl ? Date.now() + ttl : null

          const entry: CacheEntry = {
            key,
            value,
            tags,
            expiresAt,
            createdAt: Date.now(),
          }

          await bucket.put(dataKey, encodeValue(entry))

          if (tags.length > 0) {
            await addKeyToTags(bucket, key, tags)
          }
        },

        async has(key: string): Promise<boolean> {
          const bucket = await getKv()
          const dataKey = getDataKey(key)

          try {
            const kvEntry = await bucket.get(dataKey)
            if (!kvEntry) return false

            const entry = decodeValue(kvEntry.value) as CacheEntry
            if (isExpired(entry)) {
              await deleteKey(key)
              return false
            }
            return true
          } catch {
            return false
          }
        },

        async delete(key: string): Promise<boolean> {
          return deleteKey(key)
        },

        async deleteByTags(tags: string[]): Promise<number> {
          const bucket = await getKv()
          const keysToDelete = new Set<string>()

          for (const tag of tags) {
            const members = await getTagMembers(bucket, tag)
            for (const key of members) {
              keysToDelete.add(key)
            }
          }

          let deleted = 0
          for (const key of keysToDelete) {
            const success = await deleteKey(key)
            if (success) deleted++
          }

          return deleted
        },

        async clear(): Promise<number> {
          const bucket = await getKv()

          const dataKeys: string[] = []
          const tagKeys: string[] = []

          const keysIterator = await bucket.keys()
          for await (const key of keysIterator) {
            if (key.startsWith(dataPrefix)) {
              dataKeys.push(key)
            } else if (key.startsWith(tagPrefix)) {
              tagKeys.push(key)
            }
          }

          for (const key of [...dataKeys, ...tagKeys]) {
            try {
              await bucket.purge(key)
            } catch {
              // Ignore individual delete errors
            }
          }

          return dataKeys.length
        },

        async keys(pattern?: string): Promise<string[]> {
          const bucket = await getKv()
          const result: string[] = []

          const keysIterator = await bucket.keys()
          for await (const key of keysIterator) {
            if (!key.startsWith(dataPrefix)) continue

            const encoded = key.substring(dataPrefix.length)
            let originalKey: string
            try {
              originalKey = Buffer.from(encoded, 'base64url').toString('utf-8')
            } catch {
              continue
            }

            if (pattern && !matchPattern(originalKey, pattern)) continue
            result.push(originalKey)
          }

          return result
        },

        async stats(): Promise<{ size: number; expired: number }> {
          const bucket = await getKv()
          let size = 0
          let expired = 0

          const keysIterator = await bucket.keys()
          for await (const key of keysIterator) {
            if (!key.startsWith(dataPrefix)) continue

            size++
            try {
              const kvEntry = await bucket.get(key)
              if (kvEntry) {
                const entry = decodeValue(kvEntry.value) as CacheEntry
                if (isExpired(entry)) {
                  expired++
                }
              }
            } catch {
              // Ignore parse errors
            }
          }

          return { size, expired }
        },

        async cleanup(): Promise<number> {
          const bucket = await getKv()
          let removed = 0

          const keysToCheck: string[] = []
          const keysIterator = await bucket.keys()
          for await (const key of keysIterator) {
            if (key.startsWith(dataPrefix)) {
              keysToCheck.push(key)
            }
          }

          for (const key of keysToCheck) {
            try {
              const kvEntry = await bucket.get(key)
              if (kvEntry) {
                const entry = decodeValue(kvEntry.value) as CacheEntry
                if (isExpired(entry)) {
                  const encoded = key.substring(dataPrefix.length)
                  const originalKey = Buffer.from(encoded, 'base64url').toString('utf-8')
                  await deleteKey(originalKey)
                  removed++
                }
              }
            } catch {
              try {
                await bucket.purge(key)
                removed++
              } catch {
                // Ignore
              }
            }
          }

          return removed
        },

        async close(): Promise<void> {
          kv = null

          connectionRefCount--
          if (connectionRefCount <= 0 && sharedNc) {
            try {
              await sharedNc.drain()
              log('Shared NATS connection closed')
            } catch {
              // Ignore drain errors
            }
            sharedNc = null
          }

          log(`Cache strategy for bucket ${bucketName} closed`)
        },
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
