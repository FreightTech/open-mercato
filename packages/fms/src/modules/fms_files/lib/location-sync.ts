/**
 * Location Sync for fms_files
 *
 * Auto-creates FmsLocation records from carrier tracking data (routeStops,
 * originLocation, destinationLocation). Deduplicates by (locode, organizationId,
 * tenantId) — one record per LOCODE per org/tenant. Multiple facility codes at
 * the same port are accumulated in the facilityCodes JSONB array.
 *
 * Does NOT modify existing leg origin/destination assignments — locations are
 * created for availability in the picker only.
 */

import { v4 as uuidv4 } from 'uuid'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsLocation } from '../../fms_locations/data/entities'
import type { FacilityCodeEntry, FacilityLocationType } from '../../fms_locations/data/types'

const FACILITY_TYPE_MAP: Record<string, FacilityLocationType> = {
  POTE: 'port_terminal',
  DEPO: 'depot',
  RAMP: 'rail_terminal',
  INTE: 'intermodal',
  COYA: 'container_yard',
  COFS: 'cfs',
  BORD: 'border_crossing',
}

interface TrackingStop {
  name?: string | null
  location?: string | null       // RouteStopEntry uses 'location' instead of 'name'
  unlocode?: string | null
  countryCode?: string | null
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  coords?: { latitude: number; longitude: number } | null
  address?: string | null        // FacilityLocation.address (BIC-enriched)
  facilityAddress?: string | null // RouteStopEntry.facilityAddress (DCSA)
}

/**
 * Finds an existing FmsLocation by locode (org/tenant scoped) or creates one
 * from carrier tracking data. Returns null if no locode is available.
 *
 * Dedup key: (locode, organizationId, tenantId) — one record per LOCODE.
 * facilityCode entries are accumulated in the facilityCodes array (not used for dedup)
 * to avoid creating duplicate port records for the same LOCODE.
 */
export async function ensureLocationFromTracking(
  em: EntityManager,
  stop: TrackingStop,
  organizationId: string,
  tenantId: string
): Promise<FmsLocation | null> {
  if (!stop.unlocode) return null

  const locode = stop.unlocode.toUpperCase()
  const displayName = stop.name?.trim() || stop.location?.trim() || null
  const addressValue = stop.address?.trim() || stop.facilityAddress?.trim() || null

  const existing = await em.findOne(FmsLocation, {
    locode,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  if (existing) {
    // Upgrade name if current name is just the locode and we have a real name now
    if (existing.name === locode && displayName && displayName !== locode) {
      existing.name = displayName
    }
    // Enrich address if not set
    if (!existing.addressLine1 && addressValue) {
      existing.addressLine1 = addressValue
    }
    // Enrich coords if we now have better data
    if (existing.lat == null && stop.coords?.latitude != null) {
      existing.lat = stop.coords.latitude
      existing.lng = stop.coords.longitude ?? null
    }
    // Append facilityCode entry if not already present
    if (stop.facilityCode) {
      const current = existing.facilityCodes ?? []
      const alreadyListed = current.some((e) => e.code === stop.facilityCode)
      if (!alreadyListed) {
        existing.facilityCodes = [
          ...current,
          { code: stop.facilityCode, provider: stop.facilityCodeListProvider ?? null } satisfies FacilityCodeEntry,
        ]
      }
    }
    return existing
  }

  const resolvedType = stop.facilityTypeCode
    ? (FACILITY_TYPE_MAP[stop.facilityTypeCode] ?? 'port')
    : 'port'

  const facilityCodes: FacilityCodeEntry[] | null = stop.facilityCode
    ? [{ code: stop.facilityCode, provider: stop.facilityCodeListProvider ?? null }]
    : null

  // Pre-generate UUID so callers can use .id before flush
  return em.create(FmsLocation, {
    id: uuidv4(),
    organizationId,
    tenantId,
    code: locode,
    name: displayName || locode,
    type: resolvedType,
    locode,
    country: stop.countryCode ?? null,
    lat: stop.coords?.latitude ?? null,
    lng: stop.coords?.longitude ?? null,
    addressLine1: addressValue,
    facilityCodes,
    isActive: true,
    isPrimary: false,
  })
}

/**
 * Ensures FmsLocation records exist for all route stops on a shipment.
 * Covers routeStops, originLocation, and destinationLocation.
 * Deduplicates by locode before hitting the DB.
 *
 * Returns a map of locode → FmsLocation for use in leg assignment.
 */
export async function ensureLocationsFromShipment(
  em: EntityManager,
  shipment: {
    routeStops?: TrackingStop[] | null
    originLocation?: TrackingStop | null
    destinationLocation?: TrackingStop | null
  },
  organizationId: string,
  tenantId: string
): Promise<Map<string, FmsLocation>> {
  // BIC-enriched origin/destination go first so their richer names win dedup;
  // routeStops cover intermediate transshipment ports not in origin/destination.
  const stops: TrackingStop[] = [
    ...(shipment.originLocation ? [shipment.originLocation] : []),
    ...(shipment.destinationLocation ? [shipment.destinationLocation] : []),
    ...(shipment.routeStops ?? []),
  ]

  const locodeMap = new Map<string, FmsLocation>()
  const seen = new Set<string>()

  for (const stop of stops) {
    const locode = stop.unlocode
    if (!locode || seen.has(locode.toUpperCase())) continue
    seen.add(locode.toUpperCase())
    const location = await ensureLocationFromTracking(em, stop, organizationId, tenantId)
    if (location) locodeMap.set(locode.toUpperCase(), location)
  }

  return locodeMap
}

/**
 * Updates a leg's originLocationId and destinationLocationId from shipment tracking data.
 * Only updates if the tracking data provides a LOCODE and we have (or created) a matching FmsLocation.
 * The locodeMap is the result of ensureLocationsFromShipment called on the same shipment.
 */
export function syncLegLocationsFromShipment(
  leg: { originLocationId: string; destinationLocationId: string },
  shipment: {
    originUnlocode?: string | null
    destinationUnlocode?: string | null
    originLocation?: TrackingStop | null
    destinationLocation?: TrackingStop | null
  },
  locodeMap: Map<string, FmsLocation>
): void {
  const originLocode = (shipment.originUnlocode || shipment.originLocation?.unlocode)?.toUpperCase()
  const destLocode = (shipment.destinationUnlocode || shipment.destinationLocation?.unlocode)?.toUpperCase()

  if (originLocode) {
    const originLocation = locodeMap.get(originLocode)
    if (originLocation) leg.originLocationId = originLocation.id
  }

  if (destLocode) {
    const destLocation = locodeMap.get(destLocode)
    if (destLocation) leg.destinationLocationId = destLocation.id
  }
}
