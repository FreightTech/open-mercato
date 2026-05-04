import { createHash } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/core'
import { CurrencyFetchConfig } from '../data/entities'

export const FETCH_RATES_QUEUE_NAME = 'currencies-fetch-rates'

type SchedulerServiceLike = {
  register: (registration: {
    id: string
    name: string
    description?: string
    scopeType: 'organization'
    organizationId: string
    tenantId: string
    scheduleType: 'cron' | 'interval'
    scheduleValue: string
    timezone?: string
    targetType: 'queue'
    targetQueue: string
    targetPayload: Record<string, unknown>
    requireFeature?: string
    sourceType: 'module'
    sourceModule: string
    isEnabled?: boolean
  }) => Promise<void>
  unregister: (scheduleId: string) => Promise<void>
}

/**
 * Convert an "HH:MM" sync time to a daily cron expression `M H * * *`.
 * Returns null when input is missing or malformed (caller decides what to do).
 */
export function syncTimeToCron(syncTime: string | null | undefined): string | null {
  if (!syncTime) return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(syncTime)
  if (!match) return null
  const hour = String(parseInt(match[1], 10))
  const minute = String(parseInt(match[2], 10))
  return `${minute} ${hour} * * *`
}

/**
 * Deterministic UUID derived from a stable namespace string (SHA-256 → RFC 4122 v5 layout).
 * Same input always yields the same id, so re-registering a schedule upserts the
 * underlying `scheduled_jobs` row instead of creating duplicates.
 */
export function stableUuidFromString(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex')
  const bytes = hash.slice(0, 32).split('')
  // Set version (5) and RFC 4122 variant bits
  bytes[12] = '5'
  const variantNibble = parseInt(hash[16], 16)
  bytes[16] = ((variantNibble & 0x3) | 0x8).toString(16)
  const out = bytes.join('')
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20, 32)}`
}

export function buildFetchScheduleId(configId: string): string {
  return stableUuidFromString(`currencies:fetch-rates:${configId}`)
}

export function createFetchScheduleService(
  em: EntityManager,
  schedulerService?: SchedulerServiceLike,
) {
  async function syncFromConfig(config: CurrencyFetchConfig): Promise<void> {
    if (!schedulerService) return

    const scheduleId = buildFetchScheduleId(config.id)

    if (!config.isEnabled || !config.syncTime) {
      await schedulerService.unregister(scheduleId).catch(() => undefined)
      return
    }

    const cron = syncTimeToCron(config.syncTime)
    if (!cron) {
      await schedulerService.unregister(scheduleId).catch(() => undefined)
      return
    }

    await schedulerService.register({
      id: scheduleId,
      name: `Currencies: fetch rates (${config.provider})`,
      description: `Daily exchange-rate fetch for ${config.provider}`,
      scopeType: 'organization',
      organizationId: config.organizationId,
      tenantId: config.tenantId,
      scheduleType: 'cron',
      scheduleValue: cron,
      timezone: config.timezone || 'UTC',
      targetType: 'queue',
      targetQueue: FETCH_RATES_QUEUE_NAME,
      targetPayload: {
        configId: config.id,
        provider: config.provider,
        tenantId: config.tenantId,
        organizationId: config.organizationId,
      },
      requireFeature: 'currencies.fetch.manage',
      sourceType: 'module',
      sourceModule: 'currencies',
      isEnabled: config.isEnabled,
    })
  }

  async function removeForConfig(configId: string): Promise<void> {
    if (!schedulerService) return
    const scheduleId = buildFetchScheduleId(configId)
    await schedulerService.unregister(scheduleId).catch(() => undefined)
  }

  async function reconcile(scope: { tenantId: string; organizationId: string }): Promise<number> {
    if (!schedulerService) return 0
    const configs = await em.find(CurrencyFetchConfig, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    let synced = 0
    for (const config of configs) {
      await syncFromConfig(config)
      synced++
    }
    return synced
  }

  return {
    syncFromConfig,
    removeForConfig,
    reconcile,
  }
}

export type CurrencyFetchScheduleService = ReturnType<typeof createFetchScheduleService>
