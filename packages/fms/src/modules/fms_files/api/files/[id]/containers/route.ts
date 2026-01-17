/**
 * FMS Files Module - File Containers API
 * Manage FCL containers for a file
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsFileContainer } from '../../../../data/entities'
import { fmsFileContainerCreateSchema, fmsFileContainerUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsFileContainer,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['file'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get file ID from route params
      const fileId = ctx.params?.id
      if (fileId) {
        return { file: fileId }
      }
      return {}
    },
    sortFieldMap: {
      containerNumber: 'container_number',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsFileContainerCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set file ID from route params
      const fileId = ctx.params?.id
      if (fileId) {
        ctx.data.fileId = fileId
      }
    },
  } as any,
  update: {
    schema: fmsFileContainerUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
