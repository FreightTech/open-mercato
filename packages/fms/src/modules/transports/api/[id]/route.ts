/**
 * Transports Module - Single Transport Unit API
 *
 * GET/PUT operations for individual transport units in the aggregate transports view.
 * Routes updates to the correct underlying entity (FmsSeaContainer, FmsRoadUnit, FmsAirUnit).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsSeaContainer, FmsRoadUnit, FmsAirUnit, FmsProject, FmsProjectLeg } from '../../../fms_projects/data/entities'
import { getPrimaryTimestampValue, createManualTimestampEntry, addTimestampEntry } from '../../../fms_projects/lib/sea-containers/timestamp-utils'
import {
  fmsSeaContainerUpdateSchema,
  fmsRoadUnitUpdateSchema,
  fmsAirUnitUpdateSchema,
} from '../../../fms_projects/data/validators'
import type { TransportRow } from '../route'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['transports.transports.view'] },
  PUT: { requireAuth: true, requireFeatures: ['transports.transports.edit'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

// Update schema for transport row (maps to underlying entity fields)
const transportUpdateSchema = z.object({
  transportType: z.enum(['sea', 'air', 'road']),

  // Common fields
  date: z.coerce.date().optional().nullable(),
  origin: z.string().optional().nullable(),
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

  // Sea container - Packing details
  packsCount: z.coerce.number().int().optional().nullable(),
  packType: z.string().optional().nullable(),
  innersCount: z.coerce.number().int().optional().nullable(),
  innerType: z.string().optional().nullable(),

  // Sea container - Measurements
  loadingMeters: z.coerce.number().optional().nullable(),
  chargeableWeight: z.coerce.number().optional().nullable(),
  wvRatio: z.coerce.number().optional().nullable(),

  // Sea container - Cargo identification
  marksAndNumbers: z.string().optional().nullable(),
  hsCode: z.string().optional().nullable(),

  // Sea container - B/L status
  onBoardStatus: z.enum(['NOT_SHIPPED', 'SHIPPED']).optional().nullable(),
  onBoardDate: z.coerce.date().optional().nullable(),
  blIssueDate: z.coerce.date().optional().nullable(),
  originalsCount: z.coerce.number().int().optional().nullable(),
  expressBillsCount: z.coerce.number().int().optional().nullable(),

  // Sea container - Voyage details
  voyageNumber: z.string().optional().nullable(),
  carrierScac: z.string().optional().nullable(),
  imoNumber: z.string().optional().nullable(),

  // Sea container - Cut-off dates
  ctoReceivalDate: z.coerce.date().optional().nullable(),
  ctoCutOffDate: z.coerce.date().optional().nullable(),
  docsDueDate: z.coerce.date().optional().nullable(),

  // Sea container - Environmental
  co2Emissions: z.coerce.number().optional().nullable(),

  // Sea container - Pickup planning
  pickupRequiredFrom: z.coerce.date().optional().nullable(),
  pickupRequiredBy: z.coerce.date().optional().nullable(),
  estimatedPickup: z.coerce.date().optional().nullable(),
  actualPickup: z.coerce.date().optional().nullable(),
  pickupLocationId: z.string().uuid().optional().nullable(),
  pickupNotes: z.string().optional().nullable(),

  // Sea container - Delivery planning
  deliveryRequiredBy: z.coerce.date().optional().nullable(),
  estimatedDelivery: z.coerce.date().optional().nullable(),
  actualDelivery: z.coerce.date().optional().nullable(),
  deliveryLocationId: z.string().uuid().optional().nullable(),
  deliveryNotes: z.string().optional().nullable(),
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
 * Minimal find for update operations — only populates project to avoid
 * pulling deep party relationships (Contractor → FmsLocation) into the
 * identity map, which causes ValidationError on em.flush().
 */
async function findTransportUnitMinimal(
  em: EntityManager,
  id: string,
  scopeFilters: { tenantId?: string; organizationId?: string }
): Promise<{ entity: FmsSeaContainer | FmsRoadUnit | FmsAirUnit; type: 'sea' | 'road' | 'air' } | null> {
  const baseFilters: Record<string, unknown> = { id, deletedAt: null }
  if (scopeFilters.tenantId) baseFilters.tenantId = scopeFilters.tenantId
  if (scopeFilters.organizationId) baseFilters.organizationId = scopeFilters.organizationId

  const seaContainer = await em.findOne(FmsSeaContainer, baseFilters, { populate: ['project'] })
  if (seaContainer) return { entity: seaContainer, type: 'sea' }

  const roadUnit = await em.findOne(FmsRoadUnit, baseFilters, { populate: ['project'] })
  if (roadUnit) return { entity: roadUnit, type: 'road' }

  const airUnit = await em.findOne(FmsAirUnit, baseFilters, { populate: ['project'] })
  if (airUnit) return { entity: airUnit, type: 'air' }

  return null
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
    populate: [
      'project',
      'project.client',
      'project.notifyParty',
      'project.controllingAgent',
      'project.controllingCustomer',
      'project.sendingAgent',
      'project.receivingAgent',
      'project.creditor',
    ],
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
 * Map a transport unit to a unified TransportRow
 */
async function mapToTransportRow(
  em: EntityManager,
  entity: FmsSeaContainer | FmsRoadUnit | FmsAirUnit,
  type: 'sea' | 'road' | 'air'
): Promise<TransportRow> {
  const project = entity.project as FmsProject

  // Get first leg for carrier info (sea/air only)
  let leg: FmsProjectLeg | null = null
  if (type === 'sea' || type === 'air') {
    leg = await em.findOne(FmsProjectLeg, {
      project: project.id,
      legSequence: 1,
      deletedAt: null,
    }, { populate: ['carrier'] })
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
      date: getPrimaryTimestampValue(c.etaTimestamps)?.toISOString() ?? null,
      origin: project.direction === 'export' ? project.originAddress ?? null : project.destinationAddress ?? null,
      bookingNumber: c.bookingNumber ?? null,
      carrierName: leg?.carrierName ?? leg?.carrier?.name ?? null,
      rate: leg?.estimatedCost ?? null,
      rateCurrency: project.currencyCode ?? 'PLN',
      notes: c.notes ?? null,
      forwarder,
      forwarderId,
      weight: project.totalGrossWeight ?? null,
      goods: project.commodityDescription ?? null,
      destination: c.destinationLocation?.name ?? c.destinationLocation?.unlocode ?? null,
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

      // CargoWise-aligned fields (Project level)
      containerMode: project.containerMode ?? null,
      serviceLevel: project.serviceLevel ?? null,
      blNumber: project.blNumber ?? null,
      blType: project.blType ?? null,
      releaseType: project.releaseType ?? null,
      goodsValue: project.goodsValue ?? null,
      goodsValueCurrency: project.goodsValueCurrency ?? null,
      insuranceValue: project.insuranceValue ?? null,
      insuranceValueCurrency: project.insuranceValueCurrency ?? null,
      isDomestic: project.isDomestic ?? false,
      additionalTerms: project.additionalTerms ?? null,
      paymentTerms: project.paymentTerms ?? null,
      ctStatus: project.ctStatus ?? null,
      eFreightStatus: project.eFreightStatus ?? null,
      chargesApply: project.chargesApply ?? null,

      // Party names (from Project)
      notifyPartyName: (project.notifyParty as any)?.name ?? null,
      controllingAgentName: (project.controllingAgent as any)?.name ?? null,
      controllingCustomerName: (project.controllingCustomer as any)?.name ?? null,
      sendingAgentName: (project.sendingAgent as any)?.name ?? null,
      receivingAgentName: (project.receivingAgent as any)?.name ?? null,
      agentsReference: project.agentsReference ?? null,
      creditorName: (project.creditor as any)?.name ?? null,

      // Sea container - Packing details
      packsCount: c.packsCount ?? null,
      packType: c.packType ?? null,
      innersCount: c.innersCount ?? null,
      innerType: c.innerType ?? null,

      // Sea container - Measurements
      loadingMeters: c.loadingMeters ?? null,
      chargeableWeight: c.chargeableWeight ?? null,
      wvRatio: c.wvRatio ?? null,

      // Sea container - Cargo identification
      marksAndNumbers: c.marksAndNumbers ?? null,
      hsCode: c.hsCode ?? null,

      // Sea container - B/L status
      onBoardStatus: c.onBoardStatus ?? null,
      onBoardDate: c.onBoardDate?.toISOString() ?? null,
      blIssueDate: c.blIssueDate?.toISOString() ?? null,
      originalsCount: c.originalsCount ?? null,
      expressBillsCount: c.expressBillsCount ?? null,

      // Sea container - Voyage details
      voyageNumber: c.voyageNumber ?? null,
      carrierScac: c.carrierScac ?? null,
      imoNumber: c.imoNumber ?? null,

      // Sea container - Cut-off dates
      ctoReceivalDate: c.ctoReceivalDate?.toISOString() ?? null,
      ctoCutOffDate: c.ctoCutOffDate?.toISOString() ?? null,
      docsDueDate: c.docsDueDate?.toISOString() ?? null,

      // Sea container - Environmental
      co2Emissions: c.co2Emissions ?? null,

      // Sea container - Pickup planning
      pickupRequiredFrom: c.pickupRequiredFrom?.toISOString() ?? null,
      pickupRequiredBy: c.pickupRequiredBy?.toISOString() ?? null,
      estimatedPickup: c.estimatedPickup?.toISOString() ?? null,
      actualPickup: c.actualPickup?.toISOString() ?? null,
      pickupLocationId: c.pickupLocationId ?? null,
      pickupNotes: c.pickupNotes ?? null,

      // Sea container - Delivery planning
      deliveryRequiredBy: c.deliveryRequiredBy?.toISOString() ?? null,
      estimatedDelivery: c.estimatedDelivery?.toISOString() ?? null,
      actualDelivery: c.actualDelivery?.toISOString() ?? null,
      deliveryLocationId: c.deliveryLocationId ?? null,
      deliveryNotes: c.deliveryNotes ?? null,

      // Sea container - ETA/ATA timestamps for CombinedTimestampCell display
      etaTimestamps: c.etaTimestamps ?? null,
      ataTimestamps: c.ataTimestamps ?? null,
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
      origin: `${r.originAddress ?? ''} → ${r.destinationAddress ?? ''}`.trim() || null,
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

      // CargoWise-aligned fields (not populated for road)
      containerMode: null,
      serviceLevel: null,
      blNumber: null,
      blType: null,
      releaseType: null,
      goodsValue: null,
      goodsValueCurrency: null,
      insuranceValue: null,
      insuranceValueCurrency: null,
      isDomestic: false,
      additionalTerms: null,
      paymentTerms: null,
      ctStatus: null,
      eFreightStatus: null,
      chargesApply: null,

      // Party names (not populated for road)
      notifyPartyName: null,
      controllingAgentName: null,
      controllingCustomerName: null,
      sendingAgentName: null,
      receivingAgentName: null,
      agentsReference: null,
      creditorName: null,

      // Sea container fields (not applicable)
      packsCount: null,
      packType: null,
      innersCount: null,
      innerType: null,
      loadingMeters: null,
      chargeableWeight: null,
      wvRatio: null,
      marksAndNumbers: null,
      hsCode: null,
      onBoardStatus: null,
      onBoardDate: null,
      blIssueDate: null,
      originalsCount: null,
      expressBillsCount: null,
      voyageNumber: null,
      carrierScac: null,
      imoNumber: null,
      ctoReceivalDate: null,
      ctoCutOffDate: null,
      docsDueDate: null,
      co2Emissions: null,
      pickupRequiredFrom: null,
      pickupRequiredBy: null,
      estimatedPickup: null,
      actualPickup: r.actualPickup?.toISOString() ?? null,
      pickupLocationId: null,
      pickupNotes: null,
      deliveryRequiredBy: null,
      estimatedDelivery: null,
      actualDelivery: r.actualDelivery?.toISOString() ?? null,
      deliveryLocationId: null,
      deliveryNotes: null,

      // Not applicable for road
      etaTimestamps: null,
      ataTimestamps: null,
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
    origin: project.originAddress ?? null,
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

    // CargoWise-aligned fields (not populated for air)
    containerMode: null,
    serviceLevel: null,
    blNumber: null,
    blType: null,
    releaseType: null,
    goodsValue: null,
    goodsValueCurrency: null,
    insuranceValue: null,
    insuranceValueCurrency: null,
    isDomestic: false,
    additionalTerms: null,
    paymentTerms: null,
    ctStatus: null,
    eFreightStatus: null,
    chargesApply: null,

    // Party names (not populated for air)
    notifyPartyName: null,
    controllingAgentName: null,
    controllingCustomerName: null,
    sendingAgentName: null,
    receivingAgentName: null,
    agentsReference: null,
    creditorName: null,

    // Sea container fields (not applicable)
    packsCount: null,
    packType: null,
    innersCount: null,
    innerType: null,
    loadingMeters: null,
    chargeableWeight: null,
    wvRatio: null,
    marksAndNumbers: null,
    hsCode: null,
    onBoardStatus: null,
    onBoardDate: null,
    blIssueDate: null,
    originalsCount: null,
    expressBillsCount: null,
    voyageNumber: null,
    carrierScac: null,
    imoNumber: null,
    ctoReceivalDate: null,
    ctoCutOffDate: null,
    docsDueDate: null,
    co2Emissions: null,
    pickupRequiredFrom: null,
    pickupRequiredBy: null,
    estimatedPickup: null,
    actualPickup: null,
    pickupLocationId: null,
    pickupNotes: null,
    deliveryRequiredBy: null,
    estimatedDelivery: null,
    actualDelivery: null,
    deliveryLocationId: null,
    deliveryNotes: null,

    // Not applicable for air
    etaTimestamps: null,
    ataTimestamps: null,
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

  const row = await mapToTransportRow(em, found.entity, found.type)
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
  const validation = transportUpdateSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // Minimal find for update — only load entity + project, no deep party populates
  // that would pull FmsLocation into the identity map with missing required fields
  const found = await findTransportUnitMinimal(em, parse.data.id, scopeFilters)
  if (!found) {
    return NextResponse.json({ error: 'Transport unit not found' }, { status: 404 })
  }

  const data = validation.data

  // Update the entity based on transport type
  if (found.type === 'sea') {
    const c = found.entity as FmsSeaContainer

    // Map transport row fields to entity fields
    // For date (ETD), add a manual timestamp entry to the timestamps array
    if (data.date !== undefined) {
      if (data.date === null) {
        c.etdTimestamps = null
      } else {
        const newEntry = createManualTimestampEntry(data.date)
        c.etdTimestamps = addTimestampEntry(c.etdTimestamps, newEntry)
      }
    }
    // For origin/destination, update the JSONB location objects
    if (data.origin !== undefined || data.port !== undefined) {
      const originName = data.origin !== undefined ? data.origin : data.port
      if (originName === null || originName === undefined) {
        c.originLocation = null
      } else {
        c.originLocation = {
          ...(c.originLocation ?? { unlocode: null, countryCode: null, facilityCode: null, facilityCodeListProvider: null, facilityTypeCode: null, address: null, coords: null, operatorName: null, source: 'manual' as const }),
          name: originName,
        }
      }
    }
    if (data.bookingNumber !== undefined) c.bookingNumber = data.bookingNumber
    if (data.notes !== undefined) c.notes = data.notes
    if (data.destination !== undefined) {
      if (data.destination === null) {
        c.destinationLocation = null
      } else {
        c.destinationLocation = {
          ...(c.destinationLocation ?? { unlocode: null, countryCode: null, facilityCode: null, facilityCodeListProvider: null, facilityTypeCode: null, address: null, coords: null, operatorName: null, source: 'manual' as const }),
          name: data.destination,
        }
      }
    }
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

    // Packing details
    if (data.packsCount !== undefined) c.packsCount = data.packsCount
    if (data.packType !== undefined) c.packType = data.packType as any
    if (data.innersCount !== undefined) c.innersCount = data.innersCount
    if (data.innerType !== undefined) c.innerType = data.innerType

    // Measurements
    if (data.loadingMeters !== undefined) c.loadingMeters = data.loadingMeters?.toString() ?? null
    if (data.chargeableWeight !== undefined) c.chargeableWeight = data.chargeableWeight?.toString() ?? null
    if (data.wvRatio !== undefined) c.wvRatio = data.wvRatio?.toString() ?? null

    // Cargo identification
    if (data.marksAndNumbers !== undefined) c.marksAndNumbers = data.marksAndNumbers
    if (data.hsCode !== undefined) c.hsCode = data.hsCode

    // B/L status
    if (data.onBoardStatus !== undefined) c.onBoardStatus = data.onBoardStatus as any
    if (data.onBoardDate !== undefined) c.onBoardDate = data.onBoardDate
    if (data.blIssueDate !== undefined) c.blIssueDate = data.blIssueDate
    if (data.originalsCount !== undefined) c.originalsCount = data.originalsCount
    if (data.expressBillsCount !== undefined) c.expressBillsCount = data.expressBillsCount

    // Voyage details
    if (data.voyageNumber !== undefined) c.voyageNumber = data.voyageNumber
    if (data.carrierScac !== undefined) c.carrierScac = data.carrierScac
    if (data.imoNumber !== undefined) c.imoNumber = data.imoNumber

    // Cut-off dates
    if (data.ctoReceivalDate !== undefined) c.ctoReceivalDate = data.ctoReceivalDate
    if (data.ctoCutOffDate !== undefined) c.ctoCutOffDate = data.ctoCutOffDate
    if (data.docsDueDate !== undefined) c.docsDueDate = data.docsDueDate

    // Environmental
    if (data.co2Emissions !== undefined) c.co2Emissions = data.co2Emissions?.toString() ?? null

    // Pickup planning
    if (data.pickupRequiredFrom !== undefined) c.pickupRequiredFrom = data.pickupRequiredFrom
    if (data.pickupRequiredBy !== undefined) c.pickupRequiredBy = data.pickupRequiredBy
    if (data.estimatedPickup !== undefined) c.estimatedPickup = data.estimatedPickup
    if (data.actualPickup !== undefined) c.actualPickup = data.actualPickup
    if (data.pickupLocationId !== undefined) c.pickupLocationId = data.pickupLocationId
    if (data.pickupNotes !== undefined) c.pickupNotes = data.pickupNotes

    // Delivery planning
    if (data.deliveryRequiredBy !== undefined) c.deliveryRequiredBy = data.deliveryRequiredBy
    if (data.estimatedDelivery !== undefined) c.estimatedDelivery = data.estimatedDelivery
    if (data.actualDelivery !== undefined) c.actualDelivery = data.actualDelivery
    if (data.deliveryLocationId !== undefined) c.deliveryLocationId = data.deliveryLocationId
    if (data.deliveryNotes !== undefined) c.deliveryNotes = data.deliveryNotes

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
    if (data.origin !== undefined) r.originAddress = data.origin
    if (data.destination !== undefined) r.destinationAddress = data.destination
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
    if (data.origin !== undefined) a.originAirport = data.origin
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

  // Use a fresh em for response mapping with full populates (avoids identity map pollution)
  const freshEm = em.fork()
  const freshFound = await findTransportUnit(freshEm, parse.data.id, scopeFilters)
  if (!freshFound) {
    return NextResponse.json({ error: 'Transport unit not found after update' }, { status: 500 })
  }
  const row = await mapToTransportRow(freshEm, freshFound.entity, freshFound.type)
  return NextResponse.json(row)
}
