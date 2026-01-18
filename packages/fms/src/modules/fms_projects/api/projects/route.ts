/**
 * FMS Projects Module - Main API Route
 * CRUD operations for projects with workflow integration
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsProject } from '../../data/entities'
import { fmsProjectCreateSchema, fmsProjectUpdateSchema } from '../../data/validators'
import type { SearchService } from '@open-mercato/search'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import type { AuthContext } from '@/lib/auth/server'
import { generateProjectNumber } from '../../lib/activity-handlers'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    q: z.string().optional(),
    currentStep: z.string().optional(),
    clientId: z.string().uuid().optional(),
    cargoType: z.enum(['fcl', 'lcl']).optional(),
    shipmentType: z.string().optional(),
    sortField: z.string().optional().default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
}

export const metadata = routeMetadata

/**
 * Build search filters for list queries
 */
async function buildSearchFilters(
  query: z.infer<typeof listSchema>,
  ctx: { container: { resolve: (key: string) => unknown }; auth?: AuthContext | null }
): Promise<Record<string, unknown>> {
  const filters: Record<string, unknown> = {}
  const tenantId = ctx.auth?.tenantId

  // Search integration
  if (query.q && query.q.trim().length > 0 && tenantId) {
    try {
      const searchService = ctx.container.resolve('searchService') as SearchService | undefined

      if (searchService) {
        const results = await searchService.search(query.q.trim(), {
          tenantId,
          organizationId: null,
          limit: 100,
          strategies: ['fulltext'],
          entityTypes: ['fms_projects:fms_project'],
        })

        if (results.length > 0) {
          filters.id = { $in: results.map((r) => r.recordId) }
        } else {
          // No results - return empty set
          filters.id = { $in: ['00000000-0000-0000-0000-000000000000'] }
        }
      }
    } catch (error) {
      console.error('[fms_projects:search] Search service error:', error)
    }
  }

  // Filter by workflow step
  if (query.currentStep) {
    filters.currentStep = query.currentStep
  }

  // Filter by client
  if (query.clientId) {
    filters.client = query.clientId
  }

  // Filter by cargo type
  if (query.cargoType) {
    filters.cargoType = query.cargoType
  }

  // Filter by shipment type
  if (query.shipmentType) {
    filters.shipmentType = query.shipmentType
  }

  return filters
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsProject,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    entityId: E.fms_projects.fms_project, // CRITICAL for search indexing
    populate: ['client', 'originLocation', 'destinationLocation', 'legs', 'cargo'] as any,
    sortFieldMap: {
      id: 'id',
      projectNumber: 'project_number',
      projectDate: 'project_date',
      currentStep: 'current_step',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: any, ctx: any) => buildSearchFilters(query, ctx),
  } as any,
  create: {
    schema: fmsProjectCreateSchema,
    mapToEntity: (input: any) => ({
      ...input,
      currencyCode: input.currencyCode ?? 'USD',
    }),
    beforeCreate: async (ctx: any) => {
      // Generate simple project number for now
      const timestamp = Date.now()
      const shipmentType = ctx.data.shipmentType || 'EXP'
      const cargoType = (ctx.data.cargoType || 'fcl').toUpperCase()
      ctx.data.projectNumber = `${shipmentType}/${cargoType}/${timestamp}`

      // Set initial dates and status
      ctx.data.projectDate = ctx.data.projectDate || new Date()
      ctx.data.currentStep = 'draft'

      // TODO: Start workflow
      // This will be implemented once workflow module is properly integrated
      // const workflowService = ctx.container.resolve('workflowService')
      // const workflowInstance = await workflowService.startWorkflow({
      //   workflowId: 'project_lifecycle_v1',
      //   initialContext: {
      //     ...ctx.data,
      //     projectId: '{{PLACEHOLDER}}', // Will be set after entity created
      //   },
      //   metadata: {
      //     entityType: 'fms_projects:fms_project',
      //     initiatedBy: ctx.auth.userId,
      //   },
      //   tenantId: ctx.data.tenantId,
      //   organizationId: ctx.data.organizationId,
      // })
      // ctx.data.workflowInstanceId = workflowInstance.id
    },
    afterCreate: async (ctx: any) => {
      // TODO: Update workflow context with actual projectId
      // if (ctx.result.workflowInstanceId) {
      //   const workflow = await ctx.em.findOne(
      //     'WorkflowInstance',
      //     { id: ctx.result.workflowInstanceId }
      //   )
      //   if (workflow) {
      //     workflow.context.projectId = ctx.result.id
      //     await ctx.em.flush()
      //   }
      // }
    },
  } as any,
  update: {
    schema: fmsProjectUpdateSchema,
    beforeUpdate: async (ctx: any) => {
      const project = await ctx.em.findOne(FmsProject, { id: ctx.id })

      // Prevent edits after confirmation (Phase 2 will use amendments)
      if (
        project?.currentStep === 'confirmed' ||
        project?.currentStep === 'in_transit' ||
        project?.currentStep === 'delivered' ||
        project?.currentStep === 'completed'
      ) {
        throw new Error(
          'Cannot edit project after confirmation. Use amendments instead (Phase 2 feature).'
        )
      }
    },
  } as any,
  del: {
    softDelete: true,
    beforeDelete: async (ctx: any) => {
      const project = await ctx.em.findOne(FmsProject, { id: ctx.id })

      // TODO: Cancel workflow
      // if (project?.workflowInstanceId) {
      //   const workflowService = ctx.container.resolve('workflowService')
      //   await workflowService.cancelWorkflow(
      //     project.workflowInstanceId,
      //     'User deleted project'
      //   )
      // }

      // Update status
      if (project) {
        project.currentStep = 'cancelled'
        await ctx.em.flush()
      }
    },
  } as any,
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
