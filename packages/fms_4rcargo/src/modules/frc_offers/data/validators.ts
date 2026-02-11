import { z } from 'zod'
import {
  FRC_OFFER_STATUSES,
  FRC_CONNECTION_METHODS,
  FRC_ROUTING_TYPES,
} from '../../../lib/types'

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
  connectionRatePerKg: z.string().nullable().optional(),
  connectionRateTotal: z.string().nullable().optional(),
  airfreightRatePerKg: z.string().nullable().optional(),
  airfreightRateTotal: z.string().nullable().optional(),
  totalRatePerKg: z.string().nullable().optional(),
  totalRate: z.string().nullable().optional(),
  currencyCode: z.string().length(3).default('EUR'),
  assignedToId: z.string().uuid().nullable().optional(),
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
  connectionRateTotal: z.string().nullable().optional(),
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
