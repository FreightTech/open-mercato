/**
 * FMS Projects Module - Project Legs API
 * Manage route legs for a project
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsProjectLeg } from '../../../../data/entities'
import { fmsProjectLegCreateSchema, fmsProjectLegUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.legs.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.legs.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.legs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.legs.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsProjectLeg,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['project', 'originLocation', 'destinationLocation', 'carrier'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get project ID from route params
      const projectId = ctx.params?.id
      if (projectId) {
        return { project: projectId }
      }
      return {}
    },
    sortFieldMap: {
      legSequence: 'leg_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsProjectLegCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set project ID from route params
      const projectId = ctx.params?.id
      if (projectId) {
        ctx.data.projectId = projectId
      }

      // Auto-increment leg sequence if not provided
      if (!ctx.data.legSequence) {
        const existingLegs = await ctx.em.find(FmsProjectLeg, {
          project: ctx.data.projectId,
          deletedAt: null,
        })
        ctx.data.legSequence = existingLegs.length + 1
      }
    },
  } as any,
  update: {
    schema: fmsProjectLegUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
