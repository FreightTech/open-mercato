/**
 * Shipments Module - Aggregate View API
 *
 * This endpoint provides an editable aggregate view of transport data from the Projects module.
 * Instead of querying separate shipment entities, it aggregates data from:
 * - FmsSeaContainer (for EXP, IMP, RAIL, DEPOT)
 * - FmsRoadUnit (for FTL, LTL)
 * - FmsAirUnit (optional, for AIR)
 *
 * The data is joined with FmsProject for order number, client info, and route details.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsSeaContainer, FmsRoadUnit, FmsAirUnit, FmsProject, FmsProjectLeg } from '../../fms_projects/data/entities'
import { SHIPMENT_TYPES } from '../../fms_projects/data/types'
import type { ShipmentType } from '../../fms_projects/data/types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
}

// Query schema for the aggregate view
const querySchema = z.object({
  shipmentType: z.enum(SHIPMENT_TYPES).default('EXP'),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(500).default(100),
  search: z.string().optional(),
  sortField: z.string().optional().default('date'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

// Unified shipment row structure
export interface ShipmentRow {
  // Identity
  id: string
  transportType: 'sea' | 'air' | 'road'
  projectId: string
  projectNumber: string
  shipmentType: ShipmentType

  // Common fields
  date: string | null
  route: string | null
  port: string | null
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
 * Get the shipment types to query based on tab selection
 */
function getShipmentTypesForTab(shipmentType: ShipmentType): ShipmentType[] {
  // FTL tab includes both FTL and LTL
  if (shipmentType === 'FTL') {
    return ['FTL', 'LTL']
  }
  return [shipmentType]
}

/**
 * Determine transport type based on shipment type
 */
function getTransportTypeForShipmentType(shipmentType: ShipmentType): 'sea' | 'road' {
  if (shipmentType === 'FTL' || shipmentType === 'LTL') {
    return 'road'
  }
  return 'sea' // EXP, IMP, RAIL, DEPOT all use sea containers
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

  const { shipmentType, page, pageSize, search, sortField, sortDir } = parse.data
  const shipmentTypes = getShipmentTypesForTab(shipmentType)
  const transportType = getTransportTypeForShipmentType(shipmentType)

  // Build base filters for projects
  const projectFilters: Record<string, unknown> = {
    deletedAt: null,
    shipmentType: { $in: shipmentTypes },
  }
  if (scopeFilters.tenantId) {
    projectFilters.tenantId = scopeFilters.tenantId
  }
  if (scopeFilters.organizationId) {
    projectFilters.organizationId = scopeFilters.organizationId
  }

  let items: ShipmentRow[] = []
  let total = 0

  if (transportType === 'sea') {
    // Query sea containers with project joins
    const containerFilters: Record<string, unknown> = {
      deletedAt: null,
      project: projectFilters,
    }

    // Add search filters
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      containerFilters.$or = [
        { containerNumber: { $ilike: searchTerm } },
        { bookingNumber: { $ilike: searchTerm } },
        { 'project.projectNumber': { $ilike: searchTerm } },
      ]
    }

    // Build sort
    const sortFieldMap: Record<string, string> = {
      date: 'etd',
      containerNumber: 'containerNumber',
      bookingNumber: 'bookingNumber',
      port: 'originPort',
      createdAt: 'createdAt',
    }
    const orderBy: Record<string, 'asc' | 'desc'> = {
      [sortFieldMap[sortField] || 'etd']: sortDir,
    }

    // Get total count
    total = await em.count(FmsSeaContainer, containerFilters)

    // Get paginated results
    const containers = await em.find(FmsSeaContainer, containerFilters, {
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
      orderBy,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    })

    // Get first leg for each project (carrier info)
    const projectIds = [...new Set(containers.map((c) => c.project.id))]
    const legs = await em.find(
      FmsProjectLeg,
      {
        project: { $in: projectIds },
        legSequence: 1,
        deletedAt: null,
      },
      { populate: ['carrier'] }
    )
    const legsByProject = new Map(legs.map((l) => [l.project.id, l]))

    // Get users for forwarder lookup
    const userIds = new Set<string>()
    for (const c of containers) {
      const project = c.project as FmsProject & { assignedToId?: string }
      if (project && (project as any).assignedToId) {
        userIds.add((project as any).assignedToId)
      }
    }
    const users = userIds.size
      ? await em.find('User' as any, { id: { $in: [...userIds] } })
      : []
    const userMap = new Map((users as any[]).map((u) => [u.id, u]))

    // Map to unified row format
    items = containers.map((c) => {
      const project = c.project as FmsProject
      const leg = legsByProject.get(project.id)
      const assignedUser = (project as any).assignedToId
        ? userMap.get((project as any).assignedToId)
        : null

      return {
        id: c.id,
        transportType: 'sea' as const,
        projectId: project.id,
        projectNumber: project.projectNumber,
        shipmentType: project.shipmentType,

        // Common
        date: c.etd?.toISOString() ?? null,
        route:
          project.direction === 'export'
            ? (project.originAddress ?? null)
            : (project.destinationAddress ?? null),
        port: c.originPort ?? null,
        bookingNumber: c.bookingNumber ?? null,
        carrierName: leg?.carrierName ?? null,
        rate: leg?.estimatedCost ?? null,
        rateCurrency: project.currencyCode ?? 'PLN',
        notes: c.notes ?? null,
        forwarder: assignedUser?.displayName ?? assignedUser?.email ?? null,
        forwarderId: (project as any).assignedToId ?? null,
        weight: project.totalGrossWeight ?? null,
        goods: project.commodityDescription ?? null,
        destination: c.destinationPort ?? null,
        additional: null,

        // Sea-specific
        containerType: c.containerType ?? null,
        containerNumber: c.containerNumber ?? null,
        shippingLine: c.vesselName ?? null, // Armator/carrier lookup
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
        attachmentNumber: null, // Can be populated from project metadata if needed

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
      }
    })
  } else {
    // Query road units with project joins
    const roadFilters: Record<string, unknown> = {
      deletedAt: null,
      project: projectFilters,
    }

    // Add search filters
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      roadFilters.$or = [
        { truckNumber: { $ilike: searchTerm } },
        { bookingNumber: { $ilike: searchTerm } },
        { cmrNumber: { $ilike: searchTerm } },
        { 'project.projectNumber': { $ilike: searchTerm } },
      ]
    }

    // Build sort
    const sortFieldMap: Record<string, string> = {
      date: 'pickupDate',
      vehicleType: 'vehicleType',
      bookingNumber: 'bookingNumber',
      createdAt: 'createdAt',
    }
    const orderBy: Record<string, 'asc' | 'desc'> = {
      [sortFieldMap[sortField] || 'pickupDate']: sortDir,
    }

    // Get total count
    total = await em.count(FmsRoadUnit, roadFilters)

    // Get paginated results
    const roadUnits = await em.find(FmsRoadUnit, roadFilters, {
      populate: ['project', 'project.client'],
      orderBy,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    })

    // Get users for forwarder lookup
    const userIds = new Set<string>()
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
    items = roadUnits.map((r) => {
      const project = r.project as FmsProject
      const assignedUser = (project as any).assignedToId
        ? userMap.get((project as any).assignedToId)
        : null

      return {
        id: r.id,
        transportType: 'road' as const,
        projectId: project.id,
        projectNumber: project.projectNumber,
        shipmentType: project.shipmentType,

        // Common
        date: r.pickupDate?.toISOString() ?? null,
        route: `${r.originAddress ?? ''} → ${r.destinationAddress ?? ''}`.trim(),
        port: null,
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

        // CargoWise-aligned fields (Project level - not populated for road)
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

        // Sea container - Packing details (not applicable)
        packsCount: null,
        packType: null,
        innersCount: null,
        innerType: null,

        // Sea container - Measurements (not applicable)
        loadingMeters: null,
        chargeableWeight: null,
        wvRatio: null,

        // Sea container - Cargo identification (not applicable)
        marksAndNumbers: null,
        hsCode: null,

        // Sea container - B/L status (not applicable)
        onBoardStatus: null,
        onBoardDate: null,
        blIssueDate: null,
        originalsCount: null,
        expressBillsCount: null,

        // Sea container - Voyage details (not applicable)
        voyageNumber: null,
        carrierScac: null,
        imoNumber: null,

        // Sea container - Cut-off dates (not applicable)
        ctoReceivalDate: null,
        ctoCutOffDate: null,
        docsDueDate: null,

        // Sea container - Environmental (not applicable)
        co2Emissions: null,

        // Road uses different pickup/delivery fields
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
      }
    })
  }

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
