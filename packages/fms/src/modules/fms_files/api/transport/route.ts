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

    const unitIds = pageUnits.map((u) => u.id)
    const fileIds = [...new Set(pageUnits.map((u) => (wrap(u).toObject() as any).file as string))]
    const files = fileIds.length > 0 ? await em.find(FmsFile, { id: { $in: fileIds } }) : []
    const fileById = new Map(files.map((f) => [f.id, f]))

    // Load unit-legs and their legs for the current page
    const unitLegs = unitIds.length > 0
      ? await em.find(FmsFileUnitLeg, { unit: { $in: unitIds }, ...scopeFilters })
      : []
    const legIdsForUnits = [...new Set(unitLegs.map((ul) => (wrap(ul).toObject() as any).leg as string))]
    const legsForUnits = legIdsForUnits.length > 0 ? await em.find(FmsFileLeg, { id: { $in: legIdsForUnits } }) : []
    const legForUnitsById = new Map(legsForUnits.map((l) => [l.id, l]))

    // Collect all location IDs (unit + leg) in one batch
    const allLocationIds = [...new Set([
      ...pageUnits.flatMap((u) => [u.originLocationId, u.destinationLocationId]).filter((id): id is string => !!id),
      ...legsForUnits.flatMap((l) => [l.originLocationId, l.destinationLocationId]).filter((id): id is string => !!id),
    ])]
    const locations = allLocationIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: allLocationIds } }, { fields: ['id', 'name'] })
      : []
    const locationNameById = Object.fromEntries(locations.map((l) => [l.id, l.name]))

    const carrierIdsForUnits = [...new Set(legsForUnits.map((l) => l.carrierId).filter((id): id is string => !!id))]
    const carriersForUnits = carrierIdsForUnits.length > 0
      ? await em.find(FmsCarrier, { id: { $in: carrierIdsForUnits } }, { fields: ['id', 'name'] })
      : []
    const carrierNameByIdForUnits = Object.fromEntries(carriersForUnits.map((c) => [c.id, c.name]))

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

    // Group unit-legs by unit, sorted by leg sequence
    const unitLegsByUnitId = new Map<string, Array<{ legSequence: number; leg: FmsFileLeg }>>()
    for (const ul of unitLegs) {
      const ulObj = wrap(ul).toObject() as Record<string, unknown>
      const unitId = ulObj.unit as string
      const legId = ulObj.leg as string
      const leg = legForUnitsById.get(legId)
      if (!leg) continue
      const existing = unitLegsByUnitId.get(unitId) ?? []
      existing.push({ legSequence: leg.legSequence ?? 0, leg })
      unitLegsByUnitId.set(unitId, existing)
    }
    for (const [, entries] of unitLegsByUnitId) {
      entries.sort((a, b) => a.legSequence - b.legSequence)
    }
    const maxLegs = unitLegsByUnitId.size > 0
      ? Math.max(...Array.from(unitLegsByUnitId.values()).map((e) => e.length))
      : 0

    const items = pageUnits.map((u) => {
      const fileId = (wrap(u).toObject() as any).file as string
      const file = fileById.get(fileId)
      const legEntries = unitLegsByUnitId.get(u.id) ?? []

      const legData: Record<string, unknown> = {}
      for (let i = 0; i < maxLegs; i++) {
        const entry = legEntries[i]
        const n = i + 1
        legData[`legType_${n}`] = entry?.leg.type ?? null
        legData[`legOrigin_${n}`] = entry?.leg.originLocationId ? (locationNameById[entry.leg.originLocationId] ?? null) : null
        legData[`legDestination_${n}`] = entry?.leg.destinationLocationId ? (locationNameById[entry.leg.destinationLocationId] ?? null) : null
        legData[`carrierName_${n}`] = entry?.leg.carrierId ? (carrierNameByIdForUnits[entry.leg.carrierId] ?? null) : null
        legData[`etd_${n}`] = entry?.leg.etdTimestamps?.at(-1)?.value ?? null
        legData[`eta_${n}`] = entry?.leg.etaTimestamps?.at(-1)?.value ?? null
        legData[`atd_${n}`] = entry?.leg.atdTimestamps?.at(-1)?.value ?? null
        legData[`ata_${n}`] = entry?.leg.ataTimestamps?.at(-1)?.value ?? null
      }

      return {
        id: u.id,
        unitId: u.id,
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
        ...legData,
      }
    })

    return NextResponse.json({ items, total, page, pageSize: effectivePageSize, totalPages, meta: { maxLegs } })
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
    orderBy: { unit: { sortOrder: 'asc', id: 'asc' }, leg: { legSequence: 'asc' } },
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
      unitId: unitId ?? null,
      legId: legId ?? null,
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
      trackedShipmentId: unit?.trackedShipmentId ?? null,
      // Leg fields
      legSequence: leg?.legSequence ?? null,
      legType: leg?.type ?? null,
      legOrigin: leg?.originLocationId ? (locationNameById[leg.originLocationId] ?? null) : null,
      legDestination: leg?.destinationLocationId ? (locationNameById[leg.destinationLocationId] ?? null) : null,
      carrierName: leg?.carrierId ? (carrierNameById[leg.carrierId] ?? null) : null,
      // Truck legs use per-unit-leg timestamps (each truck departs/arrives independently).
      // Ship/Rail/Air legs share one departure/arrival for all units on the leg.
      ptd: leg?.type === 'TRUCK' ? (ul.ptd ?? null) : (leg?.ptdTimestamps?.at(-1)?.value ?? null),
      etd: leg?.type === 'TRUCK' ? (ul.etd ?? null) : (leg?.etdTimestamps?.at(-1)?.value ?? null),
      atd: leg?.type === 'TRUCK' ? (ul.atd ?? null) : (leg?.atdTimestamps?.at(-1)?.value ?? null),
      pta: leg?.type === 'TRUCK' ? (ul.pta ?? null) : (leg?.ptaTimestamps?.at(-1)?.value ?? null),
      eta: leg?.type === 'TRUCK' ? (ul.eta ?? null) : (leg?.etaTimestamps?.at(-1)?.value ?? null),
      etaUpdateCount: leg?.etaTimestamps?.length ?? 0,
      ata: leg?.type === 'TRUCK' ? (ul.ata ?? null) : (leg?.ataTimestamps?.at(-1)?.value ?? null),
      // Full SCD arrays — included for the timestamp history tooltip (non-Truck only; Truck uses simple text fields)
      ptdTimestamps: leg?.type !== 'TRUCK' ? (leg?.ptdTimestamps ?? null) : null,
      etdTimestamps: leg?.type !== 'TRUCK' ? (leg?.etdTimestamps ?? null) : null,
      atdTimestamps: leg?.type !== 'TRUCK' ? (leg?.atdTimestamps ?? null) : null,
      ptaTimestamps: leg?.type !== 'TRUCK' ? (leg?.ptaTimestamps ?? null) : null,
      etaTimestamps: leg?.type !== 'TRUCK' ? (leg?.etaTimestamps ?? null) : null,
      ataTimestamps: leg?.type !== 'TRUCK' ? (leg?.ataTimestamps ?? null) : null,
      bookingNumber: leg?.bookingNumber ?? null,
      masterBl: leg?.blNumber ?? null,
      vesselName: leg?.vesselName ?? null,
      voyageNumber: leg?.voyageNumber ?? null,
      // Unit-leg assignment fields
      flightNumber: leg?.flightNumber ?? null,
      aircraftType: leg?.aircraftType ?? null,
      // Unit-leg assignment fields
      truckPlate: ul.truckPlate ?? null,
      trailerPlate: ul.trailerPlate ?? null,
      driverFullName: ul.driverFullName ?? null,
      driverIdNumber: ul.driverIdNumber ?? null,
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
