import type { CargoEventType, CargoEventClassification, TrackingReferenceType } from '../data/entities'

export type CarrierFetchedEvent = {
  eventId: string
  eventType: CargoEventType
  eventCode: string
  eventClassification?: CargoEventClassification | null
  eventDateTime: Date
  eventDateTimeOffset?: string | null
  description?: string | null
  locationName?: string | null
  locationUnlocode?: string | null
  locationCountry?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  rawData?: Record<string, unknown> | null
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
