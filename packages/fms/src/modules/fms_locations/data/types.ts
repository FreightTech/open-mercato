/**
 * Maritime location types (ports and terminals)
 */
export type MaritimeLocationType = 'port' | 'terminal'

/**
 * Air location types (airports)
 */
export type AirLocationType = 'airport'

/**
 * BIC/DCSA-derived facility types
 */
export type FacilityLocationType =
  | 'port_terminal'    // POTE — Port Terminal
  | 'depot'            // DEPO — Container Depot
  | 'rail_terminal'    // RAMP — Rail Ramp / Intermodal
  | 'intermodal'       // INTE — Intermodal Terminal
  | 'container_yard'   // COYA — Container Yard
  | 'cfs'              // COFS — Container Freight Station
  | 'border_crossing'  // BORD — Border Crossing

/**
 * Contractor address types
 */
export type ContractorAddressType =
  | 'contractor_office'
  | 'contractor_warehouse'
  | 'contractor_billing'
  | 'contractor_shipping'
  | 'contractor_other'

/**
 * Location type discriminator - combines maritime, air, facility, and contractor address types
 */
export type LocationType = MaritimeLocationType | AirLocationType | FacilityLocationType | ContractorAddressType

/**
 * All location types for validation
 */
export const LOCATION_TYPES = [
  'port',
  'terminal',
  'airport',
  'port_terminal',
  'depot',
  'rail_terminal',
  'intermodal',
  'container_yard',
  'cfs',
  'border_crossing',
  'contractor_office',
  'contractor_warehouse',
  'contractor_billing',
  'contractor_shipping',
  'contractor_other',
] as const

/**
 * A single facility code entry from a code list provider (SMDG, BIC, etc.)
 */
export interface FacilityCodeEntry {
  code: string
  provider: 'SMDG' | 'BIC' | null
}

/**
 * Maritime location types only
 */
export const MARITIME_LOCATION_TYPES: MaritimeLocationType[] = ['port', 'terminal']

/**
 * Air location types only
 */
export const AIR_LOCATION_TYPES: AirLocationType[] = ['airport']

/**
 * Contractor address types only
 */
export const CONTRACTOR_ADDRESS_TYPES: ContractorAddressType[] = [
  'contractor_office',
  'contractor_warehouse',
  'contractor_billing',
  'contractor_shipping',
  'contractor_other',
]

/**
 * Check if a location type is a contractor address type
 */
export function isContractorAddressType(type: LocationType): type is ContractorAddressType {
  return CONTRACTOR_ADDRESS_TYPES.includes(type as ContractorAddressType)
}

/**
 * Check if a location type is a maritime type
 */
export function isMaritimeLocationType(type: LocationType): type is MaritimeLocationType {
  return MARITIME_LOCATION_TYPES.includes(type as MaritimeLocationType)
}

/**
 * Check if a location type is an air type
 */
export function isAirLocationType(type: LocationType): type is AirLocationType {
  return AIR_LOCATION_TYPES.includes(type as AirLocationType)
}

/**
 * Extract purpose from contractor address type
 */
export function getContractorAddressPurpose(
  type: ContractorAddressType
): 'office' | 'warehouse' | 'billing' | 'shipping' | 'other' {
  const mapping: Record<ContractorAddressType, 'office' | 'warehouse' | 'billing' | 'shipping' | 'other'> = {
    contractor_office: 'office',
    contractor_warehouse: 'warehouse',
    contractor_billing: 'billing',
    contractor_shipping: 'shipping',
    contractor_other: 'other',
  }
  return mapping[type]
}

/**
 * Convert purpose to contractor address type
 */
export function purposeToContractorAddressType(
  purpose: 'office' | 'warehouse' | 'billing' | 'shipping' | 'other'
): ContractorAddressType {
  return `contractor_${purpose}` as ContractorAddressType
}

/**
 * Unified location interface
 */
export interface IFmsLocation {
  id: string
  organizationId: string
  tenantId: string
  code: string
  name: string
  type: LocationType
  locode?: string | null
  portId?: string | null
  lat?: number | null
  lng?: number | null
  city?: string | null
  country?: string | null
  // Contractor address fields
  contractorId?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  state?: string | null
  postalCode?: string | null
  isPrimary?: boolean
  isActive?: boolean
  googlePlaceId?: string | null
  facilityCodes?: FacilityCodeEntry[] | null
  createdAt: Date
  createdBy?: string | null
  updatedAt: Date
  updatedBy?: string | null
  deletedAt?: Date | null
}
