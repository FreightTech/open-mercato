import { z } from 'zod'
import {
  FRC_QUOTE_STATUSES,
  FRC_CONNECTION_METHODS,
  FRC_ROUTING_TYPES,
} from '../../../lib/types'

// ============================================
// FrcQuote Validators
// ============================================

export const createQuoteSchema = z.object({
  rfqId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(255),
  carrierId: z.string().uuid().nullable().optional(),
  status: z.enum(FRC_QUOTE_STATUSES).default('draft'),
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

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>

export const updateQuoteSchema = createQuoteSchema.partial().omit({ rfqId: true })

export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>

export const quoteFilterSchema = z.object({
  q: z.string().optional(),
  rfqId: z.string().uuid().optional(),
  status: z.enum(FRC_QUOTE_STATUSES).optional(),
  carrierId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type QuoteFilter = z.infer<typeof quoteFilterSchema>

// ============================================
// FrcAirRouting Validators
// ============================================

export const createAirRoutingSchema = z.object({
  quoteId: z.string().uuid(),
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

export const updateAirRoutingSchema = createAirRoutingSchema.partial().omit({ quoteId: true })

export type UpdateAirRoutingInput = z.infer<typeof updateAirRoutingSchema>

export const airRoutingFilterSchema = z.object({
  quoteId: z.string().uuid().optional(),
  type: z.enum(FRC_ROUTING_TYPES).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type AirRoutingFilter = z.infer<typeof airRoutingFilterSchema>
