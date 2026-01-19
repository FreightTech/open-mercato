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
    populate: ['project'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get project ID from route params
      const projectId = ctx.params?.id
      if (projectId) {
        return { project: projectId }
      }
      return {}
    },
    sortFieldMap: {
      cargoSequence: 'cargo_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsProjectCargoCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set project ID from route params
      const projectId = ctx.params?.id
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
