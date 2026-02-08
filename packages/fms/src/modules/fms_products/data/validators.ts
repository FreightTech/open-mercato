import { z } from 'zod'

/**
 * Charge unit enum validator
 */
export const chargeUnitSchema = z.enum(['container', 'file', 'weight_measure', 'cargo_value_percent'])

/**
 * Charge code usage frequency validator
 */
export const chargeCodeUsageSchema = z.enum(['most_common', 'common', 'rare'])

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
// FmsProduct Validators (Simplified)
// ========================================

export const createProductSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  chargeCodeId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

export const updateProductSchema = createProductSchema
  .partial()
  .omit({ organizationId: true, tenantId: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateProductDto = z.infer<typeof createProductSchema>
export type UpdateProductDto = z.infer<typeof updateProductSchema>

// ========================================
// Query/Filter Validators
// ========================================

export const productFilterSchema = z.object({
  chargeCodeId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
})

export const carrierFilterSchema = z.object({
  carrierType: carrierTypeSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
})

export type ProductFilter = z.infer<typeof productFilterSchema>
export type CarrierFilter = z.infer<typeof carrierFilterSchema>

// ========================================
// CSV Import Validators
// ========================================

export const csvImportChargeCodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  charge_unit: chargeUnitSchema,
  keywords: z.string().optional().nullable(),
  usage: chargeCodeUsageSchema.optional().nullable(),
})

export type CsvImportChargeCode = z.infer<typeof csvImportChargeCodeSchema>
