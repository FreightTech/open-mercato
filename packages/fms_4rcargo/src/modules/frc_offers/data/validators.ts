import { z } from 'zod'
import {
  FRC_OFFER_STATUSES,
  FRC_CONNECTION_METHODS,
  FRC_ROUTING_TYPES,
} from '../../../lib/types'
import { numericString } from '../../../lib/validators'

// ============================================
// FrcOffer Validators
// ============================================

export const createOfferSchema = z.object({
  rfqId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(255),
  carrierId: z.string().uuid().nullable().optional(),
  status: z.enum(FRC_OFFER_STATUSES).default('draft'),
  awbNumber: z.string().max(50).nullable().optional(),
  connectionMethod: z.enum(FRC_CONNECTION_METHODS).nullable().optional(),
  departureDate: z.coerce.date().nullable().optional(),
  connectionRatePerKg: numericString,
  connectionRateTotal: numericString,
  airfreightRatePerKg: numericString,
  airfreightRateTotal: numericString,
  totalRatePerKg: numericString,
  totalRate: numericString,
  currencyCode: z.string().length(3).default('EUR'),
  assignedToId: z.string().uuid().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type CreateOfferInput = z.infer<typeof createOfferSchema>

export const updateOfferSchema = createOfferSchema.partial().omit({ rfqId: true })

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>

export const offerFilterSchema = z.object({
  q: z.string().optional(),
  rfqId: z.string().uuid().optional(),
  status: z.enum(FRC_OFFER_STATUSES).optional(),
  carrierId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type OfferFilter = z.infer<typeof offerFilterSchema>

// ============================================
// FrcAirRouting Validators
// ============================================

export const createAirRoutingSchema = z.object({
  offerId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(255),
  carrierId: z.string().uuid().nullable().optional(),
  carrierType: z.string().max(50).nullable().optional(),
  flightNumber: z.string().max(50).nullable().optional(),
  type: z.enum(FRC_ROUTING_TYPES).default('direct_flight'),
  originAirportId: z.string().uuid().nullable().optional(),
  destinationAirportId: z.string().uuid().nullable().optional(),
  departureDate: z.coerce.date().nullable().optional(),
  departureTime: z.string().max(5).nullable().optional(),
  arrivalDate: z.coerce.date().nullable().optional(),
  arrivalTime: z.string().max(5).nullable().optional(),
  connectionRateTotal: numericString,
  currencyCode: z.string().length(3).default('EUR'),
})

export type CreateAirRoutingInput = z.infer<typeof createAirRoutingSchema>

export const updateAirRoutingSchema = createAirRoutingSchema.partial().omit({ offerId: true })

export type UpdateAirRoutingInput = z.infer<typeof updateAirRoutingSchema>

export const airRoutingFilterSchema = z.object({
  offerId: z.string().uuid().optional(),
  type: z.enum(FRC_ROUTING_TYPES).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type AirRoutingFilter = z.infer<typeof airRoutingFilterSchema>

// ============================================
// FrcOfferLine Validators
// ============================================

import { FRC_STACKABLE_TYPES } from '../../../lib/types'

export const createOfferLineSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  numberOfPieces: z.coerce.number().int().min(1).default(1),
  stackableType: z.enum(FRC_STACKABLE_TYPES).default('fully_stackable'),
  lengthCm: numericString,
  widthCm: numericString,
  heightCm: numericString,
  actualWeightKg: numericString,
  // Computed fields - can be provided or will be calculated
  volumeM3: numericString,
  chargeableWeightKg: numericString,
  loadingMetres: numericString,
})

export type CreateOfferLineInput = z.infer<typeof createOfferLineSchema>

export const updateOfferLineSchema = createOfferLineSchema.partial()

export type UpdateOfferLineInput = z.infer<typeof updateOfferLineSchema>
