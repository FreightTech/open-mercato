/**
 * Tracking Types for FmsSeaContainer
 *
 * These types mirror the shipment-tracking module for sync compatibility.
 * When shipment-tracking is available, FmsSeaContainer can sync data from tracked shipments.
 */

// ─── Timestamp Types ─────────────────────────────────────────

/**
 * Source system that provided a timestamp value.
 */
export type TimestampSource = 'carrier_api' | 'manual' | 'ais' | 'port' | 'edi'

/**
 * Timestamp type identifier.
 */
export type TimestampType = 'ETD' | 'ETA' | 'ATD' | 'ATA'

/**
 * A single timestamp entry tracking value, source, and when it was recorded.
 * Multiple entries per source are allowed (SCD - Slowly Changing Dimension pattern).
 */
export interface ShipmentTimestampEntry {
  /** ISO 8601 datetime value (e.g., "2026-02-24T15:30:00") */
  value: string
  /** Original timezone offset (e.g., "+08:00", "-05:00", "Z") */
  offset: string | null
  /** Source system that provided this timestamp */
  source: TimestampSource
  /** When this entry was recorded/updated (ISO 8601) */
  updatedAt: string
  /** Optional reference to the source tracking event ID */
  sourceEventId?: string | null
}

// ─── Location Types ──────────────────────────────────────────

/**
 * Facility code list provider (BIC or SMDG).
 */
export type FacilityCodeListProvider = 'BIC' | 'SMDG'

/**
 * Rich location data for origin, destination, or transshipment points.
 * Combines port-level (UN/LOCODE) with facility-level (terminal) details.
 */
export interface FacilityLocation {
  /** Display name (terminal or port name) */
  name: string
  /** UN/LOCODE (e.g., "PLGDN") */
  unlocode: string | null
  /** ISO 3166-1 alpha-2 country code (e.g., "PL") */
  countryCode: string | null
  /** SMDG/BIC facility code (e.g., "DCT") */
  facilityCode: string | null
  /** Code list provider */
  facilityCodeListProvider: FacilityCodeListProvider | null
  /** Facility type code (POTE, DEPO, etc.) */
  facilityTypeCode: string | null
  /** Full address string */
  address: string | null
  /** Geographic coordinates */
  coords: {
    latitude: number
    longitude: number
  } | null
  /** Operator name (from BIC API enrichment) */
  operatorName: string | null
  /** Source of the data */
  source: 'dcsa' | 'bic' | 'manual'
}

// ─── Route Types ─────────────────────────────────────────────

/**
 * A stop along the shipment's route (origin, transshipment, or destination).
 * Stored as JSONB on the FmsSeaContainer entity.
 */
export interface RouteStopEntry {
  /** Terminal or port name */
  location: string
  /** UN/LOCODE (e.g., "PLGDN") */
  unlocode?: string | null
  /** Stop type in the route */
  type: 'origin' | 'transshipment' | 'destination'
  /** Vessel name for this leg */
  vesselName?: string | null
  /** Vessel IMO number for vessel tracking */
  vesselImo?: string | null
  /** Actual arrival - ISO datetime string */
  ata?: string | null
  /** Actual departure - ISO datetime string */
  atd?: string | null
  /** Estimated arrival - ISO datetime string */
  eta?: string | null
  /** Estimated departure - ISO datetime string */
  etd?: string | null
  /** ISO 3166-1 alpha-2 country code */
  countryCode?: string | null
  /** SMDG/BIC facility code */
  facilityCode?: string | null
  /** Code list provider */
  facilityCodeListProvider?: FacilityCodeListProvider | null
  /** Facility type code */
  facilityTypeCode?: string | null
  /** Full address string from DCSA otherFacility */
  facilityAddress?: string | null
  /** Geographic coordinates */
  coords?: {
    latitude: number
    longitude: number
  } | null
  /** Operator name (from BIC enrichment) */
  operatorName?: string | null
}

// ─── Event Types ─────────────────────────────────────────────

/**
 * Tracking event type (from DCSA).
 */
export type TrackingEventType = 'EQUIPMENT' | 'TRANSPORT' | 'SHIPMENT'

/**
 * Event classifier code indicating actual, planned, or estimated.
 */
export type TrackingEventClassifierCode = 'ACT' | 'PLN' | 'EST'

/**
 * Mode of transport.
 */
export type ModeOfTransport = 'VESSEL' | 'RAIL' | 'TRUCK' | 'BARGE'

/**
 * A cargo/tracking event entry for a specific container.
 * Stored as JSONB on the FmsSeaContainer entity.
 */
export interface CargoEventEntry {
  /** Event identifier */
  id: string
  /** Event type (EQUIPMENT, TRANSPORT, SHIPMENT) */
  eventType: string
  /** Event code (e.g., "LOAD", "DISC", "ARRI", "DEPA") */
  eventCode: string
  /** Classifier: actual, planned, or estimated */
  eventClassifierCode?: TrackingEventClassifierCode | null
  /** ISO datetime string when event occurred */
  eventDateTime: string
  /** Human-readable event description */
  description?: string | null
  /** Location name where event occurred */
  locationName?: string | null
  /** Location UN/LOCODE */
  locationUnlocode?: string | null
  /** Vessel name */
  vesselName?: string | null
  /** Vessel IMO number */
  vesselImo?: string | null
  /** Voyage number */
  voyageNumber?: string | null
  /** Whether this is a transshipment move */
  isTransshipmentMove?: boolean | null
  /** Facility code */
  facilityCode?: string | null
  /** Code list provider */
  facilityCodeListProvider?: FacilityCodeListProvider | null
  /** Facility type code */
  facilityTypeCode?: string | null
  /** Full address string */
  facilityAddress?: string | null
  /** Latitude coordinate */
  latitude?: number | null
  /** Longitude coordinate */
  longitude?: number | null
}

// ─── Sync Types ──────────────────────────────────────────────

/**
 * Sync status for tracking integration.
 */
export type SyncStatus = 'synced' | 'pending' | 'error'
