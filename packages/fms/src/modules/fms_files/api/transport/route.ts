/**
 * FMS Files Transport - Data API
 *
 * Returns paginated transport rows:
 * - Default / legType filter: 1 row per FmsFileUnitLeg assignment
 * - view=units: 1 row per FmsFileUnit
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from 'kysely'
import { wrap } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { FmsFile, FmsFileUnit, FmsFileLeg, FmsFileUnitLeg } from '../../data/entities'
import { deriveUnitLegStatus, UNIT_LEG_STATUSES } from '../../data/types'
import type { UnitLegStatus, UnitLegTimestamps } from '../../data/types'
import { FmsLocation } from '../../../fms_locations/data/entities'
import { FmsCarrier } from '../../../fms_products/data/entities'
import { Contractor } from '../../../contractors/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { buildScopeFilters } from '../../lib/scope-filters'

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
  status: z.string().optional(),
  filters: z.string().optional(),
  view: z.enum(['units', 'legs']).optional(),
})

function resolveEffectiveTimestamps(ul: FmsFileUnitLeg, leg: FmsFileLeg | undefined): UnitLegTimestamps {
  if (leg?.type === 'TRUCK') {
    return {
      ptd: ul.ptd ?? null, etd: ul.etd ?? null, atd: ul.atd ?? null,
      pta: ul.pta ?? null, eta: ul.eta ?? null, ata: ul.ata ?? null,
    }
  }
  return {
    ptd: leg?.ptdTimestamps?.at(-1)?.value ?? null,
    etd: leg?.etdTimestamps?.at(-1)?.value ?? null,
    atd: leg?.atdTimestamps?.at(-1)?.value ?? null,
    pta: leg?.ptaTimestamps?.at(-1)?.value ?? null,
    eta: leg?.etaTimestamps?.at(-1)?.value ?? null,
    ata: leg?.ataTimestamps?.at(-1)?.value ?? null,
  }
}

/**
 * Build a status filter set from both the `status` query param and any
 * `derivedStatus` entries inside the DynamicTable `filters` JSON param.
 */
function parseStatusFilter(statusParam: string | undefined, filtersParam: string | undefined): Set<UnitLegStatus> | null {
  const values: UnitLegStatus[] = []

  // 1. Direct `status` param (comma-separated)
  if (statusParam) {
    for (const v of statusParam.split(',')) {
      if ((UNIT_LEG_STATUSES as readonly string[]).includes(v)) values.push(v as UnitLegStatus)
    }
  }

  // 2. DynamicTable `filters` JSON — look for derivedStatus filter rows
  if (filtersParam) {
    try {
      const rows = JSON.parse(filtersParam) as Array<{ field?: string; operator?: string; value?: unknown; values?: unknown }>
      for (const row of rows) {
        if (row.field !== 'derivedStatus') continue
        const raw = row.values ?? row.value
        const vals = Array.isArray(raw) ? raw : raw != null ? [raw] : []
        for (const v of vals) {
          if (typeof v === 'string' && (UNIT_LEG_STATUSES as readonly string[]).includes(v)) {
            values.push(v as UnitLegStatus)
          }
        }
      }
    } catch { /* malformed JSON — ignore */ }
  }

  return values.length > 0 ? new Set(values) : null
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })

  const { page, limit, pageSize, legType, status, filters: filtersParam, view } = parsed.data
  const effectivePageSize = limit ?? pageSize ?? 100
  const statusFilter = parseStatusFilter(status, filtersParam)

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = { deletedAt: null, ...buildScopeFilters(auth, scope) }

  // ─── Units view: one row per FmsFileUnit ──────────────────────────────────
  if (view === 'units') {
    const total = await em.count(FmsFileUnit, scopeFilters)
    const totalPages = Math.ceil(total / effectivePageSize)

    // Compute maxLegs across ALL units (not just the current page) so the
    // column structure is stable regardless of which page or limit is fetched.
    const db = em.getKysely<any>()
    const orgIds = scopeFilters.organizationId?.$in
    const globalMaxLegsRow = await db
      .selectFrom(
        (eb) => {
          let sub = eb
            .selectFrom('fms_file_unit_legs as ul')
            .innerJoin('fms_file_units as u', 'u.id', 'ul.unit_id')
            .where('ul.deleted_at', 'is', null)
            .where('u.deleted_at', 'is', null)
          if (scopeFilters.tenantId) sub = sub.where('u.tenant_id', '=', scopeFilters.tenantId)
          if (orgIds && orgIds.length > 0) sub = sub.where('u.organization_id', 'in', orgIds)
          return sub
            .groupBy('ul.unit_id')
            .select((b) => b.fn.countAll().as('leg_count'))
            .as('counts')
        }
      )
      .select(sql<number>`coalesce(max(leg_count), 0)`.as('max_legs'))
      .executeTakeFirst()
    const globalMaxLegs = globalMaxLegsRow?.max_legs ? Number(globalMaxLegsRow.max_legs) : 0

    if (total === 0) {
      return NextResponse.json({ items: [], total, page, pageSize: effectivePageSize, totalPages, meta: { maxLegs: globalMaxLegs } })
    }

    const offset = ((page ?? 1) - 1) * effectivePageSize
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

    // Collect all location IDs (unit + leg + dropoff) in one batch
    const allLocationIds = [...new Set([
      ...pageUnits.flatMap((u) => [u.originLocationId, u.destinationLocationId]).filter((id): id is string => !!id),
      ...legsForUnits.flatMap((l) => [l.originLocationId, l.destinationLocationId]).filter((id): id is string => !!id),
      ...unitLegs.map((ul) => ul.dropoffLocationId).filter((id): id is string => !!id),
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
    const unitLegsByUnitId = new Map<string, Array<{ legSequence: number; leg: FmsFileLeg; unitLeg: FmsFileUnitLeg }>>()
    for (const ul of unitLegs) {
      const ulObj = wrap(ul).toObject() as Record<string, unknown>
      const unitId = ulObj.unit as string
      const legId = ulObj.leg as string
      const leg = legForUnitsById.get(legId)
      if (!leg) continue
      const existing = unitLegsByUnitId.get(unitId) ?? []
      existing.push({ legSequence: leg.legSequence ?? 0, leg, unitLeg: ul })
      unitLegsByUnitId.set(unitId, existing)
    }
    for (const [, entries] of unitLegsByUnitId) {
      entries.sort((a, b) => a.legSequence - b.legSequence)
    }
    const items = pageUnits.map((u) => {
      const fileId = (wrap(u).toObject() as any).file as string
      const file = fileById.get(fileId)
      const legEntries = unitLegsByUnitId.get(u.id) ?? []

      const legData: Record<string, unknown> = {}
      for (let i = 0; i < globalMaxLegs; i++) {
        const entry = legEntries[i]
        const leg = entry?.leg
        const ul = entry?.unitLeg
        const n = i + 1
        // Leg & unit-leg IDs (needed for save routing)
        legData[`legId_${n}`] = leg?.id ?? null
        legData[`unitLegId_${n}`] = ul?.id ?? null
        // Leg identity
        legData[`legType_${n}`] = leg?.type ?? null
        legData[`legOrigin_${n}`] = leg?.originLocationId ? (locationNameById[leg.originLocationId] ?? null) : null
        legData[`legDestination_${n}`] = leg?.destinationLocationId ? (locationNameById[leg.destinationLocationId] ?? null) : null
        legData[`carrierName_${n}`] = leg?.carrierId ? (carrierNameByIdForUnits[leg.carrierId] ?? null) : null
        // Timestamps (SCD arrays for non-truck, simple values for truck via unit-leg)
        const isTruck = leg?.type === 'TRUCK'
        legData[`ptd_${n}`] = isTruck ? (ul?.ptd ?? null) : (leg?.ptdTimestamps?.at(-1)?.value ?? null)
        legData[`etd_${n}`] = isTruck ? (ul?.etd ?? null) : (leg?.etdTimestamps?.at(-1)?.value ?? null)
        legData[`atd_${n}`] = isTruck ? (ul?.atd ?? null) : (leg?.atdTimestamps?.at(-1)?.value ?? null)
        legData[`pta_${n}`] = isTruck ? (ul?.pta ?? null) : (leg?.ptaTimestamps?.at(-1)?.value ?? null)
        legData[`eta_${n}`] = isTruck ? (ul?.eta ?? null) : (leg?.etaTimestamps?.at(-1)?.value ?? null)
        legData[`ata_${n}`] = isTruck ? (ul?.ata ?? null) : (leg?.ataTimestamps?.at(-1)?.value ?? null)
        // Timestamp arrays for tooltip history (keyed as `ptd_1Timestamps` so the renderer can derive them from col.data)
        legData[`ptd_${n}Timestamps`] = !isTruck ? (leg?.ptdTimestamps ?? null) : null
        legData[`etd_${n}Timestamps`] = !isTruck ? (leg?.etdTimestamps ?? null) : null
        legData[`atd_${n}Timestamps`] = !isTruck ? (leg?.atdTimestamps ?? null) : null
        legData[`pta_${n}Timestamps`] = !isTruck ? (leg?.ptaTimestamps ?? null) : null
        legData[`eta_${n}Timestamps`] = !isTruck ? (leg?.etaTimestamps ?? null) : null
        legData[`ata_${n}Timestamps`] = !isTruck ? (leg?.ataTimestamps ?? null) : null
        // Booking / vessel (leg-owned)
        legData[`bookingNumber_${n}`] = leg?.bookingNumber ?? null
        legData[`masterBl_${n}`] = leg?.blNumber ?? null
        legData[`vesselName_${n}`] = leg?.vesselName ?? null
        legData[`voyageNumber_${n}`] = leg?.voyageNumber ?? null
        legData[`flightNumber_${n}`] = leg?.flightNumber ?? null
        // Ship cutoffs & free time (leg-owned)
        legData[`gateInCutoff_${n}`] = leg?.gateInCutoff ?? null
        legData[`documentationCutoff_${n}`] = leg?.documentationCutoff ?? null
        legData[`vgmCutoff_${n}`] = leg?.vgmCutoff ?? null
        legData[`dangerousGoodsCutoff_${n}`] = leg?.dangerousGoodsCutoff ?? null
        legData[`demFreeTime_${n}`] = leg?.demFreeTime ?? null
        legData[`detFreeTime_${n}`] = leg?.detFreeTime ?? null
        // Unit-leg assignment fields
        legData[`truckPlate_${n}`] = ul?.truckPlate ?? null
        legData[`trailerPlate_${n}`] = ul?.trailerPlate ?? null
        legData[`driverFullName_${n}`] = ul?.driverFullName ?? null
        legData[`sealNumber_${n}`] = ul?.sealNumber ?? null
        legData[`unitBl_${n}`] = ul?.blNumber ?? null
        legData[`dropoffLocationName_${n}`] = ul?.dropoffLocationId ? (locationNameById[ul.dropoffLocationId] ?? null) : null
        legData[`dropoffTime_${n}`] = ul?.dropoffTime ?? null
        legData[`notes_${n}`] = ul?.notes ?? null
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

    return NextResponse.json({ items, total, page, pageSize: effectivePageSize, totalPages, meta: { maxLegs: globalMaxLegs } })
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

  // Step 2: fetch unit-legs restricted to those legs
  // When status filter is active we must fetch all rows, compute status, then paginate.
  const unitLegWhere: Record<string, unknown> = {
    ...scopeFilters,
    leg: { $in: eligibleLegIds },
  }

  const unitLegsRaw = await em.find(FmsFileUnitLeg, unitLegWhere, {
    ...(!statusFilter ? { limit: effectivePageSize, offset: (page - 1) * effectivePageSize } : {}),
    orderBy: { unit: { sortOrder: 'asc', id: 'asc' }, leg: { legSequence: 'asc' } },
  })

  if (unitLegsRaw.length === 0) {
    return NextResponse.json({ items: [], total: 0, page, pageSize: effectivePageSize, totalPages: 0 })
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

  const locationIds = [...new Set([
    ...units.flatMap((u) => [u.originLocationId, u.destinationLocationId]),
    ...legs.flatMap((l) => [l.originLocationId, l.destinationLocationId]),
    ...unitLegsRaw.map((ul) => ul.dropoffLocationId),
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

  // Fetch all sibling legs from the same files for next-leg D&D lookups
  const allFileLegs = fileIds.length > 0
    ? await em.find(FmsFileLeg, { file: { $in: fileIds }, deletedAt: null })
    : legs
  const fileLegsBySeq = new Map<string, Map<number, FmsFileLeg>>()
  for (const leg of allFileLegs) {
    const fid = (wrap(leg).toObject() as any).file as string
    if (!fileLegsBySeq.has(fid)) fileLegsBySeq.set(fid, new Map())
    fileLegsBySeq.get(fid)!.set(leg.legSequence, leg)
  }
  // Fetch unit-leg assignments for next legs (may not be in unitLegsRaw if filtered by legType)
  const nextLegIds = [...new Set(
    legs
      .filter((l) => l.type === 'SHIP' || l.type === 'RAIL')
      .map((l) => {
        const fid = (wrap(l).toObject() as any).file as string
        return fileLegsBySeq.get(fid)?.get(l.legSequence + 1)?.id
      })
      .filter((id): id is string => !!id && !legIds.includes(id))
  )]
  const nextLegUnitLegs = nextLegIds.length > 0
    ? await em.find(FmsFileUnitLeg, { leg: { $in: nextLegIds }, deletedAt: null })
    : []
  // Pre-index: for each (unitId, legId) → unit-leg assignment
  const ulByUnitLeg = new Map<string, FmsFileUnitLeg>()
  for (const ul of unitLegsRaw) {
    const obj = wrap(ul).toObject() as Record<string, unknown>
    ulByUnitLeg.set(`${obj.unit}:${obj.leg}`, ul)
  }
  for (const ul of nextLegUnitLegs) {
    const obj = wrap(ul).toObject() as Record<string, unknown>
    ulByUnitLeg.set(`${obj.unit}:${obj.leg}`, ul)
  }

  function buildRow(ul: FmsFileUnitLeg) {
    const ulObj = wrap(ul).toObject() as Record<string, unknown>
    const legId = ulObj.leg as string
    const unitId = ulObj.unit as string
    const leg = legById.get(legId)
    const unit = unitById.get(unitId)
    const fileId = leg ? ((wrap(leg).toObject() as any).file as string) : undefined
    const file = fileId ? fileById.get(fileId) : undefined

    const ts = resolveEffectiveTimestamps(ul, leg)

    // Resolve next leg's pickup/delivery for D&D display
    let demPickupAtd: string | null = null
    let detDeliveryAta: string | null = null
    if (leg && (leg.type === 'SHIP' || leg.type === 'RAIL') && fileId) {
      const nextLeg = fileLegsBySeq.get(fileId)?.get(leg.legSequence + 1)
      if (nextLeg) {
        if (nextLeg.type === 'TRUCK') {
          const nextUl = ulByUnitLeg.get(`${unitId}:${nextLeg.id}`)
          demPickupAtd = nextUl?.atd ?? null
          detDeliveryAta = nextUl?.dropoffTime ?? null
        } else {
          demPickupAtd = nextLeg.atdTimestamps?.at(-1)?.value ?? null
          detDeliveryAta = nextLeg.ataTimestamps?.at(-1)?.value ?? null
        }
      }
    }
    const rowStatus = deriveUnitLegStatus(ts, leg?.type ?? '')

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
      derivedStatus: rowStatus,
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
      // Timestamps (already resolved per TRUCK vs SHIP/RAIL/AIR)
      ptd: ts.ptd, etd: ts.etd, atd: ts.atd,
      pta: ts.pta, eta: ts.eta, ata: ts.ata,
      etaUpdateCount: leg?.etaTimestamps?.length ?? 0,
      // Full SCD arrays — included for the timestamp history tooltip (non-Truck only)
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
      gateInCutoff: leg?.gateInCutoff?.toISOString() ?? null,
      documentationCutoff: leg?.documentationCutoff?.toISOString() ?? null,
      vgmCutoff: leg?.vgmCutoff?.toISOString() ?? null,
      dangerousGoodsCutoff: leg?.dangerousGoodsCutoff?.toISOString() ?? null,
      demFreeTime: leg?.demFreeTime ?? null,
      detFreeTime: leg?.detFreeTime ?? null,
      demPickupAtd,
      detDeliveryAta,
      // Leg-specific fields
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
      dropoffLocationId: ul.dropoffLocationId ?? null,
      dropoffLocationName: ul.dropoffLocationId ? (locationNameById[ul.dropoffLocationId] ?? null) : null,
      dropoffTime: ul.dropoffTime ?? null,
      notes: ul.notes ?? null,
    }
  }

  if (statusFilter) {
    // Post-query filter: compute status for all rows, filter, then paginate
    const allRows = unitLegsRaw.map(buildRow)
    const filtered = allRows.filter((r) => statusFilter.has(r.derivedStatus as UnitLegStatus))
    const total = filtered.length
    const totalPages = Math.ceil(total / effectivePageSize)
    const offset = (page - 1) * effectivePageSize
    const items = filtered.slice(offset, offset + effectivePageSize)
    return NextResponse.json({ items, total, page, pageSize: effectivePageSize, totalPages })
  }

  // No status filter — already paginated at DB level
  const total = await em.count(FmsFileUnitLeg, unitLegWhere)
  const totalPages = Math.ceil(total / effectivePageSize)
  const items = unitLegsRaw.map(buildRow)

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
