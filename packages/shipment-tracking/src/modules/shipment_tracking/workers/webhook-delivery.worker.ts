import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import { WebhookDelivery } from '../data/entities'
import { dispatchWebhook } from '../lib/webhook-dispatcher'

export const metadata: WorkerMeta = {
  queue: 'shipment-tracking-webhook',
  concurrency: 10,
}

export type WebhookDeliveryPayload = {
  deliveryId: string
  webhookId: string
  url: string
  hmacSecret?: string | null
  payload: Record<string, unknown>
  eventType: string
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

const MAX_RETRIES = 5
const RETRY_DELAYS_MS = [
  30_000,      // 30s
  120_000,     // 2m
  600_000,     // 10m
  1_800_000,   // 30m
  3_600_000,   // 1h
]

export default async function webhookDeliveryWorker(
  job: QueuedJob<WebhookDeliveryPayload>,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  const data = (job.payload || (job as any).data) as WebhookDeliveryPayload | undefined

  if (!data || !data.deliveryId) {
    console.error('[shipment-tracking:webhook] Invalid job payload')
    throw new Error('deliveryId is required in job payload')
  }

  const em = ctx.resolve<EntityManager>('em')
  const eventBus = ctx.resolve<EventBus>('eventBus')

  const delivery = await em.findOne(WebhookDelivery, { id: data.deliveryId })
  if (!delivery) {
    console.warn(`[shipment-tracking:webhook] Delivery not found: ${data.deliveryId}`)
    return
  }

  const result = await dispatchWebhook({
    url: data.url,
    payload: data.payload,
    hmacSecret: data.hmacSecret,
  })

  delivery.responseStatus = result.responseStatus ?? null
  delivery.responseBody = result.responseBody ?? null

  if (result.success) {
    delivery.status = 'success'
    delivery.errorMessage = null
    await em.flush()

    await eventBus.emit('shipment_tracking.webhook.delivery_success', {
      deliveryId: delivery.id,
      webhookId: data.webhookId,
      eventType: data.eventType,
    })
  } else {
    delivery.errorMessage = result.errorMessage ?? null
    delivery.retryCount = (delivery.retryCount || 0) + 1

    if (delivery.retryCount >= MAX_RETRIES) {
      delivery.status = 'failed'
      await em.flush()

      await eventBus.emit('shipment_tracking.webhook.delivery_failed', {
        deliveryId: delivery.id,
        webhookId: data.webhookId,
        eventType: data.eventType,
        retryCount: delivery.retryCount,
        lastError: result.errorMessage,
      })
    } else {
      // Schedule retry
      const delayMs = RETRY_DELAYS_MS[delivery.retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      delivery.nextRetryAt = new Date(Date.now() + delayMs)
      delivery.status = 'pending'
      await em.flush()

      // Re-enqueue for retry
      const { createQueue } = await import('@open-mercato/queue')
      const queueStrategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
      const queue = createQueue('shipment-tracking-webhook', queueStrategy, {
        connection: { url: process.env.REDIS_URL || process.env.QUEUE_REDIS_URL },
      })

      await queue.enqueue(data)
      await queue.close()
    }
  }
}
