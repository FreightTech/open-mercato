import { FRC_CONSOLE_STATUSES } from '../../../../lib/types'

export interface ConsoleDraft {
  // Source linking (optional)
  projectId: string | null
  rfqId: string | null
  offerId: string | null
  airRoutingId: string | null

  // Console details
  date: string
  truckId: string | null
  truckName: string | null
  truckPresetId: string | null
  truckPresetName: string | null
  status: (typeof FRC_CONSOLE_STATUSES)[number]

  // Route
  originAirportId: string | null
  originAirportCode: string | null
  destinationAirportId: string | null
  destinationAirportCode: string | null

  // Notes
  notes: string | null
}

export function createEmptyConsoleDraft(): ConsoleDraft {
  return {
    projectId: null,
    rfqId: null,
    offerId: null,
    airRoutingId: null,
    date: new Date().toISOString().split('T')[0],
    truckId: null,
    truckName: null,
    truckPresetId: null,
    truckPresetName: null,
    status: 'planning',
    originAirportId: null,
    originAirportCode: null,
    destinationAirportId: null,
    destinationAirportCode: null,
    notes: null,
  }
}

export interface ProjectOption {
  id: string
  projectNumber: string
  originAirportId: string | null
  destinationAirportId: string | null
  originAirport?: { id: string; code: string; city: string | null } | null
  destinationAirport?: { id: string; code: string; city: string | null } | null
  shipmentReadyDate: string | null
  requiredDeliveryDate: string | null
}

export interface RfqOption {
  id: string
  name: string
  originAirportId: string | null
  destinationAirportId: string | null
  originAirport?: { id: string; code: string; city: string | null } | null
  destinationAirport?: { id: string; code: string; city: string | null } | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
}

export interface OfferOption {
  id: string
  name: string
  rfqId: string
  awbNumber: string | null
  airRoutings?: AirRoutingOption[]
}

export interface AirRoutingOption {
  id: string
  name: string
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
}

export interface TruckOption {
  id: string
  name: string
}

export interface TruckPresetOption {
  id: string
  name: string
  width: number
  length: number
  height: number
}

export const CONSOLE_STATUS_OPTIONS = FRC_CONSOLE_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '),
}))
