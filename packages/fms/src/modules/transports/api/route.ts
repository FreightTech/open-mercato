/**
 * Transports Module - Aggregate View API
 *
 * This endpoint provides an editable aggregate view of transport data from the Projects module.
 * It queries all transport types (sea containers, road units) and returns them in a unified format.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsSeaContainer, FmsRoadUnit, FmsProject, FmsProjectLeg } from '../../fms_projects/data/entities'
import type { ShipmentType } from '../../fms_projects/data/types'
import { getPrimaryTimestampValue } from '../../fms_projects/lib/sea-containers/timestamp-utils'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['transports.transports.view'] },
}

// Query schema - no shipmentType filter
// Accepts both `limit`/`q` (from useDynamicTablePage hook) and `pageSize`/`search` (legacy)
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  pageSize: z.coerce.number().min(1).max(500).optional(),
  q: z.string().optional(),
  search: z.string().optional(),
  sortField: z.string().optional().default('date'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  filters: z.string().optional(),
})

// Unified transport row structure
export interface TransportRow {
  // Identity
  id: string
  transportType: 'sea' | 'air' | 'road'
  projectId: string
  projectNumber: string
  shipmentType: ShipmentType

  // Common fields
  date: string | null
  origin: string | null
  bookingNumber: string | null
  carrierName: string | null
  rate: string | null
  rateCurrency: string | null
  notes: string | null
  forwarder: string | null
  forwarderId: string | null
  weight: string | null
  goods: string | null
  destination: string | null
  additional: string | null

  // Sea-specific
  containerType: string | null
  containerNumber: string | null
  shippingLine: string | null
  vgmStatus: string | null
  vgmWeight: string | null
  customsClearance: string | null
  customsClearanceStatus: string | null
  cutOff: string | null
  pinCode: string | null
  deliveryTime: string | null
  dropOffLocation: string | null

  // Road-specific
  vehicleType: string | null
  loadingAddress: string | null
  unloadingAddress: string | null
  unloadingNotes: string | null
  weighingStatus: string | null
  customsStatus: string | null
  contactInfo: string | null

  // Air-specific
  mawbNumber: string | null
  hawbNumber: string | null
  flightNumber: string | null

  // Direction indicator (for RAIL)
  direction: string | null
  attachmentNumber: string | null

  // CargoWise-aligned fields (Project level)
  containerMode: string | null
  serviceLevel: string | null
  blNumber: string | null
  blType: string | null
  releaseType: string | null
  goodsValue: string | null
  goodsValueCurrency: string | null
  insuranceValue: string | null
  insuranceValueCurrency: string | null
  isDomestic: boolean
  additionalTerms: string | null
  paymentTerms: string | null
  ctStatus: string | null
  eFreightStatus: string | null
  chargesApply: string | null

  // Party names (from Project)
  notifyPartyName: string | null
  controllingAgentName: string | null
  controllingCustomerName: string | null
  sendingAgentName: string | null
  receivingAgentName: string | null
  agentsReference: string | null
  creditorName: string | null

  // Sea container - Packing details
  packsCount: number | null
  packType: string | null
  innersCount: number | null
  innerType: string | null

  // Sea container - Measurements
  loadingMeters: string | null
  chargeableWeight: string | null
  wvRatio: string | null

  // Sea container - Cargo identification
  marksAndNumbers: string | null
  hsCode: string | null

  // Sea container - B/L status
  onBoardStatus: string | null
  onBoardDate: string | null
  blIssueDate: string | null
  originalsCount: number | null
  expressBillsCount: number | null

  // Sea container - Voyage details
  voyageNumber: string | null
  carrierScac: string | null
  imoNumber: string | null

  // Sea container - Cut-off dates
  ctoReceivalDate: string | null
  ctoCutOffDate: string | null
  docsDueDate: string | null

  // Sea container - Environmental
  co2Emissions: string | null

  // Sea container - Pickup planning (pre-carriage)
  pickupRequiredFrom: string | null
  pickupRequiredBy: string | null
  estimatedPickup: string | null
  actualPickup: string | null
  pickupLocationId: string | null
  pickupNotes: string | null

  // Sea container - Delivery planning (on-carriage)
  deliveryRequiredBy: string | null
  estimatedDelivery: string | null
  actualDelivery: string | null
  deliveryLocationId: string | null
  deliveryNotes: string | null

  // Sea container - ETA/ATA timestamps for CombinedTimestampCell display
  etaTimestamps: TimestampEntry[] | null
  ataTimestamps: TimestampEntry[] | null

  // Project-level location columns (FK to FmsLocation)
  placeOfLoadingId: string | null
  placeOfLoadingName: string | null
  portOfLoadingId: string | null
  portOfLoadingName: string | null
  portOfDestinationId: string | null
  portOfDestinationName: string | null
  placeOfDeliveryId: string | null
  placeOfDeliveryName: string | null
}

// Timestamp entry type (matches CombinedTimestampCell.tsx)
export type TimestampEntry = {
  value: string
  offset: string | null
  source: 'carrier_api' | 'manual' | 'ais' | 'port' | 'edi'
  updatedAt: string
  sourceEventId?: string | null
}

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
 * Map a sea container + project to a unified TransportRow
 */
function mapSeaContainer(
  c: any,
  project: FmsProject,
  leg: any | undefined,
  assignedUser: any | undefined
): TransportRow {
  return {
    id: c.id,
    transportType: 'sea' as const,
    projectId: project.id,
    projectNumber: project.projectNumber,
    shipmentType: project.shipmentType,

    // Common
    date: getPrimaryTimestampValue(c.etaTimestamps)?.toISOString() ?? null,
    origin: c.originLocation?.name ?? c.originLocation?.unlocode ?? null,
    bookingNumber: c.bookingNumber ?? null,
    carrierName: leg?.carrierName ?? leg?.carrier?.name ?? null,
    rate: leg?.estimatedCost ?? null,
    rateCurrency: project.currencyCode ?? 'PLN',
    notes: c.notes ?? null,
    forwarder: assignedUser?.displayName ?? assignedUser?.email ?? null,
    forwarderId: (project as any).assignedToId ?? null,
    weight: project.totalGrossWeight ?? null,
    goods: project.commodityDescription ?? null,
    destination: c.destinationLocation?.name ?? c.destinationLocation?.unlocode ?? null,
    additional: null,

    // Sea-specific
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

    // Not applicable for sea
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

    // Direction for RAIL
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

    // Sea container - Pickup planning (pre-carriage)
    pickupRequiredFrom: c.pickupRequiredFrom?.toISOString() ?? null,
    pickupRequiredBy: c.pickupRequiredBy?.toISOString() ?? null,
    estimatedPickup: c.estimatedPickup?.toISOString() ?? null,
    actualPickup: c.actualPickup?.toISOString() ?? null,
    pickupLocationId: c.pickupLocationId ?? null,
    pickupNotes: c.pickupNotes ?? null,

    // Sea container - Delivery planning (on-carriage)
    deliveryRequiredBy: c.deliveryRequiredBy?.toISOString() ?? null,
    estimatedDelivery: c.estimatedDelivery?.toISOString() ?? null,
    actualDelivery: c.actualDelivery?.toISOString() ?? null,
    deliveryLocationId: c.deliveryLocationId ?? null,
    deliveryNotes: c.deliveryNotes ?? null,

    // Sea container - ETA/ATA timestamps for CombinedTimestampCell display
    etaTimestamps: c.etaTimestamps ?? null,
    ataTimestamps: c.ataTimestamps ?? null,

    // Project-level location columns
    placeOfLoadingId: (project.placeOfLoading as any)?.id ?? null,
    placeOfLoadingName: (project.placeOfLoading as any)?.name ?? null,
    portOfLoadingId: (project.originLocation as any)?.id ?? null,
    portOfLoadingName: (project.originLocation as any)?.name ?? null,
    portOfDestinationId: (project.destinationLocation as any)?.id ?? null,
    portOfDestinationName: (project.destinationLocation as any)?.name ?? null,
    placeOfDeliveryId: (project.placeOfDischarge as any)?.id ?? null,
    placeOfDeliveryName: (project.placeOfDischarge as any)?.name ?? null,
  }
}

/**
 * Map a road unit + project to a unified TransportRow
 */
function mapRoadUnit(
  r: any,
  project: FmsProject,
  assignedUser: any | undefined
): TransportRow {
  return {
    id: r.id,
    transportType: 'road' as const,
    projectId: project.id,
    projectNumber: project.projectNumber,
    shipmentType: project.shipmentType,

    // Common
    date: r.pickupDate?.toISOString() ?? null,
    origin: r.originAddress ?? null,
    bookingNumber: r.bookingNumber ?? null,
    carrierName: r.carrierName ?? null,
    rate: r.rate ?? null,
    rateCurrency: r.rateCurrency ?? 'PLN',
    notes: r.notes ?? null,
    forwarder: assignedUser?.displayName ?? assignedUser?.email ?? null,
    forwarderId: (project as any).assignedToId ?? null,
    weight: r.grossWeight ?? null,
    goods: project.commodityDescription ?? null,
    destination: r.destinationAddress ?? null,
    additional: null,

    // Sea-specific (not applicable)
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

    // Road-specific
    vehicleType: r.vehicleType ?? null,
    loadingAddress: r.originAddress ?? null,
    unloadingAddress: r.destinationAddress ?? null,
    unloadingNotes: r.unloadingNotes ?? null,
    weighingStatus: r.weighingStatus ?? null,
    customsStatus: r.customsStatus ?? null,
    contactInfo: r.driverName ? `${r.driverName} ${r.driverPhone ?? ''}`.trim() : null,

    // Air-specific (not applicable)
    mawbNumber: null,
    hawbNumber: null,
    flightNumber: null,

    // Direction
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

    // Project-level location columns
    placeOfLoadingId: (project.placeOfLoading as any)?.id ?? null,
    placeOfLoadingName: (project.placeOfLoading as any)?.name ?? null,
    portOfLoadingId: (project.originLocation as any)?.id ?? null,
    portOfLoadingName: (project.originLocation as any)?.name ?? null,
    portOfDestinationId: (project.destinationLocation as any)?.id ?? null,
    portOfDestinationName: (project.destinationLocation as any)?.name ?? null,
    placeOfDeliveryId: (project.placeOfDischarge as any)?.id ?? null,
    placeOfDeliveryName: (project.placeOfDischarge as any)?.name ?? null,
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const query: Record<string, string | undefined> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })

  const parse = querySchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // Support both param names: limit/q (hook) and pageSize/search (legacy)
  const pageSize = parse.data.limit ?? parse.data.pageSize ?? 100
  const search = parse.data.q ?? parse.data.search
  const { page, sortField, sortDir } = parse.data

  // Build base project filters (no shipmentType restriction)
  const baseProjectFilters: Record<string, unknown> = {
    deletedAt: null,
  }
  if (scopeFilters.tenantId) {
    baseProjectFilters.tenantId = scopeFilters.tenantId
  }
  if (scopeFilters.organizationId) {
    baseProjectFilters.organizationId = scopeFilters.organizationId
  }

  // --- Query sea containers ---
  const seaContainerFilters: Record<string, unknown> = {
    deletedAt: null,
    project: { ...baseProjectFilters },
  }

  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`
    seaContainerFilters.$or = [
      { containerNumber: { $ilike: searchTerm } },
      { bookingNumber: { $ilike: searchTerm } },
      { project: { projectNumber: { $ilike: searchTerm } } },
    ]
  }

  // --- Query road units ---
  const roadFilters: Record<string, unknown> = {
    deletedAt: null,
    project: { ...baseProjectFilters },
  }

  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`
    roadFilters.$or = [
      { truckNumber: { $ilike: searchTerm } },
      { bookingNumber: { $ilike: searchTerm } },
      { cmrNumber: { $ilike: searchTerm } },
      { project: { projectNumber: { $ilike: searchTerm } } },
    ]
  }

  // Get counts for both types
  const [seaTotal, roadTotal] = await Promise.all([
    em.count(FmsSeaContainer, seaContainerFilters),
    em.count(FmsRoadUnit, roadFilters),
  ])

  const total = seaTotal + roadTotal

  // Build sort for sea containers
  const seaSortFieldMap: Record<string, string> = {
    date: 'etd',
    containerNumber: 'containerNumber',
    bookingNumber: 'bookingNumber',
    port: 'originPort',
    createdAt: 'createdAt',
  }
  const seaPrimarySort = seaSortFieldMap[sortField] || 'etd'

  // Build sort for road units
  const roadSortFieldMap: Record<string, string> = {
    date: 'pickupDate',
    vehicleType: 'vehicleType',
    bookingNumber: 'bookingNumber',
    createdAt: 'createdAt',
  }
  const roadPrimarySort = roadSortFieldMap[sortField] || 'pickupDate'

  // Fetch both types (fetch all to sort together, then paginate)
  // For reasonable dataset sizes, fetch with a generous limit and combine
  const fetchLimit = Math.min(total, pageSize * 3) // Fetch enough to fill the page after combining
  const [containers, roadUnits] = await Promise.all([
    em.find(FmsSeaContainer, seaContainerFilters, {
      populate: [
        'project',
        'project.client',
        'project.notifyParty',
        'project.controllingAgent',
        'project.controllingCustomer',
        'project.sendingAgent',
        'project.receivingAgent',
        'project.creditor',
        'project.placeOfLoading',
        'project.originLocation',
        'project.destinationLocation',
        'project.placeOfDischarge',
      ],
      orderBy: { [seaPrimarySort]: sortDir, id: 'asc' },
      limit: fetchLimit,
    }),
    em.find(FmsRoadUnit, roadFilters, {
      populate: [
        'project',
        'project.client',
        'project.placeOfLoading',
        'project.originLocation',
        'project.destinationLocation',
        'project.placeOfDischarge',
      ],
      orderBy: { [roadPrimarySort]: sortDir, id: 'asc' },
      limit: fetchLimit,
    }),
  ])

  // Get first leg for each project (carrier info for sea containers)
  const seaProjectIds = [...new Set(containers.map((c) => c.project.id))]
  const legs = seaProjectIds.length > 0
    ? await em.find(
      FmsProjectLeg,
      {
        project: { $in: seaProjectIds },
        legSequence: 1,
        deletedAt: null,
      },
      { populate: ['carrier'] }
    )
    : []
  const legsByProject = new Map(legs.map((l) => [l.project.id, l]))

  // Get users for forwarder lookup (from both types)
  const userIds = new Set<string>()
  for (const c of containers) {
    const project = c.project as FmsProject & { assignedToId?: string }
    if (project && (project as any).assignedToId) {
      userIds.add((project as any).assignedToId)
    }
  }
  for (const r of roadUnits) {
    const project = r.project as FmsProject & { assignedToId?: string }
    if (project && (project as any).assignedToId) {
      userIds.add((project as any).assignedToId)
    }
  }
  const users = userIds.size
    ? await em.find('User' as any, { id: { $in: [...userIds] } })
    : []
  const userMap = new Map((users as any[]).map((u) => [u.id, u]))

  // Map to unified row format
  const seaItems: TransportRow[] = containers.map((c) => {
    const project = c.project as FmsProject
    const leg = legsByProject.get(project.id)
    const assignedUser = (project as any).assignedToId
      ? userMap.get((project as any).assignedToId)
      : null
    return mapSeaContainer(c, project, leg, assignedUser)
  })

  const roadItems: TransportRow[] = roadUnits.map((r) => {
    const project = r.project as FmsProject
    const assignedUser = (project as any).assignedToId
      ? userMap.get((project as any).assignedToId)
      : null
    return mapRoadUnit(r, project, assignedUser)
  })

  // Combine and sort all items together
  const allItems = [...seaItems, ...roadItems]
  allItems.sort((a, b) => {
    const aDate = a.date ?? ''
    const bDate = b.date ?? ''
    const cmp = aDate.localeCompare(bDate)
    return sortDir === 'desc' ? -cmp : cmp
  })

  // Paginate the combined results
  const offset = (page - 1) * pageSize
  const items = allItems.slice(offset, offset + pageSize)

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
