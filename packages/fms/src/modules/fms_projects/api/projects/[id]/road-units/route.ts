/**
 * FMS Projects Module - Road Units API
 * Manage road transport units for a project
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsRoadUnit } from '../../../../data/entities'
import { fmsRoadUnitCreateSchema, fmsRoadUnitUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsRoadUnit,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['project'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      const projectId = ctx.params?.id
      if (projectId) {
        return { project: projectId }
      }
      return {}
    },
    sortFieldMap: {
      cmrNumber: 'cmr_number',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsRoadUnitCreateSchema,
    beforeCreate: async (ctx: any) => {
      const projectId = ctx.params?.id
      if (projectId) {
        ctx.data.projectId = projectId
      }
    },
  } as any,
  update: {
    schema: fmsRoadUnitUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
