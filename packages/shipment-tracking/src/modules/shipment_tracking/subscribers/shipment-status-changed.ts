export const metadata = {
  event: 'shipment_tracking.shipment.status_changed',
  persistent: true,
  id: 'shipment_tracking:shipment-status-changed',
}

type StatusChangedPayload = {
  id: string
  previousStatus: string
  newStatus: string
  tenantId: string
  organizationId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(payload: StatusChangedPayload, ctx: ResolverContext) {
  try {
    const webhookService = ctx.resolve<any>('shipmentTrackingWebhookService')

    await webhookService.dispatchEvent({
      eventType: 'shipment.status_changed',
      payload: {
        type: 'shipment.status_changed',
        shipmentId: payload.id,
        previousStatus: payload.previousStatus,
        newStatus: payload.newStatus,
        timestamp: new Date().toISOString(),
      },
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })
  } catch (error) {
    console.error('[shipment-tracking:subscriber] Failed to dispatch status_changed webhook:', error)
  }
}
