/**
 * Shipments Module - Single Transport Unit API
 *
 * GET/PUT operations for individual transport units in the aggregate shipments view.
 * Routes updates to the correct underlying entity (FmsSeaContainer, FmsRoadUnit, FmsAirUnit).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsSeaContainer, FmsRoadUnit, FmsAirUnit, FmsProject, FmsProjectLeg } from '../../../fms_projects/data/entities'
import {
  fmsSeaContainerUpdateSchema,
  fmsRoadUnitUpdateSchema,
  fmsAirUnitUpdateSchema,
} from '../../../fms_projects/data/validators'
import type { ShipmentRow } from '../route'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
  PUT: { requireAuth: true, requireFeatures: ['shipments.shipments.edit'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

// Update schema for shipment row (maps to underlying entity fields)
const shipmentUpdateSchema = z.object({
  transportType: z.enum(['sea', 'air', 'road']),

  // Common fields
  date: z.coerce.date().optional().nullable(),
  route: z.string().optional().nullable(),
  port: z.string().optional().nullable(),
  bookingNumber: z.string().optional().nullable(),
  carrierName: z.string().optional().nullable(),
  rate: z.coerce.number().optional().nullable(),
  rateCurrency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  weight: z.coerce.number().optional().nullable(),
  goods: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  additional: z.string().optional().nullable(),

  // Sea-specific
  containerType: z.string().optional().nullable(),
  containerNumber: z.string().optional().nullable(),
  shippingLine: z.string().optional().nullable(),
  vgmStatus: z.enum(['pending', 'submitted', 'verified']).optional().nullable(),
  vgmWeight: z.coerce.number().optional().nullable(),
  customsClearance: z.string().optional().nullable(),
  customsClearanceStatus: z.enum(['pending', 'in_progress', 'cleared']).optional().nullable(),
  cutOff: z.coerce.date().optional().nullable(),
  pinCode: z.string().optional().nullable(),
  deliveryTime: z.string().optional().nullable(),
  dropOffLocation: z.string().optional().nullable(),

  // Road-specific
  vehicleType: z.string().optional().nullable(),
  loadingAddress: z.string().optional().nullable(),
  unloadingAddress: z.string().optional().nullable(),
  unloadingNotes: z.string().optional().nullable(),
  weighingStatus: z.string().optional().nullable(),
  customsStatus: z.string().optional().nullable(),
  contactInfo: z.string().optional().nullable(),
}).passthrough()

/**
 * Build scope filters for tenant/org isolation
 */
function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null; actorTenantId?: string | null; actorOrgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: string } {
  const result: { tenantId?: string; organizationId?: string } = {}

  const tenantId = auth.actorTenantId || auth.tenantId
  if (typeof tenantId === 'string') {
    result.tenantId = tenantId
  }

  const orgId = scope?.selectedId ?? auth.actorOrgId ?? auth.orgId
  if (typeof orgId === 'string') {
    result.organizationId = orgId
  }

  return result
}

/**
 * Try to find a transport unit by ID across all transport types
 */
async function findTransportUnit(
  em: EntityManager,
  id: string,
  scopeFilters: { tenantId?: string; organizationId?: string }
): Promise<{ entity: FmsSeaContainer | FmsRoadUnit | FmsAirUnit; type: 'sea' | 'road' | 'air' } | null> {
  // Build base filters
  const baseFilters: Record<string, unknown> = { id, deletedAt: null }
  if (scopeFilters.tenantId) baseFilters.tenantId = scopeFilters.tenantId
  if (scopeFilters.organizationId) baseFilters.organizationId = scopeFilters.organizationId

  // Try sea container first (most common)
  const seaContainer = await em.findOne(FmsSeaContainer, baseFilters, {
    populate: ['project', 'project.client'],
  })
  if (seaContainer) return { entity: seaContainer, type: 'sea' }

  // Try road unit
  const roadUnit = await em.findOne(FmsRoadUnit, baseFilters, {
    populate: ['project', 'project.client'],
  })
  if (roadUnit) return { entity: roadUnit, type: 'road' }

  // Try air unit
  const airUnit = await em.findOne(FmsAirUnit, baseFilters, {
    populate: ['project', 'project.client'],
  })
  if (airUnit) return { entity: airUnit, type: 'air' }

  return null
}

/**
 * Map a transport unit to a unified ShipmentRow
 */
async function mapToShipmentRow(
  em: EntityManager,
  entity: FmsSeaContainer | FmsRoadUnit | FmsAirUnit,
  type: 'sea' | 'road' | 'air'
): Promise<ShipmentRow> {
  const project = entity.project as FmsProject

  // Get first leg for carrier info (sea/air only)
  let leg: FmsProjectLeg | null = null
  if (type === 'sea' || type === 'air') {
    leg = await em.findOne(FmsProjectLeg, {
      project: project.id,
      legSequence: 1,
      deletedAt: null,
    })
  }

  // Get assigned user
  let forwarder: string | null = null
  let forwarderId: string | null = null
  if ((project as any).assignedToId) {
    forwarderId = (project as any).assignedToId
    const user = await em.findOne('User' as any, { id: forwarderId })
    if (user) {
      forwarder = (user as any).displayName ?? (user as any).email ?? null
    }
  }

  if (type === 'sea') {
    const c = entity as FmsSeaContainer
    return {
      id: c.id,
      transportType: 'sea',
      projectId: project.id,
      projectNumber: project.projectNumber,
      shipmentType: project.shipmentType,
      date: c.etd?.toISOString() ?? null,
      route: project.direction === 'export' ? project.originAddress ?? null : project.destinationAddress ?? null,
      port: c.originPort ?? null,
      bookingNumber: c.bookingNumber ?? null,
      carrierName: leg?.carrierName ?? null,
      rate: leg?.estimatedCost ?? null,
      rateCurrency: project.currencyCode ?? 'PLN',
      notes: c.notes ?? null,
      forwarder,
      forwarderId,
      weight: project.totalGrossWeight ?? null,
      goods: project.commodityDescription ?? null,
      destination: c.destinationPort ?? null,
      additional: null,
      containerType: c.containerType ?? null,
      containerNumber: c.containerNumber ?? null,
      shippingLine: c.vesselName ?? null,
      vgmStatus: c.vgmStatus ?? null,
      vgmWeight: c.vgmWeight ?? null,
      customsClearance: c.customsClearanceLocation ?? null,
      customsClearanceStatus: c.customsClearanceStatus ?? null,
      cutOff: c.cutOffDate?.toISOString() ?? null,
      pinCode: c.pinCode ?? null,
      deliveryTime: c.deliveryTime ?? null,
      dropOffLocation: c.dropOffLocation ?? null,
      vehicleType: null,
      loadingAddress: null,
      unloadingAddress: null,
      unloadingNotes: null,
      weighingStatus: null,
      customsStatus: null,
      contactInfo: null,
      mawbNumber: null,
      hawbNumber: null,
      flightNumber: null,
      direction: project.direction ?? null,
      attachmentNumber: null,
    }
  }

  if (type === 'road') {
    const r = entity as FmsRoadUnit
    return {
      id: r.id,
      transportType: 'road',
      projectId: project.id,
      projectNumber: project.projectNumber,
      shipmentType: project.shipmentType,
      date: r.pickupDate?.toISOString() ?? null,
      route: `${r.originAddress ?? ''} → ${r.destinationAddress ?? ''}`.trim() || null,
      port: null,
      bookingNumber: r.bookingNumber ?? null,
      carrierName: r.carrierName ?? null,
      rate: r.rate ?? null,
      rateCurrency: r.rateCurrency ?? 'PLN',
      notes: r.notes ?? null,
      forwarder,
      forwarderId,
      weight: r.grossWeight ?? null,
      goods: project.commodityDescription ?? null,
      destination: r.destinationAddress ?? null,
      additional: null,
      containerType: null,
      containerNumber: null,
      shippingLine: null,
      vgmStatus: null,
      vgmWeight: null,
      customsClearance: null,
      customsClearanceStatus: null,
      cutOff: null,
      pinCode: null,
      deliveryTime: null,
      dropOffLocation: null,
      vehicleType: r.vehicleType ?? null,
      loadingAddress: r.originAddress ?? null,
      unloadingAddress: r.destinationAddress ?? null,
      unloadingNotes: r.unloadingNotes ?? null,
      weighingStatus: r.weighingStatus ?? null,
      customsStatus: r.customsStatus ?? null,
      contactInfo: r.driverName ? `${r.driverName} ${r.driverPhone ?? ''}`.trim() : null,
      mawbNumber: null,
      hawbNumber: null,
      flightNumber: null,
      direction: project.direction ?? null,
      attachmentNumber: null,
    }
  }

  // Air unit
  const a = entity as FmsAirUnit
  return {
    id: a.id,
    transportType: 'air',
    projectId: project.id,
    projectNumber: project.projectNumber,
    shipmentType: project.shipmentType,
    date: a.etd?.toISOString() ?? null,
    route: project.originAddress ?? null,
    port: a.originAirport ?? null,
    bookingNumber: a.bookingNumber ?? null,
    carrierName: a.carrierCode ?? null,
    rate: leg?.estimatedCost ?? null,
    rateCurrency: project.currencyCode ?? 'PLN',
    notes: a.notes ?? null,
    forwarder,
    forwarderId,
    weight: a.grossWeight ?? null,
    goods: a.commodity ?? null,
    destination: a.destinationAirport ?? null,
    additional: a.description ?? null,
    containerType: null,
    containerNumber: null,
    shippingLine: null,
    vgmStatus: null,
    vgmWeight: null,
    customsClearance: a.customsClearanceLocation ?? null,
    customsClearanceStatus: a.customsClearanceStatus ?? null,
    cutOff: null,
    pinCode: null,
    deliveryTime: null,
    dropOffLocation: null,
    vehicleType: null,
    loadingAddress: null,
    unloadingAddress: null,
    unloadingNotes: null,
    weighingStatus: null,
    customsStatus: null,
    contactInfo: null,
    mawbNumber: a.mawbNumber ?? null,
    hawbNumber: a.hawbNumber ?? null,
    flightNumber: a.flightNumber ?? null,
    direction: project.direction ?? null,
    attachmentNumber: null,
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const parse = paramsSchema.safeParse({ id: params.id })
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const found = await findTransportUnit(em, parse.data.id, scopeFilters)
  if (!found) {
    return NextResponse.json({ error: 'Transport unit not found' }, { status: 404 })
  }

  const row = await mapToShipmentRow(em, found.entity, found.type)
  return NextResponse.json(row)
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const parse = paramsSchema.safeParse({ id: params.id })
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const body = await request.json()
  const validation = shipmentUpdateSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const found = await findTransportUnit(em, parse.data.id, scopeFilters)
  if (!found) {
    return NextResponse.json({ error: 'Transport unit not found' }, { status: 404 })
  }

  const data = validation.data

  // Update the entity based on transport type
  if (found.type === 'sea') {
    const c = found.entity as FmsSeaContainer

    // Map shipment row fields to entity fields
    if (data.date !== undefined) c.etd = data.date
    if (data.port !== undefined) c.originPort = data.port
    if (data.bookingNumber !== undefined) c.bookingNumber = data.bookingNumber
    if (data.notes !== undefined) c.notes = data.notes
    if (data.destination !== undefined) c.destinationPort = data.destination
    if (data.containerType !== undefined) c.containerType = data.containerType as any
    if (data.containerNumber !== undefined) c.containerNumber = data.containerNumber
    if (data.shippingLine !== undefined) c.vesselName = data.shippingLine
    if (data.vgmStatus !== undefined) c.vgmStatus = data.vgmStatus
    if (data.vgmWeight !== undefined) c.vgmWeight = data.vgmWeight?.toString() ?? null
    if (data.customsClearance !== undefined) c.customsClearanceLocation = data.customsClearance
    if (data.customsClearanceStatus !== undefined) c.customsClearanceStatus = data.customsClearanceStatus
    if (data.cutOff !== undefined) c.cutOffDate = data.cutOff
    if (data.pinCode !== undefined) c.pinCode = data.pinCode
    if (data.deliveryTime !== undefined) c.deliveryTime = data.deliveryTime
    if (data.dropOffLocation !== undefined) c.dropOffLocation = data.dropOffLocation

    // Update carrier info on leg if changed
    if (data.carrierName !== undefined || data.rate !== undefined) {
      const leg = await em.findOne(FmsProjectLeg, {
        project: c.project.id,
        legSequence: 1,
        deletedAt: null,
      })
      if (leg) {
        if (data.carrierName !== undefined) leg.carrierName = data.carrierName
        if (data.rate !== undefined) leg.estimatedCost = data.rate?.toString() ?? null
      }
    }
  } else if (found.type === 'road') {
    const r = found.entity as FmsRoadUnit

    if (data.date !== undefined) r.pickupDate = data.date
    if (data.bookingNumber !== undefined) r.bookingNumber = data.bookingNumber
    if (data.carrierName !== undefined) r.carrierName = data.carrierName
    if (data.rate !== undefined) r.rate = data.rate?.toString() ?? null
    if (data.rateCurrency !== undefined) r.rateCurrency = data.rateCurrency ?? 'PLN'
    if (data.notes !== undefined) r.notes = data.notes
    if (data.weight !== undefined) r.grossWeight = data.weight?.toString() ?? null
    if (data.loadingAddress !== undefined) r.originAddress = data.loadingAddress
    if (data.unloadingAddress !== undefined) r.destinationAddress = data.unloadingAddress
    if (data.unloadingNotes !== undefined) r.unloadingNotes = data.unloadingNotes
    if (data.weighingStatus !== undefined) r.weighingStatus = data.weighingStatus
    if (data.customsStatus !== undefined) r.customsStatus = data.customsStatus
    if (data.vehicleType !== undefined) r.vehicleType = data.vehicleType as any
  } else {
    // Air unit
    const a = found.entity as FmsAirUnit

    if (data.date !== undefined) a.etd = data.date
    if (data.port !== undefined) a.originAirport = data.port
    if (data.bookingNumber !== undefined) a.bookingNumber = data.bookingNumber
    if (data.notes !== undefined) a.notes = data.notes
    if (data.destination !== undefined) a.destinationAirport = data.destination
    if (data.weight !== undefined) a.grossWeight = data.weight?.toString() ?? null
    if (data.customsClearance !== undefined) a.customsClearanceLocation = data.customsClearance
    if (data.customsClearanceStatus !== undefined) a.customsClearanceStatus = data.customsClearanceStatus

    // Update carrier info on leg if changed
    if (data.carrierName !== undefined || data.rate !== undefined) {
      const leg = await em.findOne(FmsProjectLeg, {
        project: a.project.id,
        legSequence: 1,
        deletedAt: null,
      })
      if (leg) {
        if (data.carrierName !== undefined) leg.carrierName = data.carrierName
        if (data.rate !== undefined) leg.estimatedCost = data.rate?.toString() ?? null
      }
    }
  }

  // Persist changes
  await em.flush()

  // Return updated row
  const row = await mapToShipmentRow(em, found.entity, found.type)
  return NextResponse.json(row)
}
