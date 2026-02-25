import { z } from 'zod'
import {
  FRC_SALES_STAGES,
  FRC_DELIVERY_STATUSES,
  FRC_ORIGIN_TYPES,
  FRC_LOOSE_OR_UNITISED,
  FRC_STACKABLE_TYPES,
} from '../../../lib/types'
import { numericString, numericStringWithDefault } from '../../../lib/validators'

// ============================================
// FrcRfq Validators
// ============================================

export const createRfqSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  accountId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  salesStage: z.enum(FRC_SALES_STAGES).default('received'),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  amount: numericString,
  currencyCode: z.string().length(3).default('EUR'),
  deliveryStatus: z.enum(FRC_DELIVERY_STATUSES).default('awaiting'),
  isDelayed: z.boolean().default(false),
  originType: z.enum(FRC_ORIGIN_TYPES).default('airport'),
  originAirportId: z.string().uuid().nullable().optional(),
  destinationAirportId: z.string().uuid().nullable().optional(),
  shipmentReadyDate: z.coerce.date().nullable().optional(),
  requiredAtDestinationDate: z.coerce.date().nullable().optional(),
  looseOrUnitised: z.enum(FRC_LOOSE_OR_UNITISED).nullable().optional(),
  targetRate: numericString,
  product: z.string().max(100).nullable().optional(),
  commodity: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  // Optional explicit organizationId - if provided, overrides scope resolution
  organizationId: z.string().uuid().optional(),
})

export type CreateRfqInput = z.infer<typeof createRfqSchema>

export const updateRfqSchema = createRfqSchema.partial()

export type UpdateRfqInput = z.infer<typeof updateRfqSchema>

export const rfqFilterSchema = z.object({
  q: z.string().optional(),
  accountId: z.string().uuid().optional(),
  salesStage: z.enum(FRC_SALES_STAGES).optional(),
  deliveryStatus: z.enum(FRC_DELIVERY_STATUSES).optional(),
  assignedToId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type RfqFilter = z.infer<typeof rfqFilterSchema>

// ============================================
// FrcAirCargo Validators
// ============================================

export const createAirCargoSchema = z.object({
  rfqId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(255),
  numberOfPieces: z.coerce.number().int().min(1).default(1),
  stackableType: z.enum(FRC_STACKABLE_TYPES).default('fully_stackable'),
  lengthCm: numericString,
  widthCm: numericString,
  heightCm: numericString,
  volumeM3: numericStringWithDefault('0'),
  actualWeightKg: numericStringWithDefault('0'),
  chargeableWeightKg: numericStringWithDefault('0'),
  loadingMetres: numericStringWithDefault('0'),
})

export type CreateAirCargoInput = z.infer<typeof createAirCargoSchema>

export const updateAirCargoSchema = createAirCargoSchema.partial().omit({ rfqId: true })

export type UpdateAirCargoInput = z.infer<typeof updateAirCargoSchema>

export const airCargoFilterSchema = z.object({
  rfqId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type AirCargoFilter = z.infer<typeof airCargoFilterSchema>
