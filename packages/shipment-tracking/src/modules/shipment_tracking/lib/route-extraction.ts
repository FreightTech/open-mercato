/**
 * Route extraction utilities for shipment tracking.
 * 
 * Extracts route stops from tracking events for display in the shipment details drawer.
 * This logic is shared between:
 * - TrackingService (when populating denormalized data on shipment)
 * - ShipmentDetailsDrawer (as types reference)
 */

// ─── Types ───────────────────────────────────────────────────

/**
 * A stop along the shipment's route (origin, transshipment, or destination).
 * Stored as JSONB on the Shipment entity.
 */
export interface RouteStopEntry {
  location: string
  unlocode?: string | null
  type: 'origin' | 'transshipment' | 'destination'
  vesselName?: string | null
  ata?: string | null  // Actual arrival - ISO datetime string
  atd?: string | null  // Actual departure - ISO datetime string
  eta?: string | null  // Estimated arrival - ISO datetime string (for delay calculation)
  etd?: string | null  // Estimated departure - ISO datetime string (for delay calculation)
}

/**
 * A cargo/tracking event entry for a specific container.
 * Stored as JSONB on the Shipment entity.
 */
export interface CargoEventEntry {
  id: string
  eventType: string
  eventCode: string
  eventClassifierCode?: 'ACT' | 'PLN' | 'EST' | null
  eventDateTime: string  // ISO datetime string
  description?: string | null
  locationName?: string | null
  locationUnlocode?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  isTransshipmentMove?: boolean | null
}

/**
 * Context for route extraction - provides origin/destination hints.
 */
export interface RouteExtractionContext {
  originUnlocode?: string | null
  destinationUnlocode?: string | null
}

// ─── Route Extraction ────────────────────────────────────────

/**
 * Extracts route stops from a list of cargo events.
 * 
 * The algorithm:
 * 1. Sorts events chronologically
 * 2. Groups events by location (unlocode or name)
 * 3. Tracks vessels, arrival/departure times, and transshipment indicators
 * 4. Assigns type (origin/transshipment/destination) based on position and context
 * 
 * @param events - Array of cargo events (already filtered for specific container)
 * @param context - Optional context with origin/destination hints
 * @returns Array of route stops in chronological order
 */
export function extractRouteFromEvents(
  events: CargoEventEntry[],
  context?: RouteExtractionContext
): RouteStopEntry[] {
  if (!events || events.length === 0) {
    return []
  }

  // Sort events by datetime
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.eventDateTime).getTime() - new Date(b.eventDateTime).getTime()
  )

  // Build location map with timestamps
  const locationMap = new Map<string, {
    name: string
    unlocode?: string | null
    vessels: Set<string>
    ata?: string
    atd?: string
    eta?: string
    etd?: string
    isTransshipment: boolean
  }>()

  for (const event of sortedEvents) {
    const loc = event.locationUnlocode || event.locationName
    if (!loc) continue

    if (!locationMap.has(loc)) {
      locationMap.set(loc, {
        name: event.locationName || loc,
        unlocode: event.locationUnlocode || null,
        vessels: new Set(),
        isTransshipment: false,
      })
    }

    const entry = locationMap.get(loc)!

    if (event.vesselName) {
      entry.vessels.add(event.vesselName)
    }

    // Track actual arrivals/departures
    if (event.eventCode === 'ARRI' && event.eventClassifierCode === 'ACT') {
      entry.ata = event.eventDateTime
    }
    if (event.eventCode === 'DEPA' && event.eventClassifierCode === 'ACT') {
      entry.atd = event.eventDateTime
    }

    // Track estimated/planned arrivals/departures (for delay calculation)
    // Only store the first estimate (original plan) to compare against actual
    if (event.eventCode === 'ARRI' && (event.eventClassifierCode === 'PLN' || event.eventClassifierCode === 'EST')) {
      if (!entry.eta) entry.eta = event.eventDateTime
    }
    if (event.eventCode === 'DEPA' && (event.eventClassifierCode === 'PLN' || event.eventClassifierCode === 'EST')) {
      if (!entry.etd) entry.etd = event.eventDateTime
    }

    // Mark transshipment if container was discharged and loaded
    if (event.isTransshipmentMove || 
        (event.eventCode === 'DISC' || event.eventCode === 'LOAD')) {
      entry.isTransshipment = true
    }
  }

  // Convert to route stops
  const stops: RouteStopEntry[] = []
  const locations = Array.from(locationMap.entries())

  for (let i = 0; i < locations.length; i++) {
    const [key, data] = locations[i]
    const isFirst = i === 0
    const isLast = i === locations.length - 1

    // Determine type based on position and context
    let type: 'origin' | 'transshipment' | 'destination' = 'transshipment'
    
    if (isFirst || key === context?.originUnlocode) {
      type = 'origin'
    } else if (isLast || key === context?.destinationUnlocode) {
      type = 'destination'
    }

    stops.push({
      location: data.name,
      unlocode: data.unlocode,
      type,
      vesselName: Array.from(data.vessels).pop() || null,
      ata: data.ata || null,
      atd: data.atd || null,
      eta: data.eta || null,
      etd: data.etd || null,
    })
  }

  return stops
}

// ─── Event Mapping ───────────────────────────────────────────

/**
 * Maps a TrackingEvent entity to a CargoEventEntry for storage.
 * 
 * @param event - The tracking event entity
 * @returns A simplified event entry suitable for JSONB storage
 */
export function mapTrackingEventToEntry(event: {
  id: string
  eventType: string
  eventCode: string
  eventClassifierCode?: string | null
  eventDateTime: Date
  description?: string | null
  locationName?: string | null
  locationUnlocode?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  isTransshipmentMove?: boolean | null
}): CargoEventEntry {
  return {
    id: event.id,
    eventType: event.eventType,
    eventCode: event.eventCode,
    eventClassifierCode: event.eventClassifierCode as 'ACT' | 'PLN' | 'EST' | null,
    eventDateTime: event.eventDateTime.toISOString(),
    description: event.description || null,
    locationName: event.locationName || null,
    locationUnlocode: event.locationUnlocode || null,
    vesselName: event.vesselName || null,
    vesselImo: event.vesselImo || null,
    voyageNumber: event.voyageNumber || null,
    isTransshipmentMove: event.isTransshipmentMove ?? null,
  }
}
