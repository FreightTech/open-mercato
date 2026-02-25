import { z } from 'zod'

const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

// Offer Template validators
export const offerTemplateCreateSchema = scoped.extend({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  subjectTemplate: z.string().trim().min(1).max(500),
  contentTemplate: z.string().trim().min(1),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export type OfferTemplateCreateInput = z.infer<typeof offerTemplateCreateSchema>

export const offerTemplateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  subjectTemplate: z.string().trim().min(1).max(500).optional(),
  contentTemplate: z.string().trim().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export type OfferTemplateUpdateInput = z.infer<typeof offerTemplateUpdateSchema>

export const offerTemplateListSchema = scoped.extend({
  isActive: z.boolean().optional(),
})

export type OfferTemplateListInput = z.infer<typeof offerTemplateListSchema>

// SugarCRM Config validators
// Note: Credentials are stored in environment variables (SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, SUGARCRM_PASSWORD)
// The database only stores per-tenant sync configuration and status

export const sugarCrmSyncModuleConfigSchema = z.object({
  moduleName: z.string().min(1).max(100),
  enabled: z.boolean(),
  targetEntity: z.string().min(1).max(100),
  fieldMappings: z.record(z.string(), z.string()).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
})

export type SugarCrmSyncModuleConfig = z.infer<typeof sugarCrmSyncModuleConfigSchema>

export const sugarCrmConfigUpsertSchema = scoped.extend({
  syncModules: z.array(sugarCrmSyncModuleConfigSchema).nullable().optional(),
  isEnabled: z.boolean().optional(),
})

export type SugarCrmConfigUpsertInput = z.infer<typeof sugarCrmConfigUpsertSchema>

// ============================================================================
// Pricing Config validators
// ============================================================================

/** Regex for decimal numbers with up to 2 decimal places */
const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal number')

/** Transport modes for freight calculation */
export const transportModeSchema = z.enum(['air', 'sea', 'road'])
export type TransportMode = z.infer<typeof transportModeSchema>

/**
 * Schema for updating default pricing configuration.
 * All fields are optional - only provided fields will be updated.
 */
export const pricingConfigUpdateSchema = scoped.extend({
  /** Air freight volumetric factor (kg per m³, default: 167) */
  airVolumetricFactor: decimalString.optional(),
  /** Sea freight volumetric factor (kg per m³, default: 1000) */
  seaVolumetricFactor: decimalString.optional(),
  /** Road freight volumetric factor (kg per m³, default: 333) */
  roadVolumetricFactor: decimalString.optional(),
  /** Standard truck width in metres (default: 2.4) */
  truckWidthMetres: decimalString.optional(),
  /** Minimum chargeable weight in kg (optional, null to remove) */
  minChargeableWeightKg: decimalString.nullable().optional(),
})

export type PricingConfigUpdateInput = z.infer<typeof pricingConfigUpdateSchema>

/**
 * Schema for creating a carrier pricing override.
 */
export const carrierPricingConfigCreateSchema = scoped.extend({
  /** Carrier (Contractor) ID */
  carrierId: uuid(),
  /** Carrier name (for display) */
  carrierName: z.string().trim().min(1).max(255),
  /** Transport mode */
  transportMode: transportModeSchema,
  /** Override volumetric factor (null = use default) */
  volumetricFactor: decimalString.nullable().optional(),
  /** Override minimum chargeable weight (null = use default) */
  minChargeableWeightKg: decimalString.nullable().optional(),
})

export type CarrierPricingConfigCreateInput = z.infer<typeof carrierPricingConfigCreateSchema>

/**
 * Schema for updating a carrier pricing override.
 */
export const carrierPricingConfigUpdateSchema = z.object({
  /** Transport mode */
  transportMode: transportModeSchema.optional(),
  /** Override volumetric factor (null = use default) */
  volumetricFactor: decimalString.nullable().optional(),
  /** Override minimum chargeable weight (null = use default) */
  minChargeableWeightKg: decimalString.nullable().optional(),
})

export type CarrierPricingConfigUpdateInput = z.infer<typeof carrierPricingConfigUpdateSchema>
