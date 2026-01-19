/**
 * FMS Projects Module - Type Definitions
 * Enums and types for project management (shipment operations)
 */

// Project status - tracks workflow progression
export const FMS_PROJECT_STATUSES = [
  'draft',
  'plan_route',
  'add_cargo',
  'validated',
  'confirmed',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
] as const
export type FmsProjectStatus = (typeof FMS_PROJECT_STATUSES)[number]

// Transport modes for route legs
export const TRANSPORT_MODES = ['truck', 'ship', 'train', 'air', 'barge'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

// Cargo types
export const CARGO_TYPES = ['fcl', 'lcl'] as const
export type CargoType = (typeof CARGO_TYPES)[number]

// Container types (ISO 6346 standard)
export const CONTAINER_TYPES = [
  '20GP', // 20ft General Purpose
  '40GP', // 40ft General Purpose
  '40HC', // 40ft High Cube
  '45HC', // 45ft High Cube
  '20RF', // 20ft Refrigerated
  '40RF', // 40ft Refrigerated
  '20OT', // 20ft Open Top
  '40OT', // 40ft Open Top
  '20FR', // 20ft Flat Rack
  '40FR', // 40ft Flat Rack
] as const
export type ContainerType = (typeof CONTAINER_TYPES)[number]

// Shipment types (matches quotes module)
export const SHIPMENT_TYPES = ['EXP', 'IMP', 'RAIL', 'FTL', 'LTL', 'DEPOT'] as const
export type ShipmentType = (typeof SHIPMENT_TYPES)[number]

// Direction
export const DIRECTIONS = ['export', 'import', 'domestic'] as const
export type Direction = (typeof DIRECTIONS)[number]

// Incoterms
export const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const
export type Incoterm = (typeof INCOTERMS)[number]

// Weight units
export const WEIGHT_UNITS = ['kg', 'lb', 'ton', 'mt'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

// Volume units
export const VOLUME_UNITS = ['cbm', 'cft', 'liter'] as const
export type VolumeUnit = (typeof VOLUME_UNITS)[number]

// Dimension units
export const DIMENSION_UNITS = ['cm', 'in', 'm', 'ft'] as const
export type DimensionUnit = (typeof DIMENSION_UNITS)[number]

// Currency codes (ISO 4217 - common subset)
export const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'PLN', 'CNY', 'JPY', 'AUD', 'CAD'] as const
export type CurrencyCode = (typeof CURRENCY_CODES)[number]

// Container ownership
export const CONTAINER_OWNERSHIP_TYPES = ['soc', 'coc'] as const // Shipper Owned, Carrier Owned
export type ContainerOwnershipType = (typeof CONTAINER_OWNERSHIP_TYPES)[number]

// Packaging types for LCL
export const PACKAGING_TYPES = [
  'box',
  'crate',
  'pallet',
  'drum',
  'bag',
  'bale',
  'bundle',
  'coil',
  'roll',
  'other',
] as const
export type PackagingType = (typeof PACKAGING_TYPES)[number]

// Cargo readiness status
export const CARGO_READINESS_STATUSES = ['not_ready', 'ready', 'collected', 'in_transit', 'delivered'] as const
export type CargoReadinessStatus = (typeof CARGO_READINESS_STATUSES)[number]

// Invoice extraction confidence levels
export const INVOICE_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'REVIEW'] as const
export type InvoiceConfidenceLevel = (typeof INVOICE_CONFIDENCE_LEVELS)[number]

// Invoice review status
export const INVOICE_REVIEW_STATUSES = ['pending_review', 'approved', 'rejected'] as const
export type InvoiceReviewStatus = (typeof INVOICE_REVIEW_STATUSES)[number]

// ============================================================================
// Transport Unit Types (Multi-Modal)
// ============================================================================

// Shared transport unit status (sea & road)
export const TRANSPORT_UNIT_STATUSES = ['not_ready', 'ready', 'in_transit', 'delivered'] as const
export type TransportUnitStatus = (typeof TRANSPORT_UNIT_STATUSES)[number]

// Air delivery status
export const AIR_DELIVERY_STATUSES = ['awaiting', 'booked', 'in_transit', 'delivered'] as const
export type AirDeliveryStatus = (typeof AIR_DELIVERY_STATUSES)[number]

// Air origin/destination type
export const AIR_LOCATION_TYPES = ['airport', 'warehouse', 'door'] as const
export type AirLocationType = (typeof AIR_LOCATION_TYPES)[number]

// Air ULD types (optional, for unitised cargo only)
export const AIR_UNIT_TYPES = ['pmc', 'ake', 'pag', 'paj', 'pla', 'rkn'] as const
export type AirUnitType = (typeof AIR_UNIT_TYPES)[number]

// Road vehicle types
export const ROAD_VEHICLE_TYPES = ['ftl_truck', 'ltl_truck', 'van', 'flatbed', 'reefer_truck', 'tanker'] as const
export type RoadVehicleType = (typeof ROAD_VEHICLE_TYPES)[number]
