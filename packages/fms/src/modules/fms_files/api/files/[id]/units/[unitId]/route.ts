/**
 * FMS File Unit - Single Entity
 * GET    /api/fms_files/files/:id/units/:unitId
 * PUT    /api/fms_files/files/:id/units/:unitId
 * DELETE /api/fms_files/files/:id/units/:unitId
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsFileUnit, FmsFileUnitLeg } from '../../../../../data/entities'
import { updateUnitSchema } from '../../../../../data/validators'
import { buildScopeFilters } from '../../../../../lib/scope-filters'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.containers.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid(), unitId: z.string().uuid() })

export async function GET(req: Request, ctx: { params?: { id?: string; unitId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const unit = await em.findOne(FmsFileUnit, {
    id: parsed.data.unitId,
    file: parsed.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
  return NextResponse.json(unit)
}

export async function PUT(req: Request, ctx: { params?: { id?: string; unitId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const body = await req.json()
  const updateParsed = updateUnitSchema.omit({ id: true }).safeParse(body)
  if (!updateParsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: updateParsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const unit = await em.findOne(FmsFileUnit, {
    id: parsed.data.unitId,
    file: parsed.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  const data = updateParsed.data
  if (data.originLocationId !== undefined) unit.originLocationId = data.originLocationId
  if (data.destinationLocationId !== undefined) unit.destinationLocationId = data.destinationLocationId
  if (data.containerNumber !== undefined) unit.containerNumber = data.containerNumber
  if (data.containerType !== undefined) unit.containerType = data.containerType
  if (data.commodityDescription !== undefined) unit.commodityDescription = data.commodityDescription
  if (data.grossWeight !== undefined) unit.grossWeight = data.grossWeight != null ? String(data.grossWeight) : null
  if (data.weightUnit !== undefined) unit.weightUnit = data.weightUnit
  if (data.volume !== undefined) unit.volume = data.volume != null ? String(data.volume) : null
  if (data.volumeUnit !== undefined) unit.volumeUnit = data.volumeUnit
  if (data.isHazardous !== undefined) unit.isHazardous = data.isHazardous
  if (data.packageCount !== undefined) unit.packageCount = data.packageCount
  if (data.packagesDetail !== undefined) unit.packagesDetail = data.packagesDetail
  if (data.sortOrder !== undefined) unit.sortOrder = data.sortOrder

  await em.flush()
  return NextResponse.json(unit)
}

export async function DELETE(req: Request, ctx: { params?: { id?: string; unitId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const unit = await em.findOne(FmsFileUnit, {
    id: parsed.data.unitId,
    file: parsed.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  const unitLegs = await em.find(FmsFileUnitLeg, { unit: unit.id, deletedAt: null })

  const now = new Date()
  unit.deletedAt = now
  for (const ul of unitLegs) ul.deletedAt = now

  await em.flush()
  return NextResponse.json({ id: unit.id, deleted: true })
}

export const openApi = {
  get: { operationId: 'getFmsFileUnit', summary: 'Get a file unit', tags: ['FMS Files'], responses: { 200: { description: 'Unit details' } } },
  put: { operationId: 'updateFmsFileUnit', summary: 'Update a file unit', tags: ['FMS Files'], responses: { 200: { description: 'Updated unit' } } },
  delete: { operationId: 'deleteFmsFileUnit', summary: 'Soft delete a file unit', tags: ['FMS Files'], responses: { 200: { description: 'Deleted' } } },
}
