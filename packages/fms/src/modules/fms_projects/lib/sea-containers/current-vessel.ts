/**
 * Current vessel derivation utilities for sea container tracking.
 *
 * Determines which vessel the container is currently on (or waiting for)
 * based on shipment progress through route stops.
 */

// ─── Types (copied from route-extraction for self-containment) ─────

/**
 * A stop along the shipment's route (origin, transshipment, or destination).
 */
export interface RouteStopEntry {
  location: string
  unlocode?: string | null
  type: 'origin' | 'transshipment' | 'destination'
  vesselName?: string | null
  vesselImo?: string | null
  ata?: string | null
  atd?: string | null
  eta?: string | null
  etd?: string | null
  countryCode?: string | null
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  facilityAddress?: string | null
  coords?: {
    latitude: number
    longitude: number
  } | null
  operatorName?: string | null
}

/**
 * A cargo/tracking event entry for a specific container.
 */
export interface CargoEventEntry {
  id: string
  eventType: string
  eventCode: string
  eventClassifierCode?: 'ACT' | 'PLN' | 'EST' | null
  eventDateTime: string
  description?: string | null
  locationName?: string | null
  locationUnlocode?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  isTransshipmentMove?: boolean | null
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  facilityAddress?: string | null
  latitude?: number | null
  longitude?: number | null
}

// ─── Current Vessel Types ────────────────────────────────────

/**
 * Container's current tracking status.
 */
export type VesselTrackingStatus =
  | 'in_transit'    // Container is on a vessel moving between ports
  | 'at_port'       // Container is at a port (waiting for next vessel or just arrived)
  | 'not_departed'  // Container hasn't started journey yet (at origin)
  | 'delivered'     // Container has arrived at final destination

/**
 * Information about the current or planned vessel for tracking.
 */
export interface CurrentVesselInfo {
  /** Current or planned vessel name */
  vesselName: string | null
  /** Current or planned vessel IMO for tracking */
  vesselImo: string | null
  /** Container's current status */
  status: VesselTrackingStatus
  /** Current leg info (if in transit) */
  currentLeg?: {
    fromPort: string
    toPort: string
  }
  /** Port name where container currently is (if at_port or not_departed) */
  currentPort?: string
  /** Whether the vessel shown is planned (not yet departed) vs currently carrying container */
  isPlannedVessel: boolean
  /** Start date for trace - ATD from departure port (in_transit) or 7 days ago (planned) */
  traceFrom?: string
}

// ─── Helper Functions ────────────────────────────────────────

/**
 * Returns ISO 8601 date string for 7 days ago.
 * Used as default trace start time for planned vessels.
 */
function getSevenDaysAgo(): string {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return date.toISOString()
}

/**
 * Finds the last vessel that carried the container by searching route stops backwards.
 * Used for delivered shipments to show which vessel completed the journey.
 */
function findLastVesselFromStops(
  routeStops: RouteStopEntry[],
  cargoEvents: CargoEventEntry[] | null | undefined
): { vesselName: string | null; vesselImo: string | null } {
  for (let i = routeStops.length - 1; i >= 0; i--) {
    const stop = routeStops[i]
    if (stop.vesselName) {
      const vesselImo = stop.vesselImo || findVesselImoFromEvents(stop.vesselName, cargoEvents)
      return { vesselName: stop.vesselName, vesselImo }
    }
  }
  return { vesselName: null, vesselImo: null }
}

// ─── Main Function ───────────────────────────────────────────

/**
 * Determines the current vessel based on shipment progress through route stops.
 *
 * Algorithm:
 * 1. If final destination has ATA -> Container delivered, no vessel to track
 * 2. Find the latest stop with ATD where next stop doesn't have ATA
 *    -> Container is in transit on this leg's vessel
 * 3. Find stop with ATA but no ATD (container at port waiting)
 *    -> Return next leg's planned vessel if available
 * 4. No stops have ATD -> Container not departed yet
 *    -> Return first leg's planned vessel
 *
 * @param routeStops - Array of route stops from shipment
 * @param cargoEvents - Array of cargo events (used to find vessel IMO if not in stops)
 * @param fallbackVessel - Fallback vessel info from shipment entity
 * @returns CurrentVesselInfo with vessel details and status
 */
export function getCurrentVessel(
  routeStops: RouteStopEntry[] | null | undefined,
  cargoEvents: CargoEventEntry[] | null | undefined,
  fallbackVessel?: { vesselName?: string | null; vesselImo?: string | null }
): CurrentVesselInfo {
  const defaultResult: CurrentVesselInfo = {
    vesselName: fallbackVessel?.vesselName ?? null,
    vesselImo: fallbackVessel?.vesselImo ?? null,
    status: 'not_departed',
    isPlannedVessel: true,
    traceFrom: getSevenDaysAgo(),
  }

  if (!routeStops || routeStops.length === 0) {
    return defaultResult
  }

  // Check if container is delivered (final destination has ATA)
  const destination = routeStops.find((s) => s.type === 'destination')
  if (destination?.ata) {
    const lastVesselInfo = findLastVesselFromStops(routeStops, cargoEvents)
    return {
      vesselName: lastVesselInfo.vesselName,
      vesselImo: lastVesselInfo.vesselImo,
      status: 'delivered',
      currentPort: destination.location,
      isPlannedVessel: false,
    }
  }

  // Find where the container currently is
  for (let i = routeStops.length - 1; i >= 0; i--) {
    const stop = routeStops[i]
    const nextStop = routeStops[i + 1]

    // Case 1: Stop has ATD and next stop exists but doesn't have ATA
    // -> Container is in transit between these stops
    if (stop.atd && nextStop && !nextStop.ata) {
      const vesselImo = stop.vesselImo || findVesselImoFromEvents(stop.vesselName, cargoEvents)
      return {
        vesselName: stop.vesselName ?? null,
        vesselImo,
        status: 'in_transit',
        currentLeg: {
          fromPort: stop.location,
          toPort: nextStop.location,
        },
        isPlannedVessel: false,
        traceFrom: stop.atd,
      }
    }

    // Case 2: Stop has ATA but no ATD (container is at this port)
    // -> Return the next leg's vessel as planned vessel
    if (stop.ata && !stop.atd) {
      if (nextStop) {
        const vesselImo =
          nextStop.vesselImo || findVesselImoFromEvents(nextStop.vesselName, cargoEvents)
        return {
          vesselName: nextStop.vesselName ?? null,
          vesselImo,
          status: 'at_port',
          currentPort: stop.location,
          isPlannedVessel: true,
          traceFrom: getSevenDaysAgo(),
        }
      }
      return {
        vesselName: null,
        vesselImo: null,
        status: 'at_port',
        currentPort: stop.location,
        isPlannedVessel: false,
        traceFrom: getSevenDaysAgo(),
      }
    }
  }

  // Case 3: No stops have ATD -> Container hasn't departed yet
  const origin = routeStops[0]
  const vesselImo = origin?.vesselImo || findVesselImoFromEvents(origin?.vesselName, cargoEvents)

  return {
    vesselName: origin?.vesselName ?? fallbackVessel?.vesselName ?? null,
    vesselImo: vesselImo ?? fallbackVessel?.vesselImo ?? null,
    status: 'not_departed',
    currentPort: origin?.location,
    isPlannedVessel: true,
    traceFrom: getSevenDaysAgo(),
  }
}

// ─── More Helper Functions ───────────────────────────────────

/**
 * Find vessel IMO from cargo events by vessel name.
 * Used when RouteStopEntry only has vesselName but needs IMO.
 */
export function findVesselImoFromEvents(
  vesselName: string | null | undefined,
  events: CargoEventEntry[] | null | undefined
): string | null {
  if (!vesselName || !events || events.length === 0) {
    return null
  }

  const eventWithImo = events.find(
    (e) => e.vesselName === vesselName && e.vesselImo
  )

  return eventWithImo?.vesselImo ?? null
}

/**
 * Get a human-readable description of the current vessel status.
 * Useful for UI display.
 *
 * Translation keys use fms_projects.map.* namespace.
 */
export function getVesselStatusDescription(info: CurrentVesselInfo): {
  key: string
  params?: Record<string, string>
} {
  switch (info.status) {
    case 'in_transit':
      return {
        key: 'fms_projects.map.inTransit',
        params: {
          destination: info.currentLeg?.toPort ?? '',
        },
      }
    case 'at_port':
      if (info.vesselName) {
        return {
          key: 'fms_projects.map.atPortAwaitingVessel',
          params: {
            port: info.currentPort ?? '',
            vessel: info.vesselName,
          },
        }
      }
      return {
        key: 'fms_projects.map.atPort',
        params: {
          port: info.currentPort ?? '',
        },
      }
    case 'not_departed':
      if (info.vesselName) {
        return {
          key: 'fms_projects.map.awaitingDeparture',
          params: {
            vessel: info.vesselName,
          },
        }
      }
      return {
        key: 'fms_projects.map.notDeparted',
      }
    case 'delivered':
      return {
        key: 'fms_projects.map.delivered',
      }
  }
}
