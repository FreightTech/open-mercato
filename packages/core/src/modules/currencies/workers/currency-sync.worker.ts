import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { RateFetchingService } from '../services/rateFetchingService'
import { CurrencyFetchConfig } from '../data/entities'
import { NBPProvider } from '../services/providers/nbp'
import { RaiffeisenPolandProvider } from '../services/providers/raiffeisen'

export const SYNC_QUEUE_NAME = 'currency-sync'

export const metadata: WorkerMeta = {
  queue: SYNC_QUEUE_NAME,
  concurrency: 2,
  id: 'currency-sync',
}

export type SyncPayload = {
  configId: string
  tenantId: string
  organizationId: string
  provider: string
}

/**
 * Currency Sync Worker
 * 
 * Fetches exchange rates for a specific provider configuration.
 * Updates the config entity with sync status, count, and any errors.
 * 
 * Retry: 3 attempts with exponential backoff (configured in queue)
 */
type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<SyncPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { configId, tenantId, organizationId, provider } = job.payload

  console.log(`[currency-sync] Starting sync for ${provider} (config: ${configId})`)

  // Load config
  const config = await em.findOne(CurrencyFetchConfig, { id: configId })
  if (!config || !config.isEnabled) {
    console.log(`[currency-sync] Config ${configId} not found or disabled, skipping`)
    return
  }

  // Initialize rate fetching service
  const fetchService = new RateFetchingService(em)
  fetchService.registerProvider(new NBPProvider())
  fetchService.registerProvider(new RaiffeisenPolandProvider())

  try {
    const date = new Date()
    const result = await fetchService.fetchRatesForDate(
      date,
      { tenantId, organizationId },
      { providers: [provider] }
    )

    // Update config status
    config.lastSyncAt = new Date()
    config.lastSyncCount = result.totalFetched
    config.lastSyncStatus = result.errors.length > 0 ? 'partial' : 'success'
    config.lastSyncMessage = result.errors.length > 0
      ? result.errors.join('; ')
      : `Successfully synced ${result.totalFetched} rate(s)`

    await em.persist(config).flush()

    console.log(
      `[currency-sync] ✅ ${provider}: ${result.totalFetched} rate(s) fetched (tenant: ${tenantId})`
    )

    if (result.errors.length > 0) {
      console.warn(`[currency-sync] ⚠️  ${provider}: ${result.errors.length} error(s)`)
      result.errors.forEach((err) => console.warn(`  - ${err}`))
    }
  } catch (err: any) {
    // Update config with error
    config.lastSyncAt = new Date()
    config.lastSyncStatus = 'error'
    config.lastSyncMessage = err.message
    config.lastSyncCount = 0

    await em.persist(config).flush()

    console.error(`[currency-sync] ❌ ${provider} failed:`, err.message)

    // Re-throw to trigger retry mechanism
    throw err
  }
}
