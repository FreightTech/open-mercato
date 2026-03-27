/**
 * FMS Files - Type Definitions
 *
 * Enum constants and derived union types for the fms_files module.
 * Stored as text in the database (not native DB enums) for flexibility.
 */

// ─── Shipment Type ────────────────────────────────────────────────────────────

export const SHIPMENT_TYPES = ['EXP', 'IMP', 'LOC'] as const
export type ShipmentType = (typeof SHIPMENT_TYPES)[number]

// ─── Cargo Type ───────────────────────────────────────────────────────────────

export const CARGO_TYPES = ['FCL', 'LCL'] as const
export type CargoType = (typeof CARGO_TYPES)[number]

// ─── Leg Type ─────────────────────────────────────────────────────────────────

export const LEG_TYPES = ['TRUCK', 'SHIP', 'RAIL', 'AIR'] as const
export type LegType = (typeof LEG_TYPES)[number]

// ─── Container Type Suggestions ───────────────────────────────────────────────
// Free-form text in the DB, but these are common values for UI suggestions.

export const CONTAINER_TYPES = [
  '20GP', '40GP', '40HC', '45HC', '45PW',
  '20RF', '40RF', '40RH',
  '20OT', '40OT',
  '20FR', '40FR',
] as const

// ─── Weight / Volume / Dimension Units ────────────────────────────────────────

export const WEIGHT_UNITS = ['kg', 'lb', 'ton', 'mt'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

export const VOLUME_UNITS = ['cbm', 'cft', 'liter'] as const
export type VolumeUnit = (typeof VOLUME_UNITS)[number]

export const DIMENSION_UNITS = ['cm', 'in', 'm', 'ft'] as const
export type DimensionUnit = (typeof DIMENSION_UNITS)[number]

// ─── Package Types ────────────────────────────────────────────────────────────

export const PACKAGE_TYPES = ['PLT', 'CTN', 'PKG', 'UNT', 'BOX', 'CRT', 'DRM', 'BAG'] as const
export type PackageType = (typeof PACKAGE_TYPES)[number]

// ─── SCD Timestamp Types ──────────────────────────────────────────────────────

export type TimestampSource = 'carrier_api' | 'manual' | 'ais' | 'port' | 'edi'

export interface LegTimestampEntry {
  /** ISO 8601 datetime value */
  value: string
  /** Original timezone offset (+08:00, Z) */
  offset: string | null
  /** Source system that provided this timestamp */
  source: TimestampSource
  /** When this entry was recorded (ISO 8601) */
  updatedAt: string
  /** Optional reference to the source tracking event ID */
  sourceEventId?: string | null
}

// ─── Unit-Leg Status ─────────────────────────────────────────────────────────

export const UNIT_LEG_STATUSES = ['PENDING', 'PLANNED', 'ESTIMATED', 'DEPARTED', 'PRE_ARRIVAL', 'ARRIVED'] as const
export type UnitLegStatus = (typeof UNIT_LEG_STATUSES)[number]

export interface UnitLegTimestamps {
  ptd: string | null
  etd: string | null
  atd: string | null
  pta: string | null
  eta: string | null
  ata: string | null
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Derive the status of a unit-leg from its effective timestamps.
 *
 * The caller must resolve TRUCK vs SHIP/RAIL/AIR timestamps before calling:
 * - TRUCK: pass unit-leg timestamps (per-truck, independent)
 * - SHIP/RAIL/AIR: pass leg-level SCD latest values (shared vessel)
 *
 * PRE_ARRIVAL is SHIP-only: ETA exists, is within 7 days, and no ATA yet.
 */
export function deriveUnitLegStatus(ts: UnitLegTimestamps, legType: string): UnitLegStatus {
  if (ts.ata) return 'ARRIVED'

  if (legType === 'SHIP' && ts.eta) {
    const etaDate = new Date(ts.eta)
    if (!isNaN(etaDate.getTime()) && etaDate.getTime() - Date.now() < SEVEN_DAYS_MS) {
      return 'PRE_ARRIVAL'
    }
  }

  if (ts.atd) return 'DEPARTED'
  if (ts.etd || ts.eta) return 'ESTIMATED'
  if (ts.ptd || ts.pta) return 'PLANNED'
  return 'PENDING'
}

// ─── Package Detail (JSONB structure for LCL units) ───────────────────────────

export interface PackageDetail {
  packageType?: string
  packageCount?: number
  commodityDescription?: string
  grossWeight?: number
  weightUnit?: string
  volume?: number
  volumeUnit?: string
  isHazardous?: boolean
  hazmatClass?: string
  unNumber?: string
  temperatureMin?: number
  temperatureMax?: number
  length?: number
  width?: number
  height?: number
  dimensionUnit?: string
  declaredValue?: number
  declaredValueCurrency?: string
  marksAndNumbers?: string
}
