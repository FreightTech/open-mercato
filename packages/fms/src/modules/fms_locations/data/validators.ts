import { z } from 'zod'
import { LOCATION_TYPES, MARITIME_LOCATION_TYPES, CONTRACTOR_ADDRESS_TYPES, AIR_LOCATION_TYPES } from './types'

// Helper to coerce string/number to boolean (preserves undefined for defaults to work)
const coerceBoolean = z.preprocess(
  (val) => {
    if (typeof val === 'boolean') return val
    if (val === 'true' || val === '1' || val === 1) return true
    if (val === 'false' || val === '0' || val === 0) return false
    // Return undefined for empty/null so .default() can take effect
    if (val === '' || val === null || val === undefined) return undefined
    return val
  },
  z.boolean().optional()
)

/**
 * Location type enum validator - all types
 */
export const locationTypeSchema = z.enum(LOCATION_TYPES)

/**
 * Maritime location type validator (port, terminal)
 */
export const maritimeLocationTypeSchema = z.enum(MARITIME_LOCATION_TYPES as unknown as [string, ...string[]])

/**
 * Contractor address type validator
 */
export const contractorAddressTypeSchema = z.enum(CONTRACTOR_ADDRESS_TYPES as unknown as [string, ...string[]])

/**
 * Air location type validator (airport)
 */
export const airLocationTypeSchema = z.enum(AIR_LOCATION_TYPES as unknown as [string, ...string[]])

// ========================================
// Unified Location Schema
// ========================================

export const createLocationSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z
    .string()
    .max(50)
    .regex(/^[\p{L}0-9_-]+$/u, 'Code must contain only letters, numbers, underscores, and hyphens')
    .optional()
    .nullable(),
  name: z.string().min(1, 'Name is required').max(255),
  type: locationTypeSchema,
  locode: z.string().max(10).optional().nullable(),
  portId: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  // Contractor address fields
  contractorId: z.string().uuid().optional().nullable(),
  addressLine1: z.string().max(500).optional().nullable(),
  addressLine2: z.string().max(500).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  isPrimary: coerceBoolean.default(false),
  isActive: coerceBoolean.default(true),
  googlePlaceId: z.string().max(500).optional().nullable(),
  facilityCodes: z.array(z.object({
    code: z.string().min(1),
    provider: z.enum(['SMDG', 'BIC']).nullable(),
  })).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

export const updateLocationSchema = createLocationSchema
  .partial()
  .omit({ organizationId: true, tenantId: true })
  .extend({
    id: z.string().uuid().optional(),
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateLocationDto = z.infer<typeof createLocationSchema>
export type UpdateLocationDto = z.infer<typeof updateLocationSchema>

// ========================================
// Contractor Address Schemas
// ========================================

export const createContractorAddressSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  contractorId: z.string().uuid(),
  type: contractorAddressTypeSchema,
  name: z.string().min(1, 'Name is required').max(255),
  addressLine1: z.string().max(500).optional().nullable(),
  addressLine2: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isPrimary: coerceBoolean.default(false),
  isActive: coerceBoolean.default(true),
  googlePlaceId: z.string().max(500).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

export const updateContractorAddressSchema = createContractorAddressSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, contractorId: true })
  .extend({
    id: z.string().uuid().optional(),
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateContractorAddressDto = z.infer<typeof createContractorAddressSchema>
export type UpdateContractorAddressDto = z.infer<typeof updateContractorAddressSchema>

// ========================================
// Backward Compatible Port/Terminal Schemas
// ========================================

export const createPortSchema = createLocationSchema.extend({
  type: z.literal('port').default('port'),
  locode: z.string().min(1, 'LOCODE is required').max(10),
})

export const updatePortSchema = createPortSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, type: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreatePortDto = z.infer<typeof createPortSchema>
export type UpdatePortDto = z.infer<typeof updatePortSchema>

export const createTerminalSchema = createLocationSchema.extend({
  type: z.literal('terminal').default('terminal'),
  portId: z.string().uuid().optional().nullable(),
})

export const updateTerminalSchema = createTerminalSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, type: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateTerminalDto = z.infer<typeof createTerminalSchema>
export type UpdateTerminalDto = z.infer<typeof updateTerminalSchema>

// ========================================
// Airport Schemas
// ========================================

export const createAirportSchema = createLocationSchema.extend({
  type: z.literal('airport').default('airport'),
  code: z
    .string()
    .min(2, 'IATA code must be at least 2 characters')
    .max(4, 'IATA code must be at most 4 characters')
    .regex(/^[A-Z]{2,4}$/, 'IATA code must be 2-4 uppercase letters'),
})

export const updateAirportSchema = createAirportSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, type: true })
  .extend({
    updatedBy: z.string().uuid().optional().nullable(),
  })

export type CreateAirportDto = z.infer<typeof createAirportSchema>
export type UpdateAirportDto = z.infer<typeof updateAirportSchema>

// ========================================
// Query/Filter Validators
// ========================================

export const locationFilterSchema = z.object({
  type: locationTypeSchema.optional(),
  portId: z.string().uuid().optional(),
  contractorId: z.string().uuid().optional(),
  includeDeleted: z.boolean().optional(),
  search: z.string().optional(),
})

export const portFilterSchema = z.object({
  includeDeleted: z.boolean().optional(),
  search: z.string().optional(),
})

export const terminalFilterSchema = z.object({
  portId: z.string().uuid().optional(),
  includeDeleted: z.boolean().optional(),
  search: z.string().optional(),
})

export const airportFilterSchema = z.object({
  includeDeleted: z.boolean().optional(),
  includeInactive: z.boolean().optional(),
  search: z.string().optional(),
})

export const contractorAddressFilterSchema = z.object({
  contractorId: z.string().uuid(),
  type: contractorAddressTypeSchema.optional(),
  includeDeleted: z.boolean().optional(),
  includeInactive: z.boolean().optional(),
  search: z.string().optional(),
})

export type LocationFilter = z.infer<typeof locationFilterSchema>
export type PortFilter = z.infer<typeof portFilterSchema>
export type TerminalFilter = z.infer<typeof terminalFilterSchema>
export type AirportFilter = z.infer<typeof airportFilterSchema>
export type ContractorAddressFilter = z.infer<typeof contractorAddressFilterSchema>

// ========================================
// CSV Import Validators
// ========================================

export const csvImportRowSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  type: locationTypeSchema,
  lat: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number().min(-90).max(90).nullable().optional()
  ),
  lng: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number().min(-180).max(180).nullable().optional()
  ),
  locode: z.string().optional().nullable(),
  port_code: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  address_line1: z.string().optional().nullable(),
  address_line2: z.string().optional().nullable(),
})

export type CsvImportRow = z.infer<typeof csvImportRowSchema>
