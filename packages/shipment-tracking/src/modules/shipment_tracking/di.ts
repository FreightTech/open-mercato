import { asClass } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createQueue } from '@open-mercato/queue'
import { CarrierRegistryService } from './services/carrierRegistry'
import { TrackingService } from './services/trackingService'
import { WebhookService } from './services/webhookService'
import { registerAllAdapters } from './lib/adapters'

export function register(container: AppContainer) {
  container.register({
    shipmentTrackingCarrierRegistry: asClass(CarrierRegistryService).singleton(),
  })

  container.register({
    shipmentTrackingPollQueue: {
      resolve: () => {
        const strategy = process.env.QUEUE_STRATEGY || 'local'
        return strategy === 'async'
          ? createQueue('shipment-tracking-poll', 'async', {
              connection: { url: process.env.REDIS_URL || process.env.QUEUE_REDIS_URL },
            })
          : createQueue('shipment-tracking-poll', 'local')
      },
    },
  })

  container.register({
    shipmentTrackingService: {
      resolve: () => {
        const cache = container.resolve<any>('cache')
        return new TrackingService({
          em: () => container.resolve('em'),
          eventBus: container.resolve('eventBus'),
          carrierRegistry: container.resolve('shipmentTrackingCarrierRegistry'),
          cacheService: {
            get: (key: string) => cache.get(key),
            set: (key: string, value: string, ttlSeconds?: number) =>
              cache.set(key, value, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined),
          },
        })
      },
    },
  })

  container.register({
    shipmentTrackingWebhookQueue: {
      resolve: () => {
        const strategy = process.env.QUEUE_STRATEGY || 'local'
        return strategy === 'async'
          ? createQueue('shipment-tracking-webhook', 'async', {
              connection: { url: process.env.REDIS_URL || process.env.QUEUE_REDIS_URL },
            })
          : createQueue('shipment-tracking-webhook', 'local')
      },
    },
  })

  container.register({
    shipmentTrackingWebhookService: {
      resolve: () => new WebhookService({
        em: () => container.resolve('em'),
        eventBus: container.resolve('eventBus'),
        webhookQueue: container.resolve('shipmentTrackingWebhookQueue'),
      }),
    },
  })

  // Register all built-in carrier adapters
  const registry = container.resolve<CarrierRegistryService>('shipmentTrackingCarrierRegistry')
  registerAllAdapters(registry)

  console.log('[shipment-tracking] DI registered')
}
