import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import type { Queue } from '@open-mercato/queue'
import { Webhook, WebhookDelivery } from '../data/entities'
import type { WebhookDeliveryPayload } from '../workers/webhook-delivery.worker'

type WebhookServiceDeps = {
  em: () => EntityManager
  eventBus: EventBus
  webhookQueue: Queue<WebhookDeliveryPayload>
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
      await this.deps.webhookQueue.enqueue({
        deliveryId: delivery.id,
        webhookId: webhook.id,
        url: webhook.url,
        hmacSecret: webhook.hmacSecret,
        payload: input.payload,
        eventType: input.eventType,
      })

      enqueued++
    }

    return enqueued
  }
}
