/**
 * FMS Projects Module - Project Cargo API
 * Manage LCL cargo items for a project
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsProjectCargo } from '../../../../data/entities'
import { fmsProjectCargoCreateSchema, fmsProjectCargoUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.cargo.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.cargo.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.cargo.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.cargo.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

// Helper to extract project ID from URL path
function extractProjectIdFromUrl(request: Request): string | null {
  try {
    const url = new URL(request.url)
    const match = url.pathname.match(/\/projects\/([^/]+)\/cargo/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsProjectCargo,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    entityId: 'fms_projects:fms_project_cargo',
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
      cargoSequence: 'cargo_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsProjectCargoCreateSchema,
    beforeCreate: async (ctx: any) => {
      const projectId = ctx.request ? extractProjectIdFromUrl(ctx.request) : null
      if (projectId) {
        ctx.data.projectId = projectId
      }

      // Auto-increment cargo sequence if not provided
      if (!ctx.data.cargoSequence) {
        const existingCargo = await ctx.em.find(FmsProjectCargo, {
          project: ctx.data.projectId,
          deletedAt: null,
        })
        ctx.data.cargoSequence = existingCargo.length + 1
      }
    },
  } as any,
  update: {
    schema: fmsProjectCargoUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
