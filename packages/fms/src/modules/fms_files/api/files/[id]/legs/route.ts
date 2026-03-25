/**
 * FMS File Legs - Nested CRUD
 * GET  /api/fms_files/files/:id/legs — list legs for a file
 * POST /api/fms_files/files/:id/legs — create a leg in a file
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsFileLeg } from '../../../../data/entities'
import { LEG_TYPES } from '../../../../data/types'
import { triggerTrackingIfApplicable } from '../../../../lib/tracking-integration'
import { createFmsLogger } from '../../../../../../lib/logger'

const logger = createFmsLogger('fms_files.legs.api')

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
  gateInCutoff: z.string().nullable().optional(),
  documentationCutoff: z.string().nullable().optional(),
  vgmCutoff: z.string().nullable().optional(),
  dangerousGoodsCutoff: z.string().nullable().optional(),
  demFreeTime: z.coerce.number().int().min(0).nullable().optional(),
  detFreeTime: z.coerce.number().int().min(0).nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  aircraftType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
}

const crud = makeCrudRoute({
  metadata,
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
    buildFilters: (_query: any, ctx: any) => {
      const fileId = extractFileIdFromUrl(ctx.request!)
      if (!fileId) return { id: 'impossible' }
      return { file: fileId }
    },
  },
  del: { softDelete: true },
} as any)

export const GET = crud.GET

export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fileId = extractFileIdFromUrl(req)
  if (!fileId) return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })

  const body = await req.json()
  const parsed = createSchema.safeParse({ ...body, fileId })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const { fileId: _fileId, gateInCutoff, documentationCutoff, vgmCutoff, dangerousGoodsCutoff, ...legFields } = parsed.data
  const leg = em.create(FmsFileLeg, {
    ...legFields,
    file: fileId,
    organizationId: auth.orgId ?? '',
    tenantId: auth.tenantId ?? '',
    createdBy: auth.sub ?? null,
    updatedBy: auth.sub ?? null,
    gateInCutoff: gateInCutoff ? new Date(gateInCutoff) : null,
    documentationCutoff: documentationCutoff ? new Date(documentationCutoff) : null,
    vgmCutoff: vgmCutoff ? new Date(vgmCutoff) : null,
    dangerousGoodsCutoff: dangerousGoodsCutoff ? new Date(dangerousGoodsCutoff) : null,
  })

  await em.flush()

  triggerTrackingIfApplicable(em, leg, container).catch((err) =>
    logger.warn('tracking_trigger_failed', { legId: leg.id, error: err instanceof Error ? err.message : String(err) })
  )

  return NextResponse.json(leg, { status: 201 })
}

export const openApi = {
  get: { operationId: 'listFmsFileLegs', summary: 'List legs for a file', tags: ['FMS Files'], responses: { 200: { description: 'List of legs' } } },
  post: { operationId: 'createFmsFileLeg', summary: 'Create a leg in a file', tags: ['FMS Files'], responses: { 201: { description: 'Created leg' } } },
}
