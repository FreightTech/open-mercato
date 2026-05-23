import type { JobContext, QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { CurrencyFetchConfig } from '../data/entities'
import type { RateFetchingService } from '../services/rateFetchingService'

// Inlined to keep the metadata literal extractable by the module generator.
// Must match FETCH_RATES_QUEUE_NAME in lib/fetchScheduleService.ts.
export const metadata: WorkerMeta = {
  queue: 'currencies-fetch-rates',
  id: 'currencies-fetch-rates',
  concurrency: 2,
}

export type FetchRatesPayload = {
  configId: string
  tenantId: string
  organizationId: string
  provider: string
}

type HandlerContext = JobContext & {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(
  job: QueuedJob<FetchRatesPayload>,
  ctx: HandlerContext,
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { configId, tenantId, organizationId, provider } = job.payload

  const config = await em.findOne(CurrencyFetchConfig, {
    id: configId,
    tenantId,
    organizationId,
  })

  if (!config || !config.isEnabled) {
    return
  }

  // The currencies module always registers rateFetchingService in di.ts; if
  // resolution fails, that's a real misconfiguration and should not be masked
  // by a hardcoded provider fallback (which would also miss any custom
  // providers a downstream registers).
  const fetchService = ctx.resolve<RateFetchingService>('rateFetchingService')

  try {
    const result = await fetchService.fetchRatesForDate(
      new Date(),
      { tenantId, organizationId },
      { providers: [provider] },
    )

    config.lastSyncAt = new Date()
    config.lastSyncCount = result.totalFetched
    config.lastSyncStatus = result.errors.length > 0 ? 'partial' : 'success'
    config.lastSyncMessage =
      result.errors.length > 0
        ? result.errors.join('; ')
        : `Successfully synced ${result.totalFetched} rate(s)`

    await em.persist(config).flush()
  } catch (err: any) {
    config.lastSyncAt = new Date()
    config.lastSyncStatus = 'error'
    config.lastSyncMessage = err?.message ?? 'Unknown error'
    config.lastSyncCount = 0
    await em.persist(config).flush()
    throw err
  }
}
