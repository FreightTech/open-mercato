import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import { createQueue } from '@open-mercato/queue'
import { Webhook, WebhookDelivery } from '../data/entities'

type WebhookServiceDeps = {
  em: () => EntityManager
  eventBus: EventBus
}

/**
 * Finds matching webhooks for an event type and enqueues delivery jobs.
 */
export class WebhookService {
  private deps: WebhookServiceDeps

  constructor(deps: WebhookServiceDeps) {
    this.deps = deps
  }

  async dispatchEvent(input: {
    eventType: string
    payload: Record<string, unknown>
    tenantId: string
    organizationId: string
  }): Promise<number> {
    const em = this.deps.em()

    const webhooks = await em.find(Webhook, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      isActive: true,
    })

    // Filter to webhooks subscribed to this event type
    const matching = webhooks.filter((webhook) =>
      webhook.eventsSubscribed.includes(input.eventType) ||
      webhook.eventsSubscribed.includes('*'),
    )

    if (matching.length === 0) {
      return 0
    }

    const queueStrategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
    const queue = createQueue('shipment-tracking-webhook', queueStrategy, {
      connection: { url: process.env.REDIS_URL || process.env.QUEUE_REDIS_URL },
    })

    let enqueued = 0

    for (const webhook of matching) {
      // Create delivery record
      const delivery = em.create(WebhookDelivery, {
        webhook,
        eventType: input.eventType,
        status: 'pending',
        payload: input.payload,
        retryCount: 0,
      })

      em.persist(delivery)
      await em.flush()

      // Enqueue delivery job
      await queue.enqueue({
        deliveryId: delivery.id,
        webhookId: webhook.id,
        url: webhook.url,
        hmacSecret: webhook.hmacSecret,
        payload: input.payload,
        eventType: input.eventType,
      })

      enqueued++
    }

    await queue.close()
    return enqueued
  }
}
