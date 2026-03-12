import { FRC_PROJECT_STATUSES } from '../../../../lib/types'

export interface ProjectDraft {
  // Source linking (optional)
  rfqId: string | null
  offerId: string | null

  // Basic details
  accountId: string | null
  accountName: string | null
  status: typeof FRC_PROJECT_STATUSES[number]
  totalValue: string | null
  currencyCode: string

  // Route
  originAirportId: string | null
  originAirportCode: string | null
  destinationAirportId: string | null
  destinationAirportCode: string | null

  // Dates
  shipmentReadyDate: string | null
  requiredDeliveryDate: string | null

  // Notes
  notes: string | null
}

export function createEmptyProjectDraft(): ProjectDraft {
  return {
    rfqId: null,
    offerId: null,
    accountId: null,
    accountName: null,
    status: 'active',
    totalValue: null,
    currencyCode: 'EUR',
    originAirportId: null,
    originAirportCode: null,
    destinationAirportId: null,
    destinationAirportCode: null,
    shipmentReadyDate: null,
    requiredDeliveryDate: null,
    notes: null,
  }
}

export interface RfqOption {
  id: string
  name: string
  originAirportId: string | null
  destinationAirportId: string | null
  accountId: string | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  amount: string | null
  currencyCode: string
  originAirport?: { id: string; code: string; city: string | null } | null
  destinationAirport?: { id: string; code: string; city: string | null } | null
}

export interface OfferOption {
  id: string
  name: string
  rfqId: string
  totalRate: string | null
  currencyCode: string
  awbNumber: string | null
}

export interface AirportOption {
  id: string
  code: string
  city: string | null
}

export interface ContractorOption {
  id: string
  name: string
}

export const PROJECT_STATUS_OPTIONS = FRC_PROJECT_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

export const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
]
