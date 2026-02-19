import { z } from 'zod'
import { FRC_PROJECT_STATUSES } from '../../../lib/types'

// ============================================
// FrcProject Validators
// ============================================

export const createProjectSchema = z.object({
  projectNumber: z.string().max(50).optional(), // Auto-generated if not provided
  rfqId: z.string().uuid().nullable().optional(),
  offerId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  status: z.enum(FRC_PROJECT_STATUSES).default('active'),
  totalValue: z.string().nullable().optional(),
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
