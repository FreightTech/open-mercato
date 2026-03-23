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

// Invoicing status - tracks financial state of the project
export const INVOICING_STATUSES = [
  'not_invoiced',    // No invoice created yet
  'invoiced',        // Invoice sent to client
  'partially_paid',  // Some payment received
  'paid_resolved',   // Fully paid and closed
] as const
export type InvoicingStatus = (typeof INVOICING_STATUSES)[number]

// Transport modes for route legs (aligned with fms_offers module)
export const TRANSPORT_MODES = ['sea', 'air', 'road', 'rail', 'barge'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

// Cargo types
export const CARGO_TYPES = ['fcl', 'lcl'] as const
export type CargoType = (typeof CARGO_TYPES)[number]

// Common container types for UI suggestions (human-readable codes)
// Note: Synced containers may have ISO 6346 codes like "22G1", "45R1" instead
// This is a free-form string field - these are just common suggestions for dropdowns
export const CONTAINER_TYPES = [
  '20GP', // 20ft General Purpose
  '40GP', // 40ft General Purpose
  '40HC', // 40ft High Cube
  '45HC', // 45ft High Cube
  '45PW', // 45ft Pallet Wide
  '20RF', // 20ft Refrigerated
  '40RF', // 40ft Refrigerated
  '20OT', // 20ft Open Top
  '40OT', // 40ft Open Top
  '20FR', // 20ft Flat Rack
  '40FR', // 40ft Flat Rack
] as const

// ContainerType is now a free-form string (accepts ISO codes like "22G1" or human-readable like "40HC")
export type ContainerType = string

// Shipment types (matches offers module)
export const SHIPMENT_TYPES = ['EXP', 'IMP', 'RAIL', 'FTL', 'LTL', 'AIR', 'DEPOT'] as const
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

// Sea container status - aligned with ShipmentStatusEnum from shipment-tracking
// Extended to support full shipment lifecycle tracking
export const SEA_CONTAINER_STATUSES = [
  // Shipment-tracking aligned statuses (UPPERCASE)
  'PENDING',      // Initial state, no tracking yet
  'BOOKED',       // Booking confirmed with carrier
  'DEPARTED',     // Vessel has departed origin
  'IN_TRANSIT',   // En route to destination
  'PRE_ARRIVAL',  // Approaching destination port
  'ARRIVED',      // Arrived at destination port
  'DELIVERED',    // Delivered to consignee
  // FMS-specific operational statuses (lowercase for distinction)
  'gate_in',      // Container entered terminal
  'loaded',       // Container loaded on vessel
  'discharged',   // Container discharged from vessel
  'gate_out',     // Container exited terminal
  'returned',     // Empty container returned
] as const
export type SeaContainerStatus = (typeof SEA_CONTAINER_STATUSES)[number]

// Legacy transport unit status (for FmsRoadUnit, backward compat)
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

// ============================================================================
// Project Line Types (Financial Tracking)
// ============================================================================

// Project line source types
export const PROJECT_LINE_SOURCE_TYPES = ['offer', 'manual'] as const
export type ProjectLineSourceType = (typeof PROJECT_LINE_SOURCE_TYPES)[number]

// ============================================================================
// Shipments Module Types
// ============================================================================

// VGM status for sea containers
export const VGM_STATUSES = ['pending', 'submitted', 'verified'] as const
export type VgmStatus = (typeof VGM_STATUSES)[number]

// Customs clearance status
export const CUSTOMS_CLEARANCE_STATUSES = ['pending', 'in_progress', 'cleared'] as const
export type CustomsClearanceStatus = (typeof CUSTOMS_CLEARANCE_STATUSES)[number]

// ============================================================================
// CargoWise-Aligned Types (New)
// ============================================================================

// Container mode (FCL vs LCL distinction)
export const CONTAINER_MODES = ['FCL', 'LCL'] as const
export type ContainerMode = (typeof CONTAINER_MODES)[number]

// Service level
export const SERVICE_LEVELS = ['STANDARD', 'EXPRESS', 'PRIORITY'] as const
export type ServiceLevel = (typeof SERVICE_LEVELS)[number]

// Release type (Bill of Lading type)
export const RELEASE_TYPES = ['ORIGINAL', 'EXPRESS', 'SEAWAY_BILL'] as const
export type ReleaseType = (typeof RELEASE_TYPES)[number]

// Pack types for cargo
export const PACK_TYPES = ['PLT', 'CTN', 'PKG', 'UNT', 'BOX', 'CRT', 'DRM', 'BAG'] as const
export type PackType = (typeof PACK_TYPES)[number]

// On board status for B/L
export const ON_BOARD_STATUSES = ['NOT_SHIPPED', 'SHIPPED'] as const
export type OnBoardStatus = (typeof ON_BOARD_STATUSES)[number]

// Payment terms
export const PAYMENT_TERMS_OPTIONS = ['PREPAID', 'COLLECT', 'THIRD_PARTY'] as const
export type PaymentTermsOption = (typeof PAYMENT_TERMS_OPTIONS)[number]

// Charges visibility
export const CHARGES_APPLY_OPTIONS = ['SHOWING', 'NOT_SHOWING'] as const
export type ChargesApply = (typeof CHARGES_APPLY_OPTIONS)[number]

// ============================================================================
// Tracking Types Re-exports
// ============================================================================

// Re-export tracking types for convenience
export type {
  TimestampSource,
  TimestampType,
  ShipmentTimestampEntry,
  FacilityCodeListProvider,
  FacilityLocation,
  RouteStopEntry,
  TrackingEventType,
  TrackingEventClassifierCode,
  ModeOfTransport,
  CargoEventEntry,
  SyncStatus,
} from './tracking-types'

// ============================================================================
// Booking Confirmation Extraction Types
// ============================================================================

/**
 * Extracted data structure from booking_confirmation schema
 * Matches the YAML schema in fms_documents/data/schemas/booking_confirmation.yaml
 *
 * Note: The LLM extraction may produce data in different structures:
 * - Top-level fields (e.g., booking_number)
 * - Nested under 'transportation' object (e.g., transportation.booking_number)
 * This interface covers both patterns.
 */
export interface BookingConfirmationData {
  // Top-level identifiers (may exist at root or nested)
  booking_number?: string
  bl_number?: string
  mbl_number?: string

  // LLM may produce data nested under transportation object
  transportation?: {
    booking_number?: string
    job_no?: string
    bl_number?: string
    hbl_number?: string
    hbl_no?: string
    mbl_number?: string
    mbl_no?: string
    vessel_name?: string
    vessel?: string
    voyage_number?: string
    port_of_loading?: string
    pol?: string
    port_of_discharge?: string
    pod?: string
    etd?: string
    eta?: string
  }

  carrier?: { name?: string; scac_code?: string }
  vessel?: { name?: string; voyage_number?: string }
  routing?: { port_of_loading?: string; port_of_discharge?: string }
  dates?: {
    etd?: string
    eta?: string
    cutoff_vgm?: string
    cutoff_si?: string
    cutoff_cy?: string
  }
  containers?: Array<{
    container_number?: string
    type?: string
    size_type?: string
    quantity?: number
  }>
  container_details?: Array<{
    container_number?: string
    type?: string
    size_type?: string
    container_type?: string
    quantity?: number
  }>
  cargo?: { description?: string; weight_kg?: number }
  cargo_description?: string
  shipper?: { name?: string }
  consignee?: { name?: string }
}

/**
 * Normalized extracted booking data ready for project creation.
 * This is the output of the booking data extractor service.
 */
export interface ExtractedBookingData {
  // Identifiers
  bookingNumber: string | null
  blNumber: string | null
  mblNumber: string | null

  // Carrier info
  carrierName: string | null
  carrierCode: string | null

  // Vessel info
  vesselName: string | null
  voyageNumber: string | null

  // Routing
  portOfLoading: string | null
  portOfDischarge: string | null

  // Dates
  etd: Date | null
  eta: Date | null
  vgmCutoffDate: Date | null
  docCutoffDate: Date | null
  gateCloseDate: Date | null

  // Cargo
  commodityDescription: string | null
  containerNumbers: string[]
  rawContainers: Array<{
    container_number?: string
    type?: string
    size_type?: string
    container_type?: string
    quantity?: number
  }>

  // Parties (for client matching)
  shipper: { name?: string } | undefined
  consignee: { name?: string } | undefined
}
