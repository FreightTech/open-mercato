import { z } from 'zod'

// ============================================
// FrcTruck Validators
// ============================================

export const createTruckSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  isActive: z.boolean().default(true),
})

export type CreateTruckInput = z.infer<typeof createTruckSchema>

export const updateTruckSchema = createTruckSchema.partial()

export type UpdateTruckInput = z.infer<typeof updateTruckSchema>

export const truckFilterSchema = z.object({
  q: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true
      if (val === 'false') return false
      return undefined
    }),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type TruckFilter = z.infer<typeof truckFilterSchema>

// ============================================
// FrcTruckBooking Validators - DEPRECATED
// ============================================
// NOTE: FrcTruckBooking has been merged into FrcConsole.
// Booking fields (airRoutingId, profitLoss, chargeableWeight, etc.) 
// are now part of FrcConsole. See frc_console/data/validators.ts.

// ============================================
// FrcTruckPreset Validators
// ============================================

export const createTruckPresetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  width: z.coerce.number().int().positive('Width must be positive'),
  length: z.coerce.number().int().positive('Length must be positive'),
  height: z.coerce.number().int().positive('Height must be positive'),
  maxWeight: z.coerce.number().int().positive('Max weight must be positive'),
  // volume is auto-calculated, not in create schema
  isActive: z.boolean().default(true),
})

export type CreateTruckPresetInput = z.infer<typeof createTruckPresetSchema>

export const updateTruckPresetSchema = createTruckPresetSchema.partial()

export type UpdateTruckPresetInput = z.infer<typeof updateTruckPresetSchema>

export const truckPresetFilterSchema = z.object({
  q: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true
      if (val === 'false') return false
      return undefined
    }),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type TruckPresetFilter = z.infer<typeof truckPresetFilterSchema>

/** Calculate volume in cubic meters from dimensions in centimeters */
export function calculateVolumeM3(width: number, length: number, height: number): number {
  // Convert cm³ to m³ with 2 decimal precision
  // Formula: (w * l * h) / 1,000,000, rounded to 2 decimal places
  return Math.round((width * length * height) / 10000) / 100
}
