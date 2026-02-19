import { z } from 'zod'
import { FRC_STACKABLE_TYPES } from '../../../lib/types'

// ============================================
// Air Cargo Validators
// ============================================

export const createAirCargoSchema = z.object({
  rfqId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Name is required').max(255),
  numberOfPieces: z.number().int().min(1).default(1),
  stackableType: z.enum(FRC_STACKABLE_TYPES).default('fully_stackable'),
  lengthCm: z.string().nullable().optional(),
  widthCm: z.string().nullable().optional(),
  heightCm: z.string().nullable().optional(),
  actualWeightKg: z.string().default('0'),
})

export type CreateAirCargoInput = z.infer<typeof createAirCargoSchema>

export const updateAirCargoSchema = createAirCargoSchema.partial()

export type UpdateAirCargoInput = z.infer<typeof updateAirCargoSchema>

export const airCargoFilterSchema = z.object({
  q: z.string().optional(),
  rfqId: z.string().uuid().optional(),
  hasRfq: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type AirCargoFilter = z.infer<typeof airCargoFilterSchema>
