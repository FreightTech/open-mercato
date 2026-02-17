/**
 * @open-mercato/shipment-tracking
 *
 * Ocean container shipment tracking with pluggable carrier adapters and webhooks
 */

export {
  Shipment,
  TrackingJob,
  TrackingEvent,
  CarrierConfig,
  Webhook,
  WebhookDelivery,
} from './modules/shipment_tracking/data/entities.js'

export type { CarrierAdapter, CarrierAdapterTestResult } from './modules/shipment_tracking/lib/carrier-adapter.js'
export type { ShipmentStatus } from './modules/shipment_tracking/lib/status-machine.js'
export { deriveShipmentStatus } from './modules/shipment_tracking/lib/status-machine.js'
export { extractShipmentTimes } from './modules/shipment_tracking/lib/time-extraction.js'
