import type { CargoEventType, CargoEventClassification, TrackingReferenceType } from '../data/entities'

export type DocumentReference = {
  type: string // BKG, TRD, SHI, CBR, ARN, VGM, etc.
  value: string
}

export type SealInfo = {
  number: string
  source?: string | null
  type?: string | null
}

export type CarrierFetchedEvent = {
  // ─── Core Event Fields ─────────────────────────────────────────
  eventId: string
  eventType: CargoEventType
  eventCode: string
  eventClassification?: CargoEventClassification | null
  eventDateTime: Date
  eventDateTimeOffset?: string | null
  description?: string | null
  rawData?: Record<string, unknown> | null

  // ─── Equipment Fields (DCSA EQUIPMENT events) ──────────────────
  equipmentReference?: string | null // Container number (BIC ISO)
  isoEquipmentCode?: string | null // Container type (22G1, 45R1, etc.)
  emptyIndicatorCode?: 'EMPTY' | 'LADEN' | null
  isTransshipmentMove?: boolean | null

  // ─── Location Fields ───────────────────────────────────────────
  locationName?: string | null
  locationUnlocode?: string | null
  locationCountry?: string | null
  facilityCode?: string | null // Terminal/depot code (SMDG/BIC)
  facilityCodeListProvider?: 'SMDG' | 'BIC' | null
  facilityTypeCode?: string | null // POTE, DEPO, CLOC, COFS, etc.
  latitude?: number | null
  longitude?: number | null

  // ─── Transport Call Fields ─────────────────────────────────────
  transportCallReference?: string | null
  modeOfTransport?: 'VESSEL' | 'RAIL' | 'TRUCK' | 'BARGE' | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  carrierServiceCode?: string | null
  carrierExportVoyageNumber?: string | null
  carrierImportVoyageNumber?: string | null
  universalServiceReference?: string | null
  universalExportVoyageReference?: string | null
  universalImportVoyageReference?: string | null
  portVisitReference?: string | null

  // ─── Document References ───────────────────────────────────────
  relatedDocumentReferences?: DocumentReference[] | null

  // ─── Metadata Fields ───────────────────────────────────────────
  eventCreatedDateTime?: Date | null
  retractedEventId?: string | null
  publisherName?: string | null
  publisherRole?: string | null // CA, AG, VSL, TR, etc.

  // ─── Additional Event Fields ───────────────────────────────────
  delayReasonCode?: string | null // SMDG delay reason code
  changeRemark?: string | null
  seals?: SealInfo[] | null
}

export type CarrierAdapterTestResult = {
  success: boolean
  message: string
  latencyMs?: number
}

export type CarrierFetchResult = {
  events: CarrierFetchedEvent[]
  containerNumber?: string | null
  bookingNumber?: string | null
  bolNumber?: string | null
  vesselName?: string | null
  vesselImo?: string | null
}

export interface CarrierAdapter {
  readonly carrierName: string
  readonly supportedReferenceTypes: TrackingReferenceType[]

  fetchEvents(input: {
    referenceType: TrackingReferenceType
    referenceValue: string
    apiEndpoint?: string | null
    authConfig?: Record<string, unknown> | null
  }): Promise<CarrierFetchResult>

  testConnection(input: {
    apiEndpoint?: string | null
    authConfig?: Record<string, unknown> | null
  }): Promise<CarrierAdapterTestResult>
}
