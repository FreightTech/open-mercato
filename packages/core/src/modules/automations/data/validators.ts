import { z } from 'zod'

// ============================================================================
// Node Config Schemas
// ============================================================================

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  intervalMs: z.number().int().min(100).max(60000),
  backoffMultiplier: z.number().min(1).max(5),
})

export const automationNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.unknown()).default({}),
  disabled: z.boolean().optional(),
  onError: z.enum(['stop', 'continue', 'output']).optional(),
  retryPolicy: retryPolicySchema.optional(),
  notes: z.string().max(2000).optional(),
})

export const automationConnectionSchema = z.object({
  id: z.string().min(1).max(200),
  sourceNodeId: z.string().min(1).max(100),
  sourceOutput: z.string().min(1).max(50).default('main'),
  targetNodeId: z.string().min(1).max(100),
  targetInput: z.string().min(1).max(50).default('main'),
})

export const automationDefinitionDataSchema = z.object({
  nodes: z.array(automationNodeSchema).min(1).max(100),
  connections: z.array(automationConnectionSchema).max(500),
})

// ============================================================================
// CRUD Schemas
// ============================================================================

export const createAutomationSchema = z.object({
  automationId: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, 'Must be lowercase alphanumeric with hyphens/underscores').optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  definition: automationDefinitionDataSchema.optional(),
  enabled: z.boolean().optional().default(true),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    icon: z.string().optional(),
  }).optional(),
})

export const updateAutomationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  definition: automationDefinitionDataSchema.optional(),
  enabled: z.boolean().optional(),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    icon: z.string().optional(),
  }).optional().nullable(),
})

// ============================================================================
// Filter Schemas
// ============================================================================

export const filterOperatorSchema = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'startsWith', 'endsWith',
  'in', 'notIn', 'exists', 'notExists', 'regex',
])

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(200),
  operator: filterOperatorSchema,
  value: z.unknown(),
})

export const contextMappingSchema = z.object({
  targetKey: z.string().min(1).max(100),
  sourceExpression: z.string().min(1).max(200),
  defaultValue: z.unknown().optional(),
})

// ============================================================================
// Run / Execution Schemas
// ============================================================================

export const startRunSchema = z.object({
  input: z.record(z.unknown()).optional(),
})

export const testNodeSchema = z.object({
  nodeId: z.string().min(1),
  inputData: z.record(z.unknown()).optional(),
})

// ============================================================================
// List Query Schemas
// ============================================================================

export const listDefinitionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  search: z.string().optional(),
  enabled: z.enum(['true', 'false']).optional(),
  sortField: z.enum(['name', 'automationId', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const listRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  automationId: z.string().optional(),
  definitionId: z.string().optional(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  sortField: z.enum(['createdAt', 'executionTimeMs']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

// ============================================================================
// Inferred Types
// ============================================================================

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>
export type ListDefinitionsQuery = z.infer<typeof listDefinitionsQuerySchema>
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>
export type StartRunInput = z.infer<typeof startRunSchema>
export type TestNodeInput = z.infer<typeof testNodeSchema>
