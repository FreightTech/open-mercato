import type { EntityManager } from '@mikro-orm/postgresql'
import { FrcPricingConfig, FrcCarrierPricingConfig } from '../data/entities'
import type { TransportMode } from '../data/validators'

/**
 * Default pricing configuration values.
 * Used as fallback when no config exists for a tenant.
 */
export const DEFAULT_PRICING_CONFIG = {
  airVolumetricFactor: '167',
  seaVolumetricFactor: '1000',
  roadVolumetricFactor: '333',
  truckWidthMetres: '2.4',
  minChargeableWeightKg: null as string | null,
}

export type PricingConfigData = FrcPricingConfig | typeof DEFAULT_PRICING_CONFIG

/**
 * Parameters for cargo weight calculations.
 * These are the resolved values after considering carrier overrides.
 */
export interface PricingParams {
  /** Volumetric conversion factor (kg per m³) */
  volumetricFactor: number
  /** Standard truck width in metres for loading metres calculation */
  truckWidthMetres: number
  /** Minimum chargeable weight in kg (null = no minimum) */
  minChargeableWeightKg: number | null
}

/**
 * Scope for pricing settings queries.
 */
export interface PricingScope {
  tenantId: string
  organizationId: string
}

/**
 * Load default pricing config for tenant+org.
 * Returns defaults if no config exists.
 */
export async function loadPricingConfig(
  em: EntityManager,
  scope: PricingScope
): Promise<PricingConfigData> {
  const config = await em.findOne(FrcPricingConfig, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  return config ?? DEFAULT_PRICING_CONFIG
}

/**
 * Load carrier-specific pricing override.
 * Returns null if no override exists for this carrier.
 */
export async function loadCarrierPricingConfig(
  em: EntityManager,
  scope: PricingScope & { carrierId: string }
): Promise<FrcCarrierPricingConfig | null> {
  return em.findOne(FrcCarrierPricingConfig, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    carrierId: scope.carrierId,
  })
}

/**
 * Get effective volumetric factor.
 * Carrier override takes precedence over default.
 */
export function getVolumetricFactor(
  config: PricingConfigData,
  carrierConfig: FrcCarrierPricingConfig | null,
  mode: TransportMode
): number {
  // Carrier override takes precedence
  if (carrierConfig?.volumetricFactor) {
    return parseFloat(carrierConfig.volumetricFactor)
  }
  // Use default for transport mode
  switch (mode) {
    case 'air':
      return parseFloat(config.airVolumetricFactor ?? '167')
    case 'sea':
      return parseFloat(config.seaVolumetricFactor ?? '1000')
    case 'road':
      return parseFloat(config.roadVolumetricFactor ?? '333')
  }
}

/**
 * Get effective minimum chargeable weight.
 * Carrier override takes precedence over default.
 */
export function getMinChargeableWeight(
  config: PricingConfigData,
  carrierConfig: FrcCarrierPricingConfig | null
): number | null {
  // Carrier override takes precedence
  if (carrierConfig?.minChargeableWeightKg) {
    return parseFloat(carrierConfig.minChargeableWeightKg)
  }
  // Then global default
  if (config.minChargeableWeightKg) {
    return parseFloat(config.minChargeableWeightKg)
  }
  return null
}

/**
 * Get truck width for loading metres calculation.
 */
export function getTruckWidth(config: PricingConfigData): number {
  return parseFloat(config.truckWidthMetres ?? '2.4')
}

/**
 * Build pricing params for calculation functions.
 * Resolves carrier overrides and defaults into a single params object.
 *
 * @param em - Entity manager
 * @param scope - Tenant and organization scope
 * @param options - Optional carrier ID and transport mode
 * @returns Resolved pricing parameters for calculations
 *
 * @example
 * ```ts
 * const pricing = await resolvePricingParams(em, ctx.scope, {
 *   carrierId: offer.carrierId,
 *   transportMode: 'air',
 * })
 * const computed = calculateComputedFields(cargoInput, pricing)
 * ```
 */
export async function resolvePricingParams(
  em: EntityManager,
  scope: PricingScope,
  options: { carrierId?: string | null; transportMode?: TransportMode } = {}
): Promise<PricingParams> {
  const config = await loadPricingConfig(em, scope)
  const carrierConfig = options.carrierId
    ? await loadCarrierPricingConfig(em, { ...scope, carrierId: options.carrierId })
    : null

  const mode = options.transportMode ?? 'air'

  return {
    volumetricFactor: getVolumetricFactor(config, carrierConfig, mode),
    truckWidthMetres: getTruckWidth(config),
    minChargeableWeightKg: getMinChargeableWeight(config, carrierConfig),
  }
}

/**
 * Serialize pricing config for API response.
 */
export function serializePricingConfig(config: PricingConfigData) {
  return {
    airVolumetricFactor: config.airVolumetricFactor,
    seaVolumetricFactor: config.seaVolumetricFactor,
    roadVolumetricFactor: config.roadVolumetricFactor,
    truckWidthMetres: config.truckWidthMetres,
    minChargeableWeightKg: config.minChargeableWeightKg ?? null,
  }
}

/**
 * Serialize carrier pricing config for API response.
 */
export function serializeCarrierPricingConfig(config: FrcCarrierPricingConfig) {
  return {
    id: config.id,
    carrierId: config.carrierId,
    carrierName: config.carrierName,
    transportMode: config.transportMode as TransportMode,
    volumetricFactor: config.volumetricFactor ?? null,
    minChargeableWeightKg: config.minChargeableWeightKg ?? null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}
