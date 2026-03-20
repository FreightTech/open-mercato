/**
 * FMS Files Transport - Data API
 *
 * Returns paginated transport rows:
 * - Default / legType filter: 1 row per FmsFileUnitLeg assignment
 * - view=units: 1 row per FmsFileUnit
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { wrap } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { FmsFile, FmsFileUnit, FmsFileLeg, FmsFileUnitLeg } from '../../data/entities'
import { FmsLocation } from '../../../fms_locations/data/entities'
import { FmsCarrier } from '../../../fms_products/data/entities'
import { Contractor } from '../../../contractors/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
}

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  pageSize: z.coerce.number().min(1).max(500).optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  legType: z.enum(['TRUCK', 'SHIP', 'RAIL', 'AIR']).optional(),
  view: z.enum(['units', 'legs']).optional(),
})

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null,
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

function computeFileStatus(fileLegs: FmsFileLeg[]): string {
  if (fileLegs.length === 0) return 'Empty'
  const allHaveAta = fileLegs.every((l) => (l.ataTimestamps?.length ?? 0) > 0)
  if (allHaveAta) return 'Delivered'
  const hasAta = fileLegs.some((l) => (l.ataTimestamps?.length ?? 0) > 0)
  if (hasAta) return 'Partially Delivered'
  const hasAtd = fileLegs.some((l) => (l.atdTimestamps?.length ?? 0) > 0)
  if (hasAtd) return 'In Transit'
  const hasEtd = fileLegs.some((l) => (l.etdTimestamps?.length ?? 0) > 0)
  if (hasEtd) return 'Ready'
  return 'Planning'
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })

  const { page, limit, pageSize, legType, view } = parsed.data
  const effectivePageSize = limit ?? pageSize ?? 100
  const offset = (page - 1) * effectivePageSize

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // ─── Units view: one row per FmsFileUnit ──────────────────────────────────
  if (view === 'units') {
    const total = await em.count(FmsFileUnit, scopeFilters)
    const totalPages = Math.ceil(total / effectivePageSize)

    if (total === 0) {
      return NextResponse.json({ items: [], total, page, pageSize: effectivePageSize, totalPages })
    }

    const pageUnits = await em.find(FmsFileUnit, scopeFilters, {
      limit: effectivePageSize,
      offset,
      orderBy: { sortOrder: 'asc', createdAt: 'desc' },
    })

    const fileIds = [...new Set(pageUnits.map((u) => (wrap(u).toObject() as any).file as string))]
    const files = fileIds.length > 0 ? await em.find(FmsFile, { id: { $in: fileIds } }) : []
    const fileById = new Map(files.map((f) => [f.id, f]))

    const locationIds = [...new Set(
      pageUnits.flatMap((u) => [u.originLocationId, u.destinationLocationId]).filter((id): id is string => !!id),
    )]
    const locations = locationIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: locationIds } }, { fields: ['id', 'name'] })
      : []
    const locationNameById = Object.fromEntries(locations.map((l) => [l.id, l.name]))

    const contractorIds = [...new Set(files.map((f) => f.contractorId).filter(Boolean))]
    const contractors = contractorIds.length > 0
      ? await em.find(Contractor, { id: { $in: contractorIds } }, { fields: ['id', 'name'] })
      : []
    const contractorNameById = Object.fromEntries(contractors.map((c) => [c.id, c.name]))

    const assigneeIds = [...new Set(files.map((f) => f.assigneeId).filter((id): id is string => !!id))]
    const assignees = assigneeIds.length > 0
      ? await findWithDecryption(em, User, { id: { $in: assigneeIds } }, undefined, { tenantId: auth.tenantId ?? null, organizationId: auth.orgId ?? null })
      : []
    const assigneeNameById = Object.fromEntries(assignees.map((u) => [u.id, u.name || u.email]))

    const items = pageUnits.map((u) => {
      const fileId = (wrap(u).toObject() as any).file as string
      const file = fileById.get(fileId)
      return {
        id: u.id,
        fileId,
        referenceNumber: file?.referenceNumber ?? null,
        cargoType: file?.cargoType ?? u.cargoType,
        shipmentType: file?.shipmentType ?? null,
        contractorName: file ? (contractorNameById[file.contractorId] ?? null) : null,
        assigneeName: file?.assigneeId ? (assigneeNameById[file.assigneeId] ?? null) : null,
        derivedStatus: null,
        containerNumber: u.containerNumber ?? null,
        commodityDescription: u.commodityDescription ?? null,
        containerType: u.containerType ?? null,
        grossWeight: u.grossWeight ? parseFloat(u.grossWeight) : null,
        weightUnit: u.weightUnit ?? null,
        volume: u.volume ? parseFloat(u.volume) : null,
        volumeUnit: u.volumeUnit ?? null,
        isHazardous: u.isHazardous,
        packageCount: u.packageCount ?? null,
        unitOrigin: u.originLocationId ? (locationNameById[u.originLocationId] ?? null) : null,
        unitDestination: u.destinationLocationId ? (locationNameById[u.destinationLocationId] ?? null) : null,
        legSequence: null, legType: null, legOrigin: null, legDestination: null,
        carrierName: null, etd: null, eta: null, etaUpdateCount: 0, atd: null, ata: null,
        ptd: null, pta: null, truckPlate: null, trailerPlate: null,
        driverFullName: null, driverPhone: null, sealNumber: null,
        unitBl: null, consolidationContainer: null, bookingNumber: null,
        masterBl: null, vesselName: null, voyageNumber: null, notes: null,
      }
    })

    return NextResponse.json({ items, total, page, pageSize: effectivePageSize, totalPages })
  }

  // ─── Legs/All view: one row per FmsFileUnitLeg ────────────────────────────

  // Step 1: resolve eligible leg IDs (two-step to avoid unreliable nested relation filters)
  const legWhere: Record<string, unknown> = { ...scopeFilters }
  if (legType) legWhere.type = legType
  const eligibleLegs = await em.find(FmsFileLeg, legWhere, { fields: ['id'] })
  const eligibleLegIds = eligibleLegs.map((l) => l.id)

  if (eligibleLegIds.length === 0) {
    return NextResponse.json({ items: [], total: 0, page, pageSize: effectivePageSize, totalPages: 0 })
  }

  // Step 2: paginate FmsFileUnitLeg restricted to those legs
  const unitLegWhere: Record<string, unknown> = {
    ...scopeFilters,
    leg: { $in: eligibleLegIds },
  }

  const total = await em.count(FmsFileUnitLeg, unitLegWhere)
  const totalPages = Math.ceil(total / effectivePageSize)

  if (total === 0) {
    return NextResponse.json({ items: [], total, page, pageSize: effectivePageSize, totalPages })
  }

  const unitLegsRaw = await em.find(FmsFileUnitLeg, unitLegWhere, {
    limit: effectivePageSize,
    offset,
    orderBy: { createdAt: 'desc' },
  })

  if (unitLegsRaw.length === 0) {
    return NextResponse.json({ items: [], total, page, pageSize: effectivePageSize, totalPages })
  }

  const legIds = [...new Set(unitLegsRaw.map((ul) => (wrap(ul).toObject() as any).leg as string))]
  const unitIds = [...new Set(unitLegsRaw.map((ul) => (wrap(ul).toObject() as any).unit as string))]

  const legs = await em.find(FmsFileLeg, { id: { $in: legIds } })
  const legById = new Map(legs.map((l) => [l.id, l]))

  const fileIds = [...new Set(legs.map((l) => (wrap(l).toObject() as any).file as string))]
  const files = fileIds.length > 0 ? await em.find(FmsFile, { id: { $in: fileIds } }) : []
  const fileById = new Map(files.map((f) => [f.id, f]))

  const units = await em.find(FmsFileUnit, { id: { $in: unitIds } })
  const unitById = new Map(units.map((u) => [u.id, u]))

  // Load all legs per file for status computation
  const allFileLegs = fileIds.length > 0
    ? await em.find(FmsFileLeg, { file: { $in: fileIds }, deletedAt: null })
    : []
  const legsByFileId = new Map<string, FmsFileLeg[]>()
  for (const leg of allFileLegs) {
    const fId = (wrap(leg).toObject() as any).file as string
    if (!legsByFileId.has(fId)) legsByFileId.set(fId, [])
    legsByFileId.get(fId)!.push(leg)
  }

  const locationIds = [...new Set([
    ...units.flatMap((u) => [u.originLocationId, u.destinationLocationId]),
    ...legs.flatMap((l) => [l.originLocationId, l.destinationLocationId]),
  ].filter((id): id is string => !!id))]
  const locations = locationIds.length > 0
    ? await em.find(FmsLocation, { id: { $in: locationIds } }, { fields: ['id', 'name'] })
    : []
  const locationNameById = Object.fromEntries(locations.map((l) => [l.id, l.name]))

  const carrierIds = [...new Set(legs.map((l) => l.carrierId).filter((id): id is string => !!id))]
  const carriers = carrierIds.length > 0
    ? await em.find(FmsCarrier, { id: { $in: carrierIds } }, { fields: ['id', 'name'] })
    : []
  const carrierNameById = Object.fromEntries(carriers.map((c) => [c.id, c.name]))

  const contractorIds = [...new Set(files.map((f) => f.contractorId).filter(Boolean))]
  const contractors = contractorIds.length > 0
    ? await em.find(Contractor, { id: { $in: contractorIds } }, { fields: ['id', 'name'] })
    : []
  const contractorNameById = Object.fromEntries(contractors.map((c) => [c.id, c.name]))

  const assigneeIds = [...new Set(files.map((f) => f.assigneeId).filter((id): id is string => !!id))]
  const assignees = assigneeIds.length > 0
    ? await findWithDecryption(em, User, { id: { $in: assigneeIds } }, undefined, { tenantId: auth.tenantId ?? null, organizationId: auth.orgId ?? null })
    : []
  const assigneeNameById = Object.fromEntries(assignees.map((u) => [u.id, u.name || u.email]))

  const items = unitLegsRaw.map((ul) => {
    const ulObj = wrap(ul).toObject() as Record<string, unknown>
    const legId = ulObj.leg as string
    const unitId = ulObj.unit as string
    const leg = legById.get(legId)
    const unit = unitById.get(unitId)
    const fileId = leg ? ((wrap(leg).toObject() as any).file as string) : undefined
    const file = fileId ? fileById.get(fileId) : undefined
    const fileLegs = fileId ? (legsByFileId.get(fileId) ?? []) : []

    return {
      id: ul.id,
      fileId: fileId ?? null,
      referenceNumber: file?.referenceNumber ?? null,
      cargoType: file?.cargoType ?? unit?.cargoType ?? null,
      shipmentType: file?.shipmentType ?? null,
      contractorName: file ? (contractorNameById[file.contractorId] ?? null) : null,
      assigneeName: file?.assigneeId ? (assigneeNameById[file.assigneeId] ?? null) : null,
      derivedStatus: computeFileStatus(fileLegs),
      // Unit fields
      containerNumber: unit?.containerNumber ?? null,
      commodityDescription: unit?.commodityDescription ?? null,
      containerType: unit?.containerType ?? null,
      grossWeight: unit?.grossWeight ? parseFloat(unit.grossWeight) : null,
      weightUnit: unit?.weightUnit ?? null,
      volume: unit?.volume ? parseFloat(unit.volume) : null,
      volumeUnit: unit?.volumeUnit ?? null,
      isHazardous: unit?.isHazardous ?? false,
      packageCount: unit?.packageCount ?? null,
      unitOrigin: unit?.originLocationId ? (locationNameById[unit.originLocationId] ?? null) : null,
      unitDestination: unit?.destinationLocationId ? (locationNameById[unit.destinationLocationId] ?? null) : null,
      // Leg fields
      legSequence: leg?.legSequence ?? null,
      legType: leg?.type ?? null,
      legOrigin: leg?.originLocationId ? (locationNameById[leg.originLocationId] ?? null) : null,
      legDestination: leg?.destinationLocationId ? (locationNameById[leg.destinationLocationId] ?? null) : null,
      carrierName: leg?.carrierId ? (carrierNameById[leg.carrierId] ?? null) : null,
      etd: leg?.etdTimestamps?.at(-1)?.value ?? null,
      eta: leg?.etaTimestamps?.at(-1)?.value ?? null,
      etaUpdateCount: leg?.etaTimestamps?.length ?? 0,
      atd: leg?.atdTimestamps?.at(-1)?.value ?? null,
      ata: leg?.ataTimestamps?.at(-1)?.value ?? null,
      ptd: leg?.ptdTimestamps?.at(-1)?.value ?? null,
      pta: leg?.ptaTimestamps?.at(-1)?.value ?? null,
      bookingNumber: leg?.bookingNumber ?? null,
      masterBl: leg?.blNumber ?? null,
      vesselName: leg?.vesselName ?? null,
      voyageNumber: leg?.voyageNumber ?? null,
      // Unit-leg assignment fields
      truckPlate: ul.truckPlate ?? null,
      trailerPlate: ul.trailerPlate ?? null,
      driverFullName: ul.driverFullName ?? null,
      driverPhone: ul.driverPhone ?? null,
      sealNumber: ul.sealNumber ?? null,
      unitBl: ul.blNumber ?? null,
      consolidationContainer: ul.consolidationContainerNumber ?? null,
      notes: ul.notes ?? null,
    }
  })

  return NextResponse.json({ items, total, page, pageSize: effectivePageSize, totalPages })
}

export const openApi = {
  get: {
    operationId: 'listFmsTransport',
    summary: 'List transport unit-leg rows',
    tags: ['FMS Transport'],
    responses: { 200: { description: 'Paginated transport rows' } },
  },
}
