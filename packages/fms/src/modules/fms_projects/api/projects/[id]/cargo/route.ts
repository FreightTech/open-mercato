/**
 * FMS Files Module - File Cargo API
 * Manage LCL cargo items for a file
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsFileCargo } from '../../../../data/entities'
import { fmsFileCargoCreateSchema, fmsFileCargoUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.cargo.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.cargo.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.cargo.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.cargo.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsFileCargo,
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
      cargoSequence: 'cargo_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsFileCargoCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set file ID from route params
      const fileId = ctx.params?.id
      if (fileId) {
        ctx.data.fileId = fileId
      }

      // Auto-increment cargo sequence if not provided
      if (!ctx.data.cargoSequence) {
        const existingCargo = await ctx.em.find(FmsFileCargo, {
          file: ctx.data.fileId,
          deletedAt: null,
        })
        ctx.data.cargoSequence = existingCargo.length + 1
      }
    },
  } as any,
  update: {
    schema: fmsFileCargoUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
