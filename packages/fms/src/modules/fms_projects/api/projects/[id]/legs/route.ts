/**
 * FMS Files Module - File Legs API
 * Manage route legs for a file
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsFileLeg } from '../../../../data/entities'
import { fmsFileLegCreateSchema, fmsFileLegUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsFileLeg,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['file', 'originLocation', 'destinationLocation', 'carrier'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get file ID from route params
      const fileId = ctx.params?.id
      if (fileId) {
        return { file: fileId }
      }
      return {}
    },
    sortFieldMap: {
      legSequence: 'leg_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: fmsFileLegCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set file ID from route params
      const fileId = ctx.params?.id
      if (fileId) {
        ctx.data.fileId = fileId
      }

      // Auto-increment leg sequence if not provided
      if (!ctx.data.legSequence) {
        const existingLegs = await ctx.em.find(FmsFileLeg, {
          file: ctx.data.fileId,
          deletedAt: null,
        })
        ctx.data.legSequence = existingLegs.length + 1
      }
    },
  } as any,
  update: {
    schema: fmsFileLegUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
