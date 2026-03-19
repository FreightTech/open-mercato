/**
 * FMS File Unit-Legs - CRUD
 * GET  /api/fms_files/unit-legs     — list unit-leg assignments (filterable by unitId or legId)
 * POST /api/fms_files/unit-legs     — assign a unit to a leg
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsFileUnitLeg } from '../../data/entities'

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  sortField: z.string().optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  unitId: z.string().uuid().optional(),
  legId: z.string().uuid().optional(),
})

const createSchema = z.object({
  unitId: z.string().uuid(),
  legId: z.string().uuid(),
  truckPlate: z.string().nullable().optional(),
  trailerPlate: z.string().nullable().optional(),
  driverFullName: z.string().nullable().optional(),
  driverIdNumber: z.string().nullable().optional(),
  driverPhone: z.string().nullable().optional(),
  sealNumber: z.string().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  consolidationContainerNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ptd: z.string().nullable().optional(),
  etd: z.string().nullable().optional(),
  atd: z.string().nullable().optional(),
  pta: z.string().nullable().optional(),
  eta: z.string().nullable().optional(),
  ata: z.string().nullable().optional(),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsFileUnitLeg,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    sortFieldMap: { createdAt: 'created_at' },
    buildFilters: (query: any) => {
      const filters: Record<string, unknown> = {}
      if (query.unitId) filters.unit = query.unitId
      if (query.legId) filters.leg = query.legId
      return filters
    },
  },
  create: {
    schema: createSchema,
    mapToEntity: (input: any) => {
      const { unitId, legId, ...rest } = input
      return { ...rest, unit: unitId, leg: legId }
    },
  },
  del: { softDelete: true },
} as any)

// Custom POST: restore soft-deleted record if one exists for the same (org, unit, leg)
// instead of hitting the unique constraint.
async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { unitId, legId, ...rest } = parsed.data
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Check for a soft-deleted assignment for the same unit+leg in this org
  const existing = await em.findOne(FmsFileUnitLeg, {
    unit: unitId,
    leg: legId,
    organizationId: auth.orgId ?? '',
    deletedAt: { $ne: null },
  } as any)

  if (existing) {
    existing.deletedAt = null
    // Reset any transport-detail fields that were passed
    if (rest.truckPlate !== undefined) existing.truckPlate = rest.truckPlate ?? null
    if (rest.trailerPlate !== undefined) existing.trailerPlate = rest.trailerPlate ?? null
    if (rest.driverFullName !== undefined) existing.driverFullName = rest.driverFullName ?? null
    if (rest.driverIdNumber !== undefined) existing.driverIdNumber = rest.driverIdNumber ?? null
    if (rest.driverPhone !== undefined) existing.driverPhone = rest.driverPhone ?? null
    if (rest.sealNumber !== undefined) existing.sealNumber = rest.sealNumber ?? null
    if (rest.blNumber !== undefined) existing.blNumber = rest.blNumber ?? null
    if (rest.consolidationContainerNumber !== undefined) existing.consolidationContainerNumber = rest.consolidationContainerNumber ?? null
    if (rest.notes !== undefined) existing.notes = rest.notes ?? null
    await em.flush()
    return NextResponse.json(existing, { status: 200 })
  }

  // Create new unit-leg assignment using already-parsed data (body stream is already consumed above)
  const unitLeg = em.create(FmsFileUnitLeg, {
    unit: unitId,
    leg: legId,
    organizationId: auth.orgId ?? '',
    tenantId: auth.tenantId ?? '',
    ...rest,
  } as any)
  await em.flush()
  return NextResponse.json(unitLeg, { status: 201 })
}

export const metadata = routeMetadata
export { POST }
export const GET = crud.GET
export const DELETE = crud.DELETE

export const openApi = {
  get: { operationId: 'listFmsFileUnitLegs', summary: 'List unit-leg assignments', tags: ['FMS Files'], responses: { 200: { description: 'List' } } },
  post: { operationId: 'createFmsFileUnitLeg', summary: 'Assign a unit to a leg', tags: ['FMS Files'], responses: { 201: { description: 'Created' } } },
}
