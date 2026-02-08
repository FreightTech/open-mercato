import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // Shipment CRUD
  { id: 'shipment_tracking.shipment.created', label: 'Shipment Created', entity: 'shipment', category: 'crud' },
  { id: 'shipment_tracking.shipment.updated', label: 'Shipment Updated', entity: 'shipment', category: 'crud' },
  { id: 'shipment_tracking.shipment.deleted', label: 'Shipment Deleted', entity: 'shipment', category: 'crud' },

  // Shipment lifecycle
  { id: 'shipment_tracking.shipment.status_changed', label: 'Shipment Status Changed', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.shipment.schedule_changed', label: 'Shipment Schedule Changed', entity: 'shipment', category: 'lifecycle' },

  // Cargo events
  { id: 'shipment_tracking.cargo_event.created', label: 'Cargo Event Created', entity: 'cargo_event', category: 'crud' },

  // Tracking jobs
  { id: 'shipment_tracking.tracking_job.created', label: 'Tracking Job Created', entity: 'tracking_job', category: 'crud' },
  { id: 'shipment_tracking.tracking_job.updated', label: 'Tracking Job Updated', entity: 'tracking_job', category: 'crud' },
  { id: 'shipment_tracking.tracking_job.failed', label: 'Tracking Job Failed', entity: 'tracking_job', category: 'lifecycle' },
  { id: 'shipment_tracking.tracking_job.completed', label: 'Tracking Job Completed', entity: 'tracking_job', category: 'lifecycle' },

  // Webhook delivery
  { id: 'shipment_tracking.webhook.delivery_success', label: 'Webhook Delivery Success', entity: 'webhook_delivery', category: 'lifecycle' },
  { id: 'shipment_tracking.webhook.delivery_failed', label: 'Webhook Delivery Failed', entity: 'webhook_delivery', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'shipment_tracking',
  events,
})

export const emitShipmentTrackingEvent = eventsConfig.emit

export type ShipmentTrackingEventId = typeof events[number]['id']

export default eventsConfig
