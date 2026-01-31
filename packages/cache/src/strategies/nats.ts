import type { CacheStrategy, CacheEntry, CacheGetOptions, CacheSetOptions, CacheValue } from '../types'
import { CacheDependencyUnavailableError } from '../errors'

type NatsConnection = {
  jetstream(): JetStreamClient
  drain(): Promise<void>
  close(): Promise<void>
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

type QueuedIterator<T> = AsyncIterable<T>

type KV = {
  put(key: string, value: Uint8Array): Promise<number>
  get(key: string): Promise<KvEntry | null>
  delete(key: string): Promise<void>
  keys(filter?: string): Promise<QueuedIterator<string>>
  purge(key: string): Promise<void>
}

type NatsConnectFn = (options: { servers: string }) => Promise<NatsConnection>

type PossibleNatsModule = {
  connect?: NatsConnectFn
  default?: { connect?: NatsConnectFn }
}

type RequireFn = (id: string) => unknown

let natsModulePromise: Promise<PossibleNatsModule> | null = null
type NatsRegistryEntry = { connection?: NatsConnection; kv?: KV; creating?: Promise<KV>; refs: number }
const natsRegistry = new Map<string, NatsRegistryEntry>()

function resolveRequire(): RequireFn | null {
  const nonWebpack = (globalThis as { __non_webpack_require__?: unknown }).__non_webpack_require__
  if (typeof nonWebpack === 'function') return nonWebpack as RequireFn
  if (typeof require === 'function') return require as RequireFn
  if (typeof module !== 'undefined' && typeof module.require === 'function') {
    return module.require.bind(module)
  }
  try {
    const maybeRequire = Function('return typeof require !== "undefined" ? require : undefined')()
    if (typeof maybeRequire === 'function') return maybeRequire as RequireFn
  } catch {
    // ignore
  }
  return null
}

function loadNatsModuleViaRequire(): PossibleNatsModule | null {
  const resolver = resolveRequire()
  if (!resolver) return null
  try {
    return resolver('nats') as PossibleNatsModule
  } catch {
    return null
  }
}

function pickNatsConnect(mod: PossibleNatsModule): NatsConnectFn | null {
  if (typeof mod.connect === 'function') return mod.connect
  if (mod.default && typeof mod.default.connect === 'function') return mod.default.connect
  return null
}

async function loadNatsModule(): Promise<PossibleNatsModule> {
  if (!natsModulePromise) {
    natsModulePromise = (async () => {
      const required = loadNatsModuleViaRequire() ?? (await import('nats'))
      return required as PossibleNatsModule
    })().catch((error) => {
      natsModulePromise = null
      throw new CacheDependencyUnavailableError('nats', 'nats', error)
    })
  }
  return natsModulePromise
}

function retainNatsEntry(key: string): NatsRegistryEntry {
  let entry = natsRegistry.get(key)
  if (!entry) {
    entry = { refs: 0 }
    natsRegistry.set(key, entry)
  }
  entry.refs += 1
  return entry
}

function buildRegistryKey(url: string, bucketName: string): string {
  return `${url}::${bucketName}`
}

async function acquireNatsKv(
  url: string,
  bucketName: string,
  entry: NatsRegistryEntry,
  defaultTtlNanos?: number
): Promise<KV> {
  if (entry.kv) return entry.kv
  if (entry.creating) return entry.creating

  entry.creating = loadNatsModule()
    .then(async (mod) => {
      const connect = pickNatsConnect(mod)
      if (!connect) {
        throw new CacheDependencyUnavailableError('nats', 'nats', new Error('No usable NATS connect function'))
      }

      const nc = await connect({ servers: url })
      entry.connection = nc

      const js = nc.jetstream()
      const kvOptions: KvOptions = { history: 1 }
      if (defaultTtlNanos) {
        kvOptions.ttl = defaultTtlNanos
      }

      const kv = await js.views.kv(bucketName, kvOptions)
      entry.kv = kv
      entry.creating = undefined

      return kv
    })
    .catch((error) => {
      entry.creating = undefined
      if (error instanceof CacheDependencyUnavailableError) throw error
      throw new CacheDependencyUnavailableError('nats', 'nats', error)
    })

  return entry.creating
}

async function releaseNatsEntry(registryKey: string, entry: NatsRegistryEntry): Promise<void> {
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs > 0) return

  natsRegistry.delete(registryKey)
  if (entry.connection) {
    try {
      await entry.connection.drain()
    } catch {
      // ignore shutdown errors
    } finally {
      entry.connection = undefined
      entry.kv = undefined
    }
  }
}

export type NatsStrategyOptions = {
  defaultTtl?: number // milliseconds
  bucketName?: string
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function encodeValue(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value))
}

function decodeValue(data: Uint8Array): unknown {
  return JSON.parse(textDecoder.decode(data))
}

/**
 * NATS KV cache strategy with tag support
 * Distributed, persistent across restarts, can be shared across multiple instances
 *
 * Uses NATS KV data structures:
 * - Keys for storing cache entries: data:{key} -> {value, tags, expiresAt, createdAt}
 * - Keys for tag index: tag:{tag} -> array of keys
 */
export function createNatsStrategy(natsUrl?: string, options?: NatsStrategyOptions): CacheStrategy {
  const defaultTtl = options?.defaultTtl
  const bucketName = options?.bucketName ?? process.env.CACHE_NATS_BUCKET ?? 'cache'
  const connectionUrl = natsUrl ?? process.env.NATS_URL ?? 'nats://localhost:4222'

  const dataPrefix = 'data.'
  const tagPrefix = 'tag.'

  // NATS KV TTL is in nanoseconds, we receive milliseconds
  const defaultTtlNanos = defaultTtl ? defaultTtl * 1_000_000 : undefined

  const registryKey = buildRegistryKey(connectionUrl, bucketName)
  const registryEntry = retainNatsEntry(registryKey)
  let kv: KV | null = registryEntry.kv ?? null

  async function getKv(): Promise<KV> {
    if (kv) return kv
    kv = await acquireNatsKv(connectionUrl, bucketName, registryEntry, defaultTtlNanos)
    return kv
  }

  function getDataKey(key: string): string {
    // NATS KV keys cannot contain dots at start/end or consecutive dots
    // Use base64url encoding for safety
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

  const get = async (key: string, options?: CacheGetOptions): Promise<CacheValue | null> => {
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
        // Clean up expired entry
        await deleteKey(key)
        return null
      }

      return entry.value
    } catch {
      return null
    }
  }

  const set = async (key: string, value: CacheValue, options?: CacheSetOptions): Promise<void> => {
    const bucket = await getKv()
    const dataKey = getDataKey(key)

    // Remove old entry from tag index if it exists
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

    // Store the entry (TTL is tracked in our CacheEntry.expiresAt, not NATS KV level)
    await bucket.put(dataKey, encodeValue(entry))

    // Add to tag index
    if (tags.length > 0) {
      await addKeyToTags(bucket, key, tags)
    }
  }

  const has = async (key: string): Promise<boolean> => {
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
  }

  const deleteKey = async (key: string): Promise<boolean> => {
    const bucket = await getKv()
    const dataKey = getDataKey(key)

    try {
      const kvEntry = await bucket.get(dataKey)
      if (!kvEntry) return false

      const entry = decodeValue(kvEntry.value) as CacheEntry

      // Remove from tag index
      if (entry.tags && entry.tags.length > 0) {
        await removeKeyFromTags(bucket, key, entry.tags)
      }

      // Delete the cache entry
      await bucket.purge(dataKey)
      return true
    } catch {
      // Try to delete even if we couldn't parse
      try {
        await bucket.purge(dataKey)
        return true
      } catch {
        return false
      }
    }
  }

  const deleteByTags = async (tags: string[]): Promise<number> => {
    const bucket = await getKv()
    const keysToDelete = new Set<string>()

    // Collect all keys that have any of the specified tags
    for (const tag of tags) {
      const members = await getTagMembers(bucket, tag)
      for (const key of members) {
        keysToDelete.add(key)
      }
    }

    // Delete all collected keys
    let deleted = 0
    for (const key of keysToDelete) {
      const success = await deleteKey(key)
      if (success) deleted++
    }

    return deleted
  }

  const clear = async (): Promise<number> => {
    const bucket = await getKv()

    // Collect all data keys
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

    // Delete all entries
    for (const key of [...dataKeys, ...tagKeys]) {
      try {
        await bucket.purge(key)
      } catch {
        // Ignore individual delete errors
      }
    }

    return dataKeys.length
  }

  const keys = async (pattern?: string): Promise<string[]> => {
    const bucket = await getKv()
    const result: string[] = []

    const keysIterator = await bucket.keys()
    for await (const key of keysIterator) {
      if (!key.startsWith(dataPrefix)) continue

      // Decode the original key
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
  }

  const stats = async (): Promise<{ size: number; expired: number }> => {
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
  }

  const cleanup = async (): Promise<number> => {
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
            // Decode original key for proper deletion with tag cleanup
            const encoded = key.substring(dataPrefix.length)
            const originalKey = Buffer.from(encoded, 'base64url').toString('utf-8')
            await deleteKey(originalKey)
            removed++
          }
        }
      } catch {
        // Remove invalid entries
        try {
          await bucket.purge(key)
          removed++
        } catch {
          // Ignore
        }
      }
    }

    return removed
  }

  const close = async (): Promise<void> => {
    await releaseNatsEntry(registryKey, registryEntry)
    kv = null
  }

  return {
    get,
    set,
    has,
    delete: deleteKey,
    deleteByTags,
    clear,
    keys,
    stats,
    cleanup,
    close,
  }
}
