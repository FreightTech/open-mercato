import type { CarrierFetchedEvent } from './carrier-adapter'

export interface InferredRoute {
  originUnlocode: string | null
  destinationUnlocode: string | null
  confidence: {
    origin: 'high' | 'medium' | 'low' | null
    destination: 'high' | 'medium' | 'low' | null
  }
}

/**
 * Infers origin and destination ports from DCSA tracking events.
 *
 * Strategy for DESTINATION:
 * 1. EST ARRI event → highest confidence (planned arrival)
 * 2. Last ACT ARRI on VESSEL → high confidence (actual arrival at final port)
 * 3. Last DISC event → medium confidence (final discharge location)
 *
 * Strategy for ORIGIN:
 * 1. First ACT DEPA on VESSEL with exportVoyageNumber → high confidence (departure from load port)
 * 2. First LOAD event on VESSEL → high confidence (where cargo was first loaded)
 * 3. First GTIN (LADEN) event → medium confidence (gate-in at origin)
 *
 * Key insight:
 * - exportVoyageNumber indicates outbound leg (origin side)
 * - importVoyageNumber indicates inbound leg (destination side)
 */
export function inferRouteFromEvents(events: CarrierFetchedEvent[]): InferredRoute {
  const result: InferredRoute = {
    originUnlocode: null,
    destinationUnlocode: null,
    confidence: {
      origin: null,
      destination: null,
    },
  }

  if (!events || events.length === 0) {
    return result
  }

  // Sort events by datetime for chronological processing
  const sortedEvents = [...events].sort(
    (a, b) => a.eventDateTime.getTime() - b.eventDateTime.getTime()
  )

  // ─── DESTINATION INFERENCE ─────────────────────────────────────────
  // For transshipment voyages, there are multiple ARRI events (one per port).
  // The LAST arrival event (chronologically) is the final destination.

  // Strategy 1: Look for LAST ARRI event (EST or PLN - planned/estimated arrivals)
  // PLN (planned) and EST (estimated) both indicate scheduled arrivals.
  // We take the LAST one chronologically as it represents the final destination.
  const plannedArriEvents = sortedEvents.filter(
    (e) =>
      e.eventType === 'TRANSPORT' &&
      e.eventCode === 'ARRI' &&
      (e.eventClassifierCode === 'EST' || e.eventClassifierCode === 'PLN') &&
      e.locationUnlocode
  )

  if (plannedArriEvents.length > 0) {
    // Take the last planned arrival - this is the final destination
    const lastPlannedArri = plannedArriEvents[plannedArriEvents.length - 1]
    result.destinationUnlocode = lastPlannedArri.locationUnlocode!
    result.confidence.destination = 'high'
  }

  // Strategy 2: Look for last ACT ARRI on VESSEL (if no planned arrivals)
  if (!result.destinationUnlocode) {
    const actArriEvents = sortedEvents.filter(
      (e) =>
        e.eventType === 'TRANSPORT' &&
        e.eventCode === 'ARRI' &&
        e.eventClassifierCode === 'ACT' &&
        e.modeOfTransport === 'VESSEL' &&
        e.locationUnlocode
    )

    if (actArriEvents.length > 0) {
      const lastArri = actArriEvents[actArriEvents.length - 1]
      result.destinationUnlocode = lastArri.locationUnlocode!
      result.confidence.destination = 'high'
    }
  }

  // Strategy 3: Look for last DISC event (fallback - includes PLN/EST discharge)
  if (!result.destinationUnlocode) {
    const discEvents = sortedEvents.filter(
      (e) =>
        e.eventType === 'EQUIPMENT' &&
        e.eventCode === 'DISC' &&
        e.locationUnlocode
    )

    if (discEvents.length > 0) {
      const lastDisc = discEvents[discEvents.length - 1]
      result.destinationUnlocode = lastDisc.locationUnlocode!
      result.confidence.destination = 'medium'
    }
  }

  // ─── ORIGIN INFERENCE ──────────────────────────────────────────────

  // Strategy 1: First ACT DEPA on VESSEL with exportVoyageNumber
  const firstVesselDepa = sortedEvents.find(
    (e) =>
      e.eventType === 'TRANSPORT' &&
      e.eventCode === 'DEPA' &&
      e.eventClassifierCode === 'ACT' &&
      e.modeOfTransport === 'VESSEL' &&
      e.carrierExportVoyageNumber &&
      e.locationUnlocode
  )

  if (firstVesselDepa?.locationUnlocode) {
    result.originUnlocode = firstVesselDepa.locationUnlocode
    result.confidence.origin = 'high'
  }

  // Strategy 2: First LOAD event on VESSEL
  if (!result.originUnlocode) {
    const firstLoad = sortedEvents.find(
      (e) =>
        e.eventType === 'EQUIPMENT' &&
        e.eventCode === 'LOAD' &&
        e.eventClassifierCode === 'ACT' &&
        e.modeOfTransport === 'VESSEL' &&
        e.locationUnlocode
    )

    if (firstLoad?.locationUnlocode) {
      result.originUnlocode = firstLoad.locationUnlocode
      result.confidence.origin = 'high'
    }
  }

  // Strategy 3: First GTIN (LADEN) event at a port terminal (fallback)
  // Only consider events at port terminals (POTE), not inland depots (DEPO)
  if (!result.originUnlocode) {
    const firstGtinLaden = sortedEvents.find(
      (e) =>
        e.eventType === 'EQUIPMENT' &&
        e.eventCode === 'GTIN' &&
        e.emptyIndicatorCode === 'LADEN' &&
        e.eventClassifierCode === 'ACT' &&
        e.locationUnlocode &&
        e.facilityTypeCode === 'POTE' // Port Terminal only
    )

    if (firstGtinLaden?.locationUnlocode) {
      result.originUnlocode = firstGtinLaden.locationUnlocode
      result.confidence.origin = 'medium'
    }
  }

  // Strategy 4: First EST/PLN DEPA on VESSEL (for pre-departure tracking)
  // When no actual events exist yet, use planned departure to infer origin
  if (!result.originUnlocode) {
    const firstPlannedDepa = sortedEvents.find(
      (e) =>
        e.eventType === 'TRANSPORT' &&
        e.eventCode === 'DEPA' &&
        (e.eventClassifierCode === 'EST' || e.eventClassifierCode === 'PLN') &&
        e.modeOfTransport === 'VESSEL' &&
        e.locationUnlocode
    )

    if (firstPlannedDepa?.locationUnlocode) {
      result.originUnlocode = firstPlannedDepa.locationUnlocode
      result.confidence.origin = 'medium' // Lower confidence for planned events
    }
  }

  // Strategy 5: First PLN LOAD event on VESSEL (for pre-departure tracking)
  if (!result.originUnlocode) {
    const firstPlannedLoad = sortedEvents.find(
      (e) =>
        e.eventType === 'EQUIPMENT' &&
        e.eventCode === 'LOAD' &&
        (e.eventClassifierCode === 'EST' || e.eventClassifierCode === 'PLN') &&
        e.modeOfTransport === 'VESSEL' &&
        e.locationUnlocode
    )

    if (firstPlannedLoad?.locationUnlocode) {
      result.originUnlocode = firstPlannedLoad.locationUnlocode
      result.confidence.origin = 'medium'
    }
  }

  return result
}

/**
 * Validates a UN/LOCODE format.
 * Format: 2 letters (country) + 3 alphanumeric (location)
 * Example: CNYTN (China, Yantian), PLGDN (Poland, Gdansk)
 */
export function isValidUnlocode(code: string | null | undefined): boolean {
  if (!code) return false
  return /^[A-Z]{2}[A-Z0-9]{3}$/.test(code.toUpperCase())
}
