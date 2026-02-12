import type { WebhookService } from '../services/webhookService'

export const metadata = {
  event: 'shipment_tracking.shipment.*',
  persistent: true,
  id: 'shipment_tracking:shipment-webhook-dispatch',
}

type ShipmentEventPayload = {
  id: string
  tenantId: string
  organizationId: string
  previousStatus?: string
  newStatus?: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
  eventName: string
}

export default async function handle(payload: ShipmentEventPayload, ctx: ResolverContext) {
  try {
    const webhookService = ctx.resolve<WebhookService>('shipmentTrackingWebhookService')

    // Extract the action from the event name (e.g., "created", "updated", "status_changed")
    const eventParts = ctx.eventName.split('.')
    const action = eventParts[eventParts.length - 1]

    await webhookService.dispatchEvent({
      eventType: `shipment.${action}`,
      payload: {
        type: `shipment.${action}`,
        shipmentId: payload.id,
        previousStatus: payload.previousStatus,
        newStatus: payload.newStatus,
        timestamp: new Date().toISOString(),
      },
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })

    console.log(`[shipment-tracking:webhook-dispatch] Dispatched shipment.${action} for shipment ${payload.id}`)
  } catch (error) {
    console.error('[shipment-tracking:webhook-dispatch] Failed to dispatch shipment webhook:', error)
  }
}
