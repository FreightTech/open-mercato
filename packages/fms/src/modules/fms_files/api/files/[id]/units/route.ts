/**
 * FMS File Units - Nested CRUD
 * GET  /api/fms_files/files/:id/units — list units for a file
 * POST /api/fms_files/files/:id/units — create a unit in a file
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsFileUnit } from '../../../../data/entities'
import { CARGO_TYPES, WEIGHT_UNITS, VOLUME_UNITS } from '../../../../data/types'
import { packageDetailSchema } from '../../../../data/validators'

function extractFileIdFromUrl(request: Request): string | null {
  const match = request.url.match(/\/files\/([0-9a-f-]+)\/units/)
  return match?.[1] ?? null
}

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  sortField: z.string().optional().default('sortOrder'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
})

const createSchema = z.object({
  fileId: z.string().uuid(),
  cargoType: z.enum(CARGO_TYPES),
  originLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  commodityDescription: z.string().nullable().optional(),
  grossWeight: z.coerce.number().nullable().optional(),
  weightUnit: z.enum(WEIGHT_UNITS).nullable().optional(),
  volume: z.coerce.number().nullable().optional(),
  volumeUnit: z.enum(VOLUME_UNITS).nullable().optional(),
  isHazardous: z.boolean().default(false),
  containerNumber: z.string().nullable().optional(),
  containerType: z.string().nullable().optional(),
  packageCount: z.number().int().nullable().optional(),
  packagesDetail: z.array(packageDetailSchema).nullable().optional(),
  sortOrder: z.number().int().default(0),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsFileUnit,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    sortFieldMap: { sortOrder: 'sort_order', createdAt: 'created_at' },
    buildFilters: (_query, ctx) => {
      const fileId = extractFileIdFromUrl(ctx.request!)
      if (!fileId) return { id: 'impossible' }
      return { file: fileId }
    },
  },
  create: {
    schema: createSchema,
    mapToEntity: (input: any) => {
      const { fileId, grossWeight, volume, ...rest } = input
      return {
        ...rest,
        file: fileId,
        grossWeight: grossWeight != null ? String(grossWeight) : null,
        volume: volume != null ? String(volume) : null,
      }
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
  get: {
    operationId: 'listFmsFileUnits',
    summary: 'List units for a file',
    tags: ['FMS Files'],
    responses: { 200: { description: 'List of units' } },
  },
  post: {
    operationId: 'createFmsFileUnit',
    summary: 'Create a unit in a file',
    tags: ['FMS Files'],
    responses: { 201: { description: 'Created unit' } },
  },
}
