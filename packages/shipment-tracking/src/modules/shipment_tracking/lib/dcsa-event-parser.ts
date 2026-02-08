import crypto from 'node:crypto'
import type { CarrierFetchedEvent } from './carrier-adapter'
import type { CargoEventType, CargoEventClassification } from '../data/entities'

type RawDcsaEvent = Record<string, unknown>

type DcsaResponseShape =
  | { events: RawDcsaEvent[] }
  | RawDcsaEvent[]

export function extractDcsaEventArray(data: unknown): RawDcsaEvent[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'events' in data && Array.isArray((data as Record<string, unknown>).events)) {
    return (data as { events: RawDcsaEvent[] }).events
  }
  return []
}

export function parseDcsaEvents(data: DcsaResponseShape, carrierName: string): CarrierFetchedEvent[] {
  const events = extractDcsaEventArray(data)

  return events.map((event) => {
    const location = (event.eventLocation ?? (event.transportCall as Record<string, unknown> | undefined)?.location) as Record<string, unknown> | undefined
    const vessel = (event.transportCall as Record<string, unknown> | undefined)?.vessel as Record<string, unknown> | undefined
    const transportCall = event.transportCall as Record<string, unknown> | undefined

    const eventId = (event.eventID ?? event.eventId ?? crypto.randomUUID()) as string
    const eventType = event.eventType as CargoEventType
    const eventCode = (event.equipmentEventTypeCode ?? event.transportEventTypeCode ?? event.shipmentEventTypeCode) as string
    const eventClassification = (event.eventClassifierCode ?? null) as CargoEventClassification | null
    const eventDateTime = new Date(event.eventDateTime as string)

    return {
      eventId,
      eventType,
      eventCode,
      eventClassification,
      eventDateTime,
      description: (event.description as string) ?? null,
      locationName: (location?.locationName as string) ?? null,
      locationUnlocode: (location?.UNLocationCode as string) ?? null,
      locationCountry: ((location?.address as Record<string, unknown>)?.country as string) ?? null,
      vesselName: (vessel?.vesselName as string) ?? null,
      vesselImo: (vessel?.vesselIMONumber as string) ?? null,
      voyageNumber: ((vessel?.voyage as string) ?? (transportCall?.voyageNumber as string)) ?? null,
      rawData: event as Record<string, unknown>,
    }
  })
}
