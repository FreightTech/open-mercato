import { z } from 'zod'
import { FRC_PROJECT_STATUSES, FRC_ROUTING_TYPES } from '../../../lib/types'
import { numericString } from '../../../lib/validators'

// ============================================
// FrcProject Validators
// ============================================

export const createProjectSchema = z.object({
  projectNumber: z.string().max(50).optional(), // Auto-generated if not provided
  rfqId: z.string().uuid().nullable().optional(),
  offerId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  status: z.enum(FRC_PROJECT_STATUSES).default('active'),
  totalValue: numericString,
  currencyCode: z.string().length(3).default('EUR'),
  // Route information
  originAirportId: z.string().uuid().nullable().optional(),
  destinationAirportId: z.string().uuid().nullable().optional(),
  // Dates
  shipmentReadyDate: z.string().nullable().optional(), // ISO date string
  requiredDeliveryDate: z.string().nullable().optional(), // ISO date string
  // AWB numbers (multiple)
  awbNumbers: z.array(z.string()).nullable().optional(),
  // Notes
  notes: z.string().nullable().optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = createProjectSchema.partial()

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const projectFilterSchema = z.object({
  q: z.string().optional(),
  projectNumber: z.string().optional(),
  accountId: z.string().uuid().optional(),
  status: z.enum(FRC_PROJECT_STATUSES).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type ProjectFilter = z.infer<typeof projectFilterSchema>

// ============================================
// FrcProjectAirRouting Validators
// ============================================

export const createProjectAirRoutingSchema = z.object({
  type: z.enum(FRC_ROUTING_TYPES).default('direct_flight'),
  flightNumber: z.string().max(50).nullable().optional(),
  originAirportId: z.string().uuid().nullable().optional(),
  destinationAirportId: z.string().uuid().nullable().optional(),
  departureDate: z.coerce.date().nullable().optional(),
  departureTime: z.string().max(5).nullable().optional(),
  arrivalDate: z.coerce.date().nullable().optional(),
  arrivalTime: z.string().max(5).nullable().optional(),
  carrierId: z.string().uuid().nullable().optional(),
  carrierType: z.string().max(50).nullable().optional(),
  connectionRateTotal: numericString,
  currencyCode: z.string().length(3).default('EUR'),
})

export const updateProjectAirRoutingSchema = z.object({
  type: z.enum(FRC_ROUTING_TYPES).optional(),
  flightNumber: z.string().max(50).nullable().optional(),
  originAirportId: z.string().uuid().nullable().optional(),
  destinationAirportId: z.string().uuid().nullable().optional(),
  departureDate: z.coerce.date().nullable().optional(),
  departureTime: z.string().max(5).nullable().optional(),
  arrivalDate: z.coerce.date().nullable().optional(),
  arrivalTime: z.string().max(5).nullable().optional(),
  carrierId: z.string().uuid().nullable().optional(),
  carrierType: z.string().max(50).nullable().optional(),
  connectionRateTotal: numericString,
  currencyCode: z.string().length(3).optional(),
})

export type CreateProjectAirRouting = z.infer<typeof createProjectAirRoutingSchema>
export type UpdateProjectAirRouting = z.infer<typeof updateProjectAirRoutingSchema>
