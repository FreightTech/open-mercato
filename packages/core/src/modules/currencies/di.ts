import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/core'
import { createQueue } from '@open-mercato/queue'
import { RateFetchingService } from './services/rateFetchingService'
import { ExchangeRateService } from './services/exchangeRateService'
import { NBPProvider } from './services/providers/nbp'
import { RaiffeisenPolandProvider } from './services/providers/raiffeisen'
import { SYNC_QUEUE_NAME } from './workers/currency-sync.worker'

/**
 * Currency module DI registrations
 */
export async function register(container: AppContainer) {
  container.register({
    rateFetchingService: {
      resolve: (c) => {
        const em = c.resolve<EntityManager>('em')
        const service = new RateFetchingService(em)
        
        // Register default providers
        service.registerProvider(new NBPProvider())
        service.registerProvider(new RaiffeisenPolandProvider())
        
        return service
      },
    },
    exchangeRateService: {
      resolve: (c) => {
        const em = c.resolve<EntityManager>('em')
        const rateFetchingService = c.resolve<RateFetchingService>('rateFetchingService')
        return new ExchangeRateService(em, rateFetchingService)
      },
    },
    // Currency sync queue
    currencySyncQueue: {
      resolve: () => {
        const strategy = process.env.QUEUE_STRATEGY || 'local'
        return strategy === 'async'
          ? createQueue(SYNC_QUEUE_NAME, 'async', {
              connection: { url: process.env.REDIS_URL || process.env.QUEUE_REDIS_URL },
            })
          : createQueue(SYNC_QUEUE_NAME, 'local')
      },
    },
  })
}

