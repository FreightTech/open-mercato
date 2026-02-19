/**
 * Test Fixtures for Shipment Tracking
 *
 * Contains real DCSA API responses captured from MSC API for testing.
 */

import mscDirectRaw from './msc-direct-MSBU8749322.json'
import mscTransshipRaw from './msc-transship-MEDUWA216748.json'
import mscMultiRaw from './msc-multi-177LFNFND60342.json'
import mscMultiTransshipCompletedRaw from './msc-multi-transship-completed-EBKG14620577.json'
import maerskMultiTransshipCompletedRaw from './maersk-multi-transship-completed-262766319.json'
import maerskTransshipInTransitRaw from './maersk-transship-intransit-HASU4470420.json'
import hapagLloydTransshipContainerRaw from './hapag-lloyd-transship-container-HLBU2466116.json'

// Type for raw DCSA event from carrier APIs (MSC, Maersk, etc.)
// Note: Field names may vary slightly between carriers (e.g., eventId vs eventID)
export type RawDcsaEvent = {
  eventType: 'TRANSPORT' | 'EQUIPMENT' | 'SHIPMENT'
  transportEventTypeCode?: string
  equipmentEventTypeCode?: string
  shipmentEventTypeCode?: string
  eventId?: string // MSC uses eventId
  eventID?: string // Maersk uses eventID
  eventDateTime: string
  eventClassifierCode: 'ACT' | 'PLN' | 'EST'
  eventCreatedDateTime?: string
  description?: string
  equipmentReference?: string
  ISOEquipmentCode?: string
  emptyIndicatorCode?: 'EMPTY' | 'LADEN'
  transportCall?: {
    transportCallID?: string
    unLocationCode?: string // MSC format
    UNLocationCode?: string // Maersk format
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
    location?: {
      locationName?: string
      latitude?: string
      longitude?: string
    }
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Maersk Fixtures (real DCSA API responses)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Maersk: Multiple containers with multi-transshipment, completed voyage
   * BOL: 262766319
   * Containers: CAXU5739511, CAXU5791660
   * Route: TRKMX (Ambarli, Istanbul area) -> TRYAR (Yarimca, port of loading) -> GBFXT (Felixstowe, transship 1)
   *        -> DEBRV (Bremerhaven, transship 2) -> PLGDN (Gdansk, destination)
   * Status: DELIVERED (completed voyage with all equipment events)
   * Vessels: SOFIA EXPRESS (leg 1), W KAMPALA (leg 2), SEASPAN MONTEVIDEO (leg 3)
   */
  maerskMultiTransshipCompleted: {
    name: 'maersk-multi-transship-completed-262766319',
    carrier: 'maersk',
    bol: '262766319',
    containers: ['CAXU5739511', 'CAXU5791660'],
    containerCount: 2,
    inlandDepot: 'TRKMX', // Ambarli (Kumport Terminal), Istanbul area
    origin: 'TRYAR', // Yarimca, Turkey (DP World Terminal - port of loading)
    transshipPorts: ['GBFXT', 'DEBRV'], // Felixstowe + Bremerhaven
    destination: 'PLGDN', // Gdansk, Poland
    vessels: ['SOFIA EXPRESS', 'W KAMPALA', 'SEASPAN MONTEVIDEO'],
    events: maerskMultiTransshipCompletedRaw as RawDcsaEvent[],
    eventCount: 37,
    // Journey stages:
    // 1. TRKMX: GTOT (gate out from inland depot - Kumport Terminal Ambarli)
    // 2. TRYAR: GTIN, LOAD (port of loading - DP World Yarimca)
    // 3. Leg 1: DEPA TRYAR -> ARRI GBFXT (SOFIA EXPRESS)
    // 4. GBFXT: DISC, LOAD (transshipment 1 - Felixstowe Trinity Terminal)
    // 5. Leg 2: DEPA GBFXT -> ARRI DEBRV (W KAMPALA)
    // 6. DEBRV: DISC, LOAD (transshipment 2 - Bremerhaven)
    // 7. Leg 3: DEPA DEBRV -> ARRI PLGDN (SEASPAN MONTEVIDEO)
    // 8. PLGDN: DISC, GTOT (delivery - DCT Gdansk)
  },

  /**
   * Maersk: Single container with multi-transshipment, in-transit
   * Container: HASU4470420
   * Route: CNTXG (Tianjin/Xingang) -> MYTPP (Tanjung Pelepas, transship 1)
   *        -> DEWVN (Wilhelmshaven, EST) -> PLGDN (Gdansk, EST destination)
   * Status: IN_TRANSIT (last 3 events are EST - not yet arrived at Wilhelmshaven)
   * Vessels: ESL SHEKOU (leg 1), BUSAN EXPRESS (leg 2), MAERSK GIRONDE (leg 3)
   */
  maerskTransshipInTransit: {
    name: 'maersk-transship-intransit-HASU4470420',
    carrier: 'maersk',
    container: 'HASU4470420',
    origin: 'CNTXG', // Tianjin/Xingang, China (Tianjin PAC Intl Container Terminal)
    transshipPorts: ['MYTPP', 'DEWVN'], // Tanjung Pelepas + Wilhelmshaven
    destination: 'PLGDN', // Gdansk, Poland
    vessels: ['ESL SHEKOU', 'BUSAN EXPRESS', 'MAERSK GIRONDE'],
    events: maerskTransshipInTransitRaw as RawDcsaEvent[],
    eventCount: 14,
    // Journey stages:
    // 1. CNTXG: Equipment events at origin (Tianjin PAC Terminal)
    // 2. Leg 1: ACT DEPA CNTXG -> ACT ARRI MYTPP (ESL SHEKOU)
    // 3. MYTPP: Equipment events at transshipment 1 (Pelabuhan Tanjung Pelepas)
    // 4. Leg 2: ACT DEPA MYTPP -> EST ARRI DEWVN (BUSAN EXPRESS) - currently in transit
    // 5. DEWVN: (future) transshipment 2 - Wilhelmshaven
    // 6. Leg 3: EST DEPA DEWVN -> EST ARRI PLGDN (MAERSK GIRONDE) - planned
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Hapag-Lloyd Fixtures (real DCSA API responses)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Hapag-Lloyd: Single container with transshipment
   * BOL: 39558632
   * Container: HLBU2466116
   * Route: PLGDY (Gdynia, Poland) -> DEWVN (Wilhelmshaven, transship) -> USORF (Norfolk, VA) -> USCHI (Chicago, destination)
   * Status: IN_TRANSIT (rail leg to Chicago - last events show LOAD at Chicago rail terminal)
   * Vessels: GREEN HOPE (leg 1: Gdynia -> Wilhelmshaven), SFL MAUI (leg 2: Wilhelmshaven -> Norfolk)
   * Note: This is an export shipment from Poland to USA with inland rail delivery to Chicago
   */
  hapagLloydTransshipContainer: {
    name: 'hapag-lloyd-transship-container-HLBU2466116',
    carrier: 'hapag-lloyd',
    bol: '39558632',
    container: 'HLBU2466116',
    origin: 'PLGDY', // Gdynia, Poland (Gdynia Container Terminal)
    transshipPorts: ['DEWVN'], // Wilhelmshaven, Germany (Eurogate Container Terminal)
    portOfDischarge: 'USORF', // Norfolk, VA (Norfolk Intl Terminal)
    destination: 'USCHI', // Chicago, IL (final inland destination via rail)
    vessels: ['GREEN HOPE', 'SFL MAUI'],
    events: hapagLloydTransshipContainerRaw as RawDcsaEvent[],
    eventCount: 20,
    // Journey stages (chronological):
    // 1. PLGDY: GTIN (truck), LOAD (vessel) - origin gate-in and loading
    // 2. Leg 1: DEPA PLGDY -> ARRI DEWVN (GREEN HOPE, voyage 2601W)
    // 3. DEWVN: DISC, LOAD - transshipment at Wilhelmshaven
    // 4. Leg 2: DEPA DEWVN -> ARRI USORF (SFL MAUI, voyage 601W)
    // 5. USORF: DISC (vessel), LOAD (rail), GTOT (rail) - port discharge and rail handoff
    // 6. USCHI: GTIN (rail), GTOT (truck), GTIN (truck), LOAD (rail) - inland delivery via Norfolk Southern
    // Note: Events include both ACT (actual) and PLN (planned) events
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
