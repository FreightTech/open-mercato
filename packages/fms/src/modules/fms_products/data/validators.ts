import { z } from 'zod'

/**
 * Charge unit enum validator
 */
export const chargeUnitSchema = z.enum(['container', 'file', 'weight_measure', 'cargo_value_percent'])

/**
 * Product transport mode enum validator
 */
export const productTransportModeSchema = z.enum(['sea', 'air', 'rail'])

/**
 * Carrier type enum validator
 */
export const carrierTypeSchema = z.enum(['sea', 'air', 'rail', 'road'])

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
// FmsProduct Validators
// ========================================

export const createProductSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  chargeCode: z.string().max(50).optional().nullable(),
  chargeUnit: chargeUnitSchema.optional().nullable(),
  transportMode: productTransportModeSchema.optional().nullable(),
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
  chargeUnit: chargeUnitSchema.optional(),
  transportMode: productTransportModeSchema.optional(),
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
