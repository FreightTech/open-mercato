/**
 * FMS Projects Module - Sea Containers API
 * Manage sea containers for a project
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsSeaContainer } from '../../../../data/entities'
import { fmsSeaContainerCreateSchema, fmsSeaContainerUpdateSchema } from '../../../../data/validators'

// Extend create schema to include projectId from frontend
const createSchemaWithProject = fmsSeaContainerCreateSchema.extend({
  projectId: z.string().uuid(),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

// Helper to extract project ID from URL path
// URL pattern: /api/fms_projects/projects/[projectId]/sea-containers
function extractProjectIdFromUrl(request: Request): string | null {
  try {
    const url = new URL(request.url)
    const match = url.pathname.match(/\/projects\/([^/]+)\/sea-containers/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsSeaContainer,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    entityId: 'fms_projects:fms_sea_container',
    fields: ['*'],
    populate: ['project'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Extract project ID from request URL since ctx.params is not available in makeCrudRoute
      const projectId = ctx.request ? extractProjectIdFromUrl(ctx.request) : null
      if (projectId) {
        return { project_id: projectId }
      }
      return {}
    },
    sortFieldMap: {
      containerNumber: 'container_number',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: createSchemaWithProject,
    mapToEntity: (input: any) => {
      const { projectId, ...rest } = input
      return {
        ...rest,
        project: projectId, // MikroORM relation field
      }
    },
  } as any,
  update: {
    schema: fmsSeaContainerUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
