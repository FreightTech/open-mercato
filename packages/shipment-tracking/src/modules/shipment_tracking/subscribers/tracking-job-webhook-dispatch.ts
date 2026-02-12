import type { WebhookService } from '../services/webhookService'

export const metadata = {
  event: 'shipment_tracking.tracking_job.*',
  persistent: true,
  id: 'shipment_tracking:tracking-job-webhook-dispatch',
}

type TrackingJobEventPayload = {
  id: string
  shipmentId?: string
  carrierName?: string
  tenantId: string
  organizationId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
  eventName: string
}

export default async function handle(payload: TrackingJobEventPayload, ctx: ResolverContext) {
  try {
    const webhookService = ctx.resolve<WebhookService>('shipmentTrackingWebhookService')

    // Extract the action from the event name (e.g., "created", "updated", "failed")
    const eventParts = ctx.eventName.split('.')
    const action = eventParts[eventParts.length - 1]

    await webhookService.dispatchEvent({
      eventType: `tracking_job.${action}`,
      payload: {
        type: `tracking_job.${action}`,
        trackingJobId: payload.id,
        shipmentId: payload.shipmentId,
        carrierName: payload.carrierName,
        timestamp: new Date().toISOString(),
      },
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })

    console.log(`[shipment-tracking:webhook-dispatch] Dispatched tracking_job.${action} for job ${payload.id}`)
  } catch (error) {
    console.error('[shipment-tracking:webhook-dispatch] Failed to dispatch tracking_job webhook:', error)
  }
}
