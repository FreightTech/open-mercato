/**
 * FMS Files - Single File API
 * GET    /api/fms_files/files/:id — get file with units and legs
 * PUT    /api/fms_files/files/:id — update file
 * DELETE /api/fms_files/files/:id — soft delete file
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { wrap } from '@mikro-orm/core'
import { FmsFile, FmsFileUnit, FmsFileLeg, FmsFileUnitLeg } from '../../../data/entities'
import { FmsLocation } from '../../../../fms_locations/data/entities'
import { FmsCarrier } from '../../../../fms_products/data/entities'
import { Contractor } from '../../../../contractors/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { computeFileWarnings, computeLegCoverage } from '../../../lib/file-warnings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid() })

const updateSchema = z.object({
  assigneeId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
) {
  const filters: Record<string, unknown> = { deletedAt: null }
  if (auth.tenantId) filters.tenantId = auth.tenantId

  const orgIds: string[] = []
  if (scope?.filterIds?.length) orgIds.push(...scope.filterIds.filter(Boolean) as string[])
  else if (scope?.allowedIds?.length) orgIds.push(...scope.allowedIds.filter(Boolean) as string[])
  else if (scope?.selectedId) orgIds.push(scope.selectedId)
  else if (auth.orgId) orgIds.push(auth.orgId)

  if (orgIds.length > 0) filters.organizationId = { $in: orgIds }

  return filters
}

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const file = await em.findOne(FmsFile, {
    id: parsed.data.id,
    ...buildScopeFilters(auth, scope),
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const units = await em.find(FmsFileUnit, {
    file,
    deletedAt: null,
  }, { orderBy: { sortOrder: 'asc' } })

  const legs = await em.find(FmsFileLeg, {
    file,
    deletedAt: null,
  }, { orderBy: { legSequence: 'asc' } })

  // Resolve location names for units and legs in a single batch query
  const locationIds = [
    ...units.flatMap((u) => [u.originLocationId, u.destinationLocationId]),
    ...legs.flatMap((l) => [l.originLocationId, l.destinationLocationId]),
  ].filter((id): id is string => !!id)

  const uniqueLocationIds = [...new Set(locationIds)]
  const locations = uniqueLocationIds.length > 0
    ? await em.find(FmsLocation, { id: { $in: uniqueLocationIds } }, { fields: ['id', 'name'] })
    : []

  const locationNameById = Object.fromEntries(locations.map((l) => [l.id, l.name]))

  const carrierIds = [...new Set(legs.map((l) => l.carrierId).filter((id): id is string => !!id))]
  const carriers = carrierIds.length > 0
    ? await em.find(FmsCarrier, { id: { $in: carrierIds } }, { fields: ['id', 'name'] })
    : []
  const carrierNameById = Object.fromEntries(carriers.map((c) => [c.id, c.name]))

  const legIds = legs.map((l) => l.id)
  const unitLegsRaw = legIds.length > 0
    ? await em.find(FmsFileUnitLeg, { leg: { $in: legIds }, deletedAt: null }, {
        orderBy: { unit: { sortOrder: 'asc' }, leg: { legSequence: 'asc' } },
      })
    : []

  const unitLegs = unitLegsRaw.map((ul) => {
    const obj = wrap(ul).toObject() as Record<string, unknown>
    return {
      id: ul.id,
      unitId: obj.unit as string,
      legId: obj.leg as string,
      truckPlate: ul.truckPlate,
      trailerPlate: ul.trailerPlate,
      driverFullName: ul.driverFullName,
      driverIdNumber: ul.driverIdNumber,
      driverPhone: ul.driverPhone,
      sealNumber: ul.sealNumber,
      blNumber: ul.blNumber,
      consolidationContainerNumber: ul.consolidationContainerNumber,
      notes: ul.notes,
      ptd: ul.ptd,
      etd: ul.etd,
      atd: ul.atd,
      pta: ul.pta,
      eta: ul.eta,
      ata: ul.ata,
    }
  })

  const contractor = file.contractorId
    ? await em.findOne(Contractor, { id: file.contractorId }, { fields: ['id', 'name'] })
    : null

  const assigneeUser = file.assigneeId
    ? await findOneWithDecryption(em, User, { id: file.assigneeId }, undefined, { tenantId: auth.tenantId ?? null, organizationId: auth.orgId ?? null })
    : null
  const assigneeName = assigneeUser ? (assigneeUser.name || assigneeUser.email) : null

  // Compute warnings and per-unit leg coverage
  const warnings = computeFileWarnings(units, legs, unitLegs)
  const legCoverageByUnitId = Object.fromEntries(
    units.map((u) => [
      u.id,
      computeLegCoverage(u.id, u.originLocationId, u.destinationLocationId, unitLegs, legs),
    ])
  )

  return NextResponse.json({
    ...file,
    contractorName: contractor?.name ?? null,
    assigneeName,
    warnings,
    units: units.map((u) => ({
      ...u,
      originName: u.originLocationId ? (locationNameById[u.originLocationId] ?? null) : null,
      destinationName: u.destinationLocationId ? (locationNameById[u.destinationLocationId] ?? null) : null,
      legCoverage: legCoverageByUnitId[u.id] ?? '0/0',
    })),
    legs: legs.map((l) => ({
      ...l,
      originName: l.originLocationId ? (locationNameById[l.originLocationId] ?? null) : null,
      destinationName: l.destinationLocationId ? (locationNameById[l.destinationLocationId] ?? null) : null,
      carrierName: l.carrierId ? (carrierNameById[l.carrierId] ?? null) : null,
    })),
    unitLegs,
  })
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const body = await req.json()
  const updateParsed = updateSchema.safeParse(body)
  if (!updateParsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: updateParsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const file = await em.findOne(FmsFile, {
    id: parsed.data.id,
    ...buildScopeFilters(auth, scope),
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const data = updateParsed.data
  if (data.assigneeId !== undefined) file.assigneeId = data.assigneeId
  if (data.notes !== undefined) file.notes = data.notes
  file.updatedBy = auth.sub ?? null

  await em.flush()

  return NextResponse.json(file)
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const file = await em.findOne(FmsFile, {
    id: parsed.data.id,
    ...buildScopeFilters(auth, scope),
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  file.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ id: file.id, deleted: true })
}

export const openApi = {
  get: {
    operationId: 'getFmsFile',
    summary: 'Get FMS file with units and legs',
    tags: ['FMS Files'],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
    responses: { 200: { description: 'File details' }, 404: { description: 'Not found' } },
  },
  put: {
    operationId: 'updateFmsFile',
    summary: 'Update FMS file',
    tags: ['FMS Files'],
    responses: { 200: { description: 'Updated file' } },
  },
  delete: {
    operationId: 'deleteFmsFile',
    summary: 'Soft delete FMS file',
    tags: ['FMS Files'],
    responses: { 200: { description: 'Deleted' } },
  },
}
