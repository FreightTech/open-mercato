/**
 * Test Fixtures for Shipment Tracking
 *
 * Contains real DCSA API responses captured from MSC API for testing.
 */

import mscDirectRaw from './msc-direct-MSBU8749322.json'
import mscTransshipRaw from './msc-transship-MEDUWA216748.json'
import mscMultiRaw from './msc-multi-177LFNFND60342.json'
import mscMultiTransshipCompletedRaw from './msc-multi-transship-completed-EBKG14620577.json'

// Type for raw DCSA event from MSC API
export type RawDcsaEvent = {
  eventType: 'TRANSPORT' | 'EQUIPMENT' | 'SHIPMENT'
  transportEventTypeCode?: string
  equipmentEventTypeCode?: string
  shipmentEventTypeCode?: string
  eventId: string
  eventDateTime: string
  eventClassifierCode: 'ACT' | 'PLN' | 'EST'
  eventCreatedDateTime?: string
  description?: string
  equipmentReference?: string
  ISOEquipmentCode?: string
  emptyIndicatorCode?: 'EMPTY' | 'LADEN'
  transportCall?: {
    transportCallID?: string
    unLocationCode?: string
    facilityCode?: string
    facilityCodeListProvider?: 'SMDG' | 'BIC'
    facilityTypeCode?: string
    modeOfTransport?: 'VESSEL' | 'RAIL' | 'TRUCK' | 'BARGE'
    vessel?: {
      vesselIMONumber?: string
      vesselName?: string
      vesselFlag?: string
      vesselCallSignNumber?: string
    } | null
    exportVoyageNumber?: string | null
    importVoyageNumber?: string | null
  }
  eventLocation?: {
    locationName?: string
    unLocationCode?: string
    facilityCode?: string
    facilityCodeListProvider?: 'SMDG' | 'BIC'
  }
  documentReferences?: Array<{
    documentReferenceType: string
    documentReferenceValue: string
  }>
  seals?: Array<{
    sealNumber: string
    sealSource?: string
  }>
  references?: unknown[]
}

// Fixture metadata
export const fixtures = {
  /**
   * Single container, direct connection (no transshipment)
   * Booking: 181AY25C0128434S1
   * Container: MSBU8749322
   * Route: CNYTN (Yantian) -> PLGDN (Gdansk)
   * Vessel: MSC BARI
   */
  direct: {
    name: 'msc-direct-MSBU8749322',
    carrier: 'msc',
    booking: '181AY25C0128434S1',
    container: 'MSBU8749322',
    origin: 'CNYTN',
    destination: 'PLGDN',
    vessel: 'MSC BARI',
    events: mscDirectRaw as RawDcsaEvent[],
  },

  /**
   * Single container, transshipment scenario
   * Booking: 177IHPHPQ7958V
   * Container: FFAU7094447
   * Route: CNTAO (Qingdao) -> CNNGB (Ningbo) -> PLGDN (Gdansk)
   * Vessels: MSC KALINA (1st leg), MSC MONICA CRISTINA (2nd leg)
   */
  transshipment: {
    name: 'msc-transship-MEDUWA216748',
    carrier: 'msc',
    booking: '177IHPHPQ7958V',
    container: 'FFAU7094447', // Note: MEDUWA216748 is the document reference, not container
    origin: 'CNTAO',
    transshipPort: 'CNNGB',
    destination: 'PLGDN',
    vessels: ['MSC KALINA', 'MSC MONICA CRISTINA'],
    events: mscTransshipRaw as RawDcsaEvent[],
  },

  /**
   * Multiple containers (32)
   * Booking: 177LFNFND60342
   * Route: CNYTN (Yantian) -> PLGDN (Gdansk)
   */
  multiContainer: {
    name: 'msc-multi-177LFNFND60342',
    carrier: 'msc',
    booking: '177LFNFND60342',
    origin: 'CNYTN',
    destination: 'PLGDN',
    containerCount: 32,
    events: mscMultiRaw as RawDcsaEvent[],
    get containers(): string[] {
      const set = new Set<string>()
      for (const event of this.events) {
        if (event.equipmentReference) {
          set.add(event.equipmentReference)
        }
      }
      return [...set].sort()
    },
  },

  /**
   * Multiple containers with transshipment, completed voyage
   * Booking: EBKG14620577
   * Containers: MSNU2138133, DFSU1731240
   * Route: CRCAR (Costa Rica) -> CRMOB (Moín) -> BEANR (Antwerp, transship) -> PLGDY (Gdynia)
   * Status: DELIVERED (all containers have final GTIN at destination)
   */
  multiTransshipCompleted: {
    name: 'msc-multi-transship-completed-EBKG14620577',
    carrier: 'msc',
    booking: 'EBKG14620577',
    containers: ['MSNU2138133', 'DFSU1731240'],
    containerCount: 2,
    origin: 'CRMOB', // Moín, Costa Rica (port of loading)
    transshipPort: 'BEANR', // Antwerp, Belgium
    destination: 'PLGDY', // Gdynia, Poland
    events: mscMultiTransshipCompletedRaw as RawDcsaEvent[],
    eventCount: 20,
    // Journey stages:
    // 1. CRCAR: GTOT (gate out from inland depot)
    // 2. CRMOB: GTIN, LOAD (port of origin)
    // 3. Leg 1: DEPA -> ARRI (to Antwerp)
    // 4. BEANR: DISC, LOAD (transshipment)
    // 5. Leg 2: DEPA -> ARRI (to Gdynia)
    // 6. PLGDY: DISC, GTOT, GTIN (delivery complete)
  },
} as const

/**
 * Helper to extract unique containers from events
 */
export function extractContainers(events: RawDcsaEvent[]): string[] {
  const set = new Set<string>()
  for (const event of events) {
    if (event.equipmentReference) {
      set.add(event.equipmentReference)
    }
  }
  return [...set].sort()
}

/**
 * Helper to filter events by container
 */
export function filterEventsByContainer(events: RawDcsaEvent[], container: string): RawDcsaEvent[] {
  return events.filter((event) => {
    // TRANSPORT events apply to all containers
    if (event.eventType === 'TRANSPORT') return true
    // EQUIPMENT events are container-specific
    return event.equipmentReference === container
  })
}

/**
 * Helper to get events in chronological order
 */
export function sortEventsByTime(events: RawDcsaEvent[]): RawDcsaEvent[] {
  return [...events].sort((a, b) => {
    return new Date(a.eventDateTime).getTime() - new Date(b.eventDateTime).getTime()
  })
}

/**
 * Helper to create a subset of events for incremental testing
 * Useful for simulating multiple poll cycles
 */
export function sliceEvents(events: RawDcsaEvent[], count: number): RawDcsaEvent[] {
  const sorted = sortEventsByTime(events)
  return sorted.slice(0, count)
}

/**
 * Helper to create test scope
 */
export function createTestScope() {
  return {
    tenantId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
  }
}

/**
 * Helper to create mock carrier fetch result from fixture events
 */
export function createMockFetchResult(events: RawDcsaEvent[]) {
  // Extract booking number from first event with document references
  let bookingNumber: string | null = null
  let vesselName: string | null = null
  let vesselImo: string | null = null

  for (const event of events) {
    if (!bookingNumber && event.documentReferences) {
      const bkg = event.documentReferences.find((ref) => ref.documentReferenceType === 'BKG')
      if (bkg) bookingNumber = bkg.documentReferenceValue
    }
    if (!vesselName && event.transportCall?.vessel) {
      vesselName = event.transportCall.vessel.vesselName ?? null
      vesselImo = event.transportCall.vessel.vesselIMONumber ?? null
    }
    if (bookingNumber && vesselName) break
  }

  return {
    events,
    bookingNumber,
    vesselName,
    vesselImo,
  }
}
