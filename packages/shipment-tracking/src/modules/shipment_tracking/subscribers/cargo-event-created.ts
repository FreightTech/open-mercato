export const metadata = {
  event: 'shipment_tracking.cargo_event.created',
  persistent: true,
  id: 'shipment_tracking:cargo-event-created',
}

type CargoEventCreatedPayload = {
  id: string
  shipmentId: string
  eventCode: string
  eventType: string
  tenantId: string
  organizationId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(payload: CargoEventCreatedPayload, ctx: ResolverContext) {
  try {
    const webhookService = ctx.resolve<any>('shipmentTrackingWebhookService')

    await webhookService.dispatchEvent({
      eventType: 'cargo_event.created',
      payload: {
        type: 'cargo_event.created',
        cargoEventId: payload.id,
        shipmentId: payload.shipmentId,
        eventCode: payload.eventCode,
        eventType: payload.eventType,
        timestamp: new Date().toISOString(),
      },
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })
  } catch (error) {
    console.error('[shipment-tracking:subscriber] Failed to dispatch cargo_event.created webhook:', error)
  }
}
