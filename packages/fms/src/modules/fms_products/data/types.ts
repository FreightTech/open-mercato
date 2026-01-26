/**
 * Charge unit types for billing
 * - container: Charged per container
 * - file: Charged per shipment/file
 * - weight_measure: Charged by weight or volume measure
 * - cargo_value_percent: Charged as percentage of cargo value
 */
export type ChargeUnit = 'container' | 'file' | 'weight_measure' | 'cargo_value_percent'

/**
 * Usage frequency indicator for charge codes
 */
export type ChargeCodeUsage = 'most_common' | 'common' | 'rare'

/**
 * Contract types for pricing (legacy - use reference field instead)
 */
export type ContractType = 'SPOT' | 'NAC' | 'BASKET'

/**
 * Product type discriminators (maps to charge codes)
 */
export type ProductType =
  | 'GFRT' // Freight Container
  | 'GBAF' // BAF (Container)
  | 'GBAF_PIECE' // BAF (Piece)
  | 'GBOL' // Bill of Lading
  | 'GTHC' // Terminal Handling Charge
  | 'GCUS' // Customs Clearance
  | 'CUSTOM' // User-defined charge codes

/**
 * Variant type discriminators
 */
export type VariantType = 'container' | 'simple'

/**
 * Carrier type - mode of transport
 * - sea: Ocean shipping carriers (MSC, Maersk, etc.)
 * - air: Air cargo carriers (Lufthansa Cargo, Emirates SkyCargo, etc.)
 * - rail: Rail freight carriers
 * - road: Trucking/road transport carriers
 */
export type CarrierType = 'sea' | 'air' | 'rail' | 'road'

