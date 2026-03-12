/**
 * Charge unit types for billing
 * - container: Charged per container
 * - file: Charged per shipment/file
 * - weight_measure: Charged by weight or volume measure
 * - cargo_value_percent: Charged as percentage of cargo value
 */
export type ChargeUnit = 'container' | 'file' | 'weight_measure' | 'cargo_value_percent'

/**
 * Product transport mode
 * - sea: Ocean shipping
 * - air: Air cargo
 * - rail: Rail freight
 */
export type ProductTransportMode = 'sea' | 'air' | 'rail'

/**
 * Carrier type - mode of transport
 * - sea: Ocean shipping carriers (MSC, Maersk, etc.)
 * - air: Air cargo carriers (Lufthansa Cargo, Emirates SkyCargo, etc.)
 * - rail: Rail freight carriers
 * - road: Trucking/road transport carriers
 */
export type CarrierType = 'sea' | 'air' | 'rail' | 'road'
