import { z } from 'zod'
import { FRC_PROJECT_STATUSES } from '../../../lib/types'

// ============================================
// FrcProject Validators
// ============================================

export const createProjectSchema = z.object({
  projectNumber: z.string().min(1, 'Project number is required').max(50),
  rfqId: z.string().uuid().nullable().optional(),
  quoteId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  status: z.enum(FRC_PROJECT_STATUSES).default('active'),
  totalValue: z.string().nullable().optional(),
  currencyCode: z.string().length(3).default('EUR'),
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
