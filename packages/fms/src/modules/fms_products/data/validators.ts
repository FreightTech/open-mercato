import { z } from 'zod'
import type { ChargeUnit, ChargeCodeUsage, ContractType, CarrierType } from './types.js'

/**
 * Charge unit enum validator
 * - container: Charged per container
 * - file: Charged per shipment/file
 * - weight_measure: Charged by weight or volume measure
 * - cargo_value_percent: Charged as percentage of cargo value
 */
export const chargeUnitSchema = z.enum(['container', 'file', 'weight_measure', 'cargo_value_percent'])

/**
 * Charge code usage frequency validator
 */
export const chargeCodeUsageSchema = z.enum(['most_common', 'common', 'rare'])

/**
 * Contract type enum validator (legacy - use reference field)
 */
export const contractTypeSchema = z.enum(['SPOT', 'NAC', 'BASKET'])

/**
 * Product type enum validator
 */
export const productTypeSchema = z.enum([
  'GFRT',
  'GBAF',
  'GBAF_PIECE',
  'GBOL',
  'GTHC',
  'GCUS',
  'CUSTOM',
])

/**
 * Carrier type enum validator
 */
export const carrierTypeSchema = z.enum(['sea', 'air', 'rail', 'road'])

// ========================================
// FmsChargeCode Validators
// ========================================
export const createChargeCodeSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores only'),
  name: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  chargeUnit: chargeUnitSchema,
  keywords: z.string().optional().nullable(),
  usage: chargeCodeUsageSchema.optional().nullable(),
  isActive: z.boolean().optional().default(true),
})

export const updateChargeCodeSchema = createChargeCodeSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, code: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateChargeCodeDto = z.infer<typeof createChargeCodeSchema>
export type UpdateChargeCodeDto = z.infer<typeof updateChargeCodeSchema>

// ========================================
// FmsCarrier Validators
// ========================================
export const createCarrierSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores only'),
  name: z.string().min(1).max(255),
  carrierType: carrierTypeSchema,
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

export const updateCarrierSchema = createCarrierSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, code: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateCarrierDto = z.infer<typeof createCarrierSchema>
export type UpdateCarrierDto = z.infer<typeof updateCarrierSchema>

// ========================================
// FmsProduct Validators (STI - Type Specific)
// ========================================

/**
 * Base product schema - shared fields for all product types
 */
const baseProductSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  chargeCodeId: z.string().uuid(),
  carrierId: z.string().uuid().optional().nullable(), // Shipping line/airline operating the service
  description: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

/**
 * Freight Product (GFRT) Validators
 */
export const createFreightProductSchema = baseProductSchema.extend({
  loop: z.string().min(1, 'Service loop is required'),
  source: z.string().min(1, 'Source port is required'),
  destination: z.string().min(1, 'Destination port is required'),
  transitTime: z.number().int().positive().optional().nullable(),
})

export const updateFreightProductSchema = createFreightProductSchema
  .partial()
  .omit({ organizationId: true, tenantId: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateFreightProductDto = z.infer<typeof createFreightProductSchema>
export type UpdateFreightProductDto = z.infer<typeof updateFreightProductSchema>

/**
 * THC Product (GTHC) Validators
 */
export const createTHCProductSchema = baseProductSchema.extend({
  location: z.string().min(1, 'Location is required'),
  chargeType: z.enum(['origin', 'destination']).optional().nullable(),
})

export const updateTHCProductSchema = createTHCProductSchema
  .partial()
  .omit({ organizationId: true, tenantId: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateTHCProductDto = z.infer<typeof createTHCProductSchema>
export type UpdateTHCProductDto = z.infer<typeof updateTHCProductSchema>

/**
 * Customs Product (GCUS) Validators
 */
export const createCustomsProductSchema = baseProductSchema.extend({
  location: z.string().min(1, 'Location is required'),
  serviceType: z.enum(['import', 'export', 'transit']).optional().nullable(),
})

export const updateCustomsProductSchema = createCustomsProductSchema
  .partial()
  .omit({ organizationId: true, tenantId: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateCustomsProductDto = z.infer<typeof createCustomsProductSchema>
export type UpdateCustomsProductDto = z.infer<typeof updateCustomsProductSchema>

/**
 * Simple Products (GBAF, GBAF_PIECE, GBOL, CUSTOM) Validators
 */
export const createSimpleProductSchema = baseProductSchema

export const updateSimpleProductSchema = baseProductSchema
  .partial()
  .omit({ organizationId: true, tenantId: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateSimpleProductDto = z.infer<typeof createSimpleProductSchema>
export type UpdateSimpleProductDto = z.infer<typeof updateSimpleProductSchema>

// ========================================
// FmsProductVariant Validators (Flattened with pricing)
// ========================================

/**
 * Variant schema - flattened structure with pricing
 * Each variant represents a specific price offering with:
 * - Container size
 * - Provider (who invoices you)
 * - Validity period
 * - Price and currency
 * - Reference (contract number or "FAK" for spot)
 */
export const createVariantSchema = z
  .object({
    organizationId: z.string().uuid(),
    tenantId: z.string().uuid(),
    productId: z.string().uuid(),
    providerId: z.string().uuid().optional().nullable(), // Who invoices you (Contractor)
    containerSize: z.string().optional().nullable(), // 20DV, 40DV, 40HC
    // Pricing fields (moved from FmsProductPrice)
    validityStart: z.coerce.date().optional().nullable(),
    validityEnd: z.coerce.date().optional().nullable(),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal with up to 2 decimal places').optional().nullable(),
    currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters (ISO 4217)').default('USD'),
    reference: z.string().max(255).optional().nullable(), // Contract number or "FAK" for spot
    isActive: z.boolean().default(true),
    createdBy: z.string().uuid().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.validityEnd && data.validityStart) {
        return data.validityEnd >= data.validityStart
      }
      return true
    },
    {
      message: 'Validity end date must be equal to or after validity start date',
      path: ['validityEnd'],
    }
  )

export const updateVariantSchema = z
  .object({
    providerId: z.string().uuid().optional().nullable(),
    containerSize: z.string().optional().nullable(),
    validityStart: z.coerce.date().optional().nullable(),
    validityEnd: z.coerce.date().optional().nullable(),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal with up to 2 decimal places').optional().nullable(),
    currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters (ISO 4217)').optional(),
    reference: z.string().max(255).optional().nullable(),
    isActive: z.boolean().optional(),
    updatedBy: z.string().uuid().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.validityEnd && data.validityStart) {
        return data.validityEnd >= data.validityStart
      }
      return true
    },
    {
      message: 'Validity end date must be equal to or after validity start date',
      path: ['validityEnd'],
    }
  )

export type CreateVariantDto = z.infer<typeof createVariantSchema>
export type UpdateVariantDto = z.infer<typeof updateVariantSchema>

// Legacy aliases for backwards compatibility
export const createContainerVariantSchema = createVariantSchema
export const updateContainerVariantSchema = updateVariantSchema
export const createSimpleVariantSchema = createVariantSchema
export const updateSimpleVariantSchema = updateVariantSchema
export type CreateContainerVariantDto = CreateVariantDto
export type UpdateContainerVariantDto = UpdateVariantDto
export type CreateSimpleVariantDto = CreateVariantDto
export type UpdateSimpleVariantDto = UpdateVariantDto

// Note: FmsProductPrice validators removed - pricing is now in variants

// ========================================
// Query/Filter Validators
// ========================================

export const productFilterSchema = z.object({
  chargeCodeId: z.string().uuid().optional(),
  carrierId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
})

export const variantFilterSchema = z.object({
  productId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  containerSize: z.string().optional(),
  isActive: z.boolean().optional(),
  validOn: z.coerce.date().optional(), // Find variants valid on a specific date
})

export const carrierFilterSchema = z.object({
  carrierType: carrierTypeSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
})

export type ProductFilter = z.infer<typeof productFilterSchema>
export type VariantFilter = z.infer<typeof variantFilterSchema>
export type CarrierFilter = z.infer<typeof carrierFilterSchema>

// ========================================
// CSV Import Validators
// ========================================

export const csvImportChargeCodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  charge_unit: chargeUnitSchema,
  keywords: z.string().optional().nullable(), // Comma-separated keywords in CSV
  usage: chargeCodeUsageSchema.optional().nullable(),
})

export type CsvImportChargeCode = z.infer<typeof csvImportChargeCodeSchema>
