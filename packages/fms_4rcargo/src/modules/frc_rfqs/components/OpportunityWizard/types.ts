import type {
  FrcSalesStage,
  FrcDeliveryStatus,
  FrcLooseOrUnitised,
  FrcStackableType,
} from '../../../../lib/types'

/** Draft state for a new opportunity */
export interface OpportunityDraft {
  // Basic info
  name: string
  product: string | null
  commodity: string | null
  salesStage: FrcSalesStage
  probability: number
  currencyCode: string
  amount: string | null

  // Route
  originAirportId: string | null
  originAirportCode: string | null
  destinationAirportId: string | null
  destinationAirportCode: string | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  looseOrUnitised: FrcLooseOrUnitised | null
  targetRate: string | null

  // Description
  description: string | null
}

/** Draft state for a cargo line item */
export interface CargoItemDraft {
  /** Temporary client-side ID for tracking */
  _tempId: string
  name: string
  numberOfPieces: number
  stackableType: FrcStackableType
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string | null
  // Computed fields (read-only in UI)
  volumeM3: string
  volumetricWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
}

/** Airport search result for entity search */
export interface AirportSearchResult {
  id: string
  code: string
  name: string
  city?: string
  country?: string
}

/** Result from creating an opportunity */
export interface CreateOpportunityResult {
  id: string
  name: string
}

/** Dropdown option type */
export interface DropdownOption {
  value: string
  label: string
}

// Constants for dropdowns
export const SALES_STAGE_OPTIONS: DropdownOption[] = [
  { value: 'received', label: 'Received' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

export const CURRENCY_OPTIONS: DropdownOption[] = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
]

export const LOOSE_OR_UNITISED_OPTIONS: DropdownOption[] = [
  { value: 'loose', label: 'Loose' },
  { value: 'unitised', label: 'Unitised' },
]

export const STACKABLE_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'fully_stackable', label: 'Fully Stackable' },
  { value: 'non_stackable', label: 'Non-Stackable' },
]

export const PRODUCT_OPTIONS: DropdownOption[] = [
  { value: 'General Cargo', label: 'General Cargo' },
  { value: 'Dangerous Goods', label: 'Dangerous Goods' },
  { value: 'Perishables', label: 'Perishables' },
  { value: 'Live Animals', label: 'Live Animals' },
  { value: 'Valuable Cargo', label: 'Valuable Cargo' },
  { value: 'Pharmaceuticals', label: 'Pharmaceuticals' },
  { value: 'Other', label: 'Other' },
]

/** Create empty opportunity draft */
export function createEmptyOpportunityDraft(): OpportunityDraft {
  return {
    name: '',
    product: null,
    commodity: null,
    salesStage: 'received',
    probability: 50,
    currencyCode: 'EUR',
    amount: null,
    originAirportId: null,
    originAirportCode: null,
    destinationAirportId: null,
    destinationAirportCode: null,
    shipmentReadyDate: null,
    requiredAtDestinationDate: null,
    looseOrUnitised: null,
    targetRate: null,
    description: null,
  }
}

/** Create empty cargo item draft */
export function createEmptyCargoItemDraft(): CargoItemDraft {
  return {
    _tempId: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    numberOfPieces: 1,
    stackableType: 'fully_stackable',
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    actualWeightKg: null,
    volumeM3: '0',
    volumetricWeightKg: '0',
    chargeableWeightKg: '0',
    loadingMetres: '0',
  }
}

/**
 * Calculate cargo metrics from dimensions and weight
 * Air cargo: 1 m3 = 167 kg volumetric weight
 */
export function calculateCargoMetrics(cargo: CargoItemDraft): {
  volumeM3: string
  volumetricWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
} {
  const lengthCm = parseFloat(cargo.lengthCm || '0') || 0
  const widthCm = parseFloat(cargo.widthCm || '0') || 0
  const heightCm = parseFloat(cargo.heightCm || '0') || 0
  const pieces = cargo.numberOfPieces || 1
  const actualWeightKg = parseFloat(cargo.actualWeightKg || '0') || 0

  // Volume = L x W x H x pieces / 1,000,000 (cm3 to m3)
  const volumeM3 = (lengthCm * widthCm * heightCm * pieces) / 1_000_000

  // Volumetric weight (air cargo: 1 m3 = 167 kg)
  const volumetricWeightKg = volumeM3 * 167

  // Chargeable weight = max(actual total weight, volumetric weight)
  const actualTotalWeight = actualWeightKg * pieces
  const chargeableWeightKg = Math.max(actualTotalWeight, volumetricWeightKg)

  // Loading metres (for trucking): length / 100 * width / 240 * pieces
  const loadingMetres = (lengthCm / 100) * (widthCm / 240) * pieces

  return {
    volumeM3: volumeM3.toFixed(4),
    volumetricWeightKg: volumetricWeightKg.toFixed(2),
    chargeableWeightKg: chargeableWeightKg.toFixed(2),
    loadingMetres: loadingMetres.toFixed(4),
  }
}
