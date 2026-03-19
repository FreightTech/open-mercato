/**
 * FMS File Legs - Nested CRUD
 * GET  /api/fms_files/files/:id/legs — list legs for a file
 * POST /api/fms_files/files/:id/legs — create a leg in a file
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsFileLeg } from '../../../../data/entities'
import { LEG_TYPES } from '../../../../data/types'

function extractFileIdFromUrl(request: Request): string | null {
  const match = request.url.match(/\/files\/([0-9a-f-]+)\/legs/)
  return match?.[1] ?? null
}

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  sortField: z.string().optional().default('legSequence'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
})

const createSchema = z.object({
  fileId: z.string().uuid(),
  legSequence: z.number().int().min(1),
  type: z.enum(LEG_TYPES),
  originLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  bookingNumber: z.string().nullable().optional(),
  carrierId: z.string().uuid().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  vesselName: z.string().nullable().optional(),
  vesselImo: z.string().nullable().optional(),
  voyageNumber: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  aircraftType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
}

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
    sortFieldMap: { legSequence: 'leg_sequence', createdAt: 'created_at' },
    buildFilters: (_query, ctx) => {
      const fileId = extractFileIdFromUrl(ctx.request!)
      if (!fileId) return { id: 'impossible' }
      return { file: fileId }
    },
  },
  create: {
    schema: createSchema,
    mapToEntity: (input: any) => {
      const { fileId, ...rest } = input
      return { ...rest, file: fileId }
    },
  },
  hooks: {
    beforeCreate: (input, ctx) => {
      const fileId = extractFileIdFromUrl(ctx.request!)
      if (fileId) (input as any).fileId = fileId
      return input
    },
  },
  del: { softDelete: true },
} as any)

export const metadata = routeMetadata
export const GET = crud.GET
export const POST = crud.POST

export const openApi = {
  get: { operationId: 'listFmsFileLegs', summary: 'List legs for a file', tags: ['FMS Files'], responses: { 200: { description: 'List of legs' } } },
  post: { operationId: 'createFmsFileLeg', summary: 'Create a leg in a file', tags: ['FMS Files'], responses: { 201: { description: 'Created leg' } } },
}
