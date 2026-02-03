/**
 * FMS Projects Module - Air Units API
 * Manage air cargo units for a project
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsAirUnit } from '../../../../data/entities'
import { fmsAirUnitCreateSchema, fmsAirUnitUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

// Helper to extract project ID from URL path
function extractProjectIdFromUrl(request: Request): string | null {
  try {
    const url = new URL(request.url)
    const match = url.pathname.match(/\/projects\/([^/]+)\/air-units/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsAirUnit,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    entityId: 'fms_projects:fms_air_unit',
    fields: [],
    populate: ['project'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      const projectId = ctx.request ? extractProjectIdFromUrl(ctx.request) : null
      if (projectId) {
        return { project_id: projectId }
      }
      return {}
    },
    // Fix: Query engine returns index ID as 'id', but we need the actual entity ID
    transformItem: (item: any) => {
      const actualId = item.entity_id ?? item.doc?.id ?? item.id
      return {
        ...item,
        id: actualId,
      }
    },
    sortFieldMap: {
      mawbNumber: 'mawb_number',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsAirUnitCreateSchema,
    beforeCreate: async (ctx: any) => {
      const projectId = ctx.request ? extractProjectIdFromUrl(ctx.request) : null
      if (projectId) {
        ctx.data.projectId = projectId
      }
    },
  } as any,
  update: {
    schema: fmsAirUnitUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
