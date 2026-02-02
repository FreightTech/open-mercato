import type { QueuedJob, JobContext, WorkerMeta, Queue } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { CurrencyFetchConfig } from '../data/entities'
import type { SyncPayload } from './currency-sync.worker'
import { SYNC_QUEUE_NAME } from './currency-sync.worker'

export const SCHEDULER_QUEUE_NAME = 'currency-scheduler'

export const metadata: WorkerMeta = {
  queue: SCHEDULER_QUEUE_NAME,
  concurrency: 1,
  id: 'currency-scheduler',
}

export type SchedulerPayload = {
  tick: number
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

/**
 * Convert a time in a specific timezone to HH:MM format in that timezone.
 * 
 * @param timezone - IANA timezone identifier (e.g., "America/New_York", "Europe/Warsaw")
 * @returns HH:MM string in the specified timezone
 */
function getCurrentTimeInTimezone(timezone: string): string {
  const now = new Date()
  
  try {
    // Format the current time in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    
    const parts = formatter.formatToParts(now)
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
    
    return `${hour}:${minute}`
  } catch (err) {
    // Fallback to UTC if timezone is invalid
    console.warn(`[scheduler] Invalid timezone "${timezone}", falling back to UTC`)
    return getCurrentTimeInTimezone('UTC')
  }
}

/**
 * Currency Scheduler Worker
 * 
 * Runs every minute to check which currency fetch configs should sync.
 * Matches configs where syncTime equals current time in their configured timezone.
 * 
 * Self-enqueuing: schedules itself to run again in 1 minute.
 * Prevents duplicate syncs by checking lastSyncAt (must be > 1 hour ago).
 */
export default async function handle(
  job: QueuedJob<SchedulerPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const syncQueue = ctx.resolve<Queue<SyncPayload>>('currencySyncQueue')
  const schedulerQueue = ctx.resolve<Queue<SchedulerPayload>>('currencySchedulerQueue')
  
  const now = new Date()
  const tick = job.payload.tick

  console.log(`[currency-scheduler] Tick ${tick} at ${now.toISOString()}`)

  // Find all enabled configs
  const configs = await em.find(CurrencyFetchConfig, {
    isEnabled: true,
    syncTime: { $ne: null }, // Must have a syncTime set
  })

  let enqueued = 0
  let skipped = 0

  for (const config of configs) {
    const timezone = config.timezone || 'UTC'
    const currentTimeInTz = getCurrentTimeInTimezone(timezone)

    // Check if current time matches syncTime
    if (config.syncTime !== currentTimeInTz) {
      continue
    }

    // Check if already synced in the last hour (prevent duplicate syncs)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    if (config.lastSyncAt && config.lastSyncAt > oneHourAgo) {
      skipped++
      console.log(
        `[currency-scheduler] Skipping ${config.provider} (tenant: ${config.tenantId}) - ` +
        `already synced at ${config.lastSyncAt.toISOString()}`
      )
      continue
    }

    // Enqueue sync job
    try {
      await syncQueue.enqueue({
        configId: config.id,
        tenantId: config.tenantId,
        organizationId: config.organizationId,
        provider: config.provider,
      })

      enqueued++
      console.log(
        `[currency-scheduler] ✅ Enqueued sync for ${config.provider} (tenant: ${config.tenantId}, tz: ${timezone})`
      )
    } catch (err: any) {
      console.error(
        `[currency-scheduler] ❌ Failed to enqueue ${config.provider}:`,
        err.message
      )
    }
  }

  if (enqueued > 0 || skipped > 0) {
    console.log(
      `[currency-scheduler] Summary: ${enqueued} enqueued, ${skipped} skipped (recent sync)`
    )
  }

  // Re-enqueue scheduler job for next minute
  // Note: This creates a self-perpetuating loop
  await schedulerQueue.enqueue(
    { tick: tick + 1 }
  )

  console.log(`[currency-scheduler] Scheduled next tick (${tick + 1}) in 1 minute`)
}
