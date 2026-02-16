import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // ─── Shipment CRUD ─────────────────────────────────────────────
  { id: 'shipment_tracking.shipment.created', label: 'Shipment Created', entity: 'shipment', category: 'crud' },
  { id: 'shipment_tracking.shipment.updated', label: 'Shipment Updated', entity: 'shipment', category: 'crud' },
  { id: 'shipment_tracking.shipment.deleted', label: 'Shipment Deleted', entity: 'shipment', category: 'crud' },

  // ─── Shipment Lifecycle ────────────────────────────────────────
  { id: 'shipment_tracking.shipment.status_changed', label: 'Shipment Status Changed', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.shipment.booked', label: 'Shipment Booked', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.shipment.delivered', label: 'Shipment Delivered', entity: 'shipment', category: 'lifecycle' },

  // ─── Transport Events (DCSA TRANSPORT) ─────────────────────────
  // Vessel/transport movement events per DCSA T&T standard
  { id: 'shipment_tracking.transport.departed', label: 'Transport Departed', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.transport.arrived', label: 'Transport Arrived', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.transport.eta_updated', label: 'ETA Updated', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.transport.etd_updated', label: 'ETD Updated', entity: 'shipment', category: 'lifecycle' },
  { id: 'shipment_tracking.transport.omitted', label: 'Port Omitted', entity: 'shipment', category: 'lifecycle' },

  // ─── Equipment Events (DCSA EQUIPMENT) ─────────────────────────
  // Container handling events per DCSA T&T standard
  { id: 'shipment_tracking.equipment.loaded', label: 'Container Loaded', entity: 'cargo_event', category: 'lifecycle' },
  { id: 'shipment_tracking.equipment.discharged', label: 'Container Discharged', entity: 'cargo_event', category: 'lifecycle' },
  { id: 'shipment_tracking.equipment.gate_in', label: 'Container Gate In', entity: 'cargo_event', category: 'lifecycle' },
  { id: 'shipment_tracking.equipment.gate_out', label: 'Container Gate Out', entity: 'cargo_event', category: 'lifecycle' },
  { id: 'shipment_tracking.equipment.available_pickup', label: 'Available for Pickup', entity: 'cargo_event', category: 'lifecycle' },
  { id: 'shipment_tracking.equipment.customs_released', label: 'Customs Released', entity: 'cargo_event', category: 'lifecycle' },
  { id: 'shipment_tracking.equipment.inspected', label: 'Container Inspected', entity: 'cargo_event', category: 'lifecycle' },

  // ─── Cargo Events (generic) ────────────────────────────────────
  { id: 'shipment_tracking.cargo_event.created', label: 'Cargo Event Created', entity: 'cargo_event', category: 'crud' },

  // ─── Internal Events (excluded from webhook triggers) ──────────
  // Tracking jobs - internal system events
  { id: 'shipment_tracking.tracking_job.created', label: 'Tracking Job Created', entity: 'tracking_job', category: 'crud', excludeFromTriggers: true },
  { id: 'shipment_tracking.tracking_job.updated', label: 'Tracking Job Updated', entity: 'tracking_job', category: 'crud', excludeFromTriggers: true },
  { id: 'shipment_tracking.tracking_job.failed', label: 'Tracking Job Failed', entity: 'tracking_job', category: 'lifecycle', excludeFromTriggers: true },
  { id: 'shipment_tracking.tracking_job.completed', label: 'Tracking Job Completed', entity: 'tracking_job', category: 'lifecycle', excludeFromTriggers: true },

  // Webhook delivery - internal infrastructure events
  { id: 'shipment_tracking.webhook.delivery_success', label: 'Webhook Delivery Success', entity: 'webhook_delivery', category: 'lifecycle', excludeFromTriggers: true },
  { id: 'shipment_tracking.webhook.delivery_failed', label: 'Webhook Delivery Failed', entity: 'webhook_delivery', category: 'lifecycle', excludeFromTriggers: true },

  // ─── Deprecated Events ─────────────────────────────────────────
  // Replaced by transport.eta_updated and transport.etd_updated
  { id: 'shipment_tracking.shipment.schedule_changed', label: 'Shipment Schedule Changed (deprecated)', entity: 'shipment', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'shipment_tracking',
  events,
})

export const emitShipmentTrackingEvent = eventsConfig.emit

export type ShipmentTrackingEventId = typeof events[number]['id']

export default eventsConfig
