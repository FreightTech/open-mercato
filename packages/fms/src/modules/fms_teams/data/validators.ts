import { z } from 'zod'

const scoped = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
})

// FmsTeam schemas
export const teamCreateSchema = z.object({
  name: z.string().min(1).max(255),
  isActive: z.boolean().optional().default(true),
})
export type TeamCreateInput = z.infer<typeof teamCreateSchema>

export const teamUpdateSchema = teamCreateSchema.partial()
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>

export const scopedTeamCreateSchema = scoped.extend({
  data: teamCreateSchema,
})
export type ScopedTeamCreateInput = z.infer<typeof scopedTeamCreateSchema>

export const teamListQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.string().optional().default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
})
export type TeamListQueryInput = z.infer<typeof teamListQuerySchema>

// FmsUserTeam schemas
export const userTeamUpdateSchema = z.object({
  teamId: z.string().uuid().nullable().optional(),
})
export type UserTeamUpdateInput = z.infer<typeof userTeamUpdateSchema>

// Member list query schema
export const memberListQuerySchema = z.object({
  search: z.string().optional(),
  teamId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  sortBy: z.string().optional().default('userName'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
})
export type MemberListQueryInput = z.infer<typeof memberListQuerySchema>

// User contractor assignment schemas
export const userContractorAssignmentCreateSchema = z.object({
  userId: z.string().uuid(),
  contractorId: z.string().uuid(),
})
export type UserContractorAssignmentCreateInput = z.infer<typeof userContractorAssignmentCreateSchema>

export const userContractorAssignmentDeleteSchema = z.object({
  userId: z.string().uuid(),
  contractorId: z.string().uuid(),
})
export type UserContractorAssignmentDeleteInput = z.infer<typeof userContractorAssignmentDeleteSchema>

export const userContractorListQuerySchema = z.object({
  userId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})
export type UserContractorListQueryInput = z.infer<typeof userContractorListQuerySchema>

// Team contractor assignment schemas
export const teamContractorAssignmentCreateSchema = z.object({
  teamId: z.string().uuid(),
  contractorId: z.string().uuid(),
})
export type TeamContractorAssignmentCreateInput = z.infer<typeof teamContractorAssignmentCreateSchema>

export const teamContractorAssignmentDeleteSchema = z.object({
  teamId: z.string().uuid(),
  contractorId: z.string().uuid(),
})
export type TeamContractorAssignmentDeleteInput = z.infer<typeof teamContractorAssignmentDeleteSchema>

export const teamContractorListQuerySchema = z.object({
  teamId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})
export type TeamContractorListQueryInput = z.infer<typeof teamContractorListQuerySchema>
