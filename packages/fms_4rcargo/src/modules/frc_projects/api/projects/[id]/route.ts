import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcProject } from '../../../data/entities'
import { FrcRfq } from '../../../../frc_rfqs/data/entities'
import { FrcOffer } from '../../../../frc_offers/data/entities'
import { updateProjectSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_projects.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.add(fallbackOrgId)
    }
  }

  if (allowedOrgIds.size > 0) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  return filters
}

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Collect all airport IDs we'll need to fetch (including project's own airports)
  const allAirportIds: string[] = []
  if (project.originAirportId) allAirportIds.push(project.originAirportId)
  if (project.destinationAirportId) allAirportIds.push(project.destinationAirportId)

  // Fetch RFQ with full details and air cargo (no airport populate - they're UUIDs now)
  let rfqData: {
    id: string
    name: string
    salesStage: string
    originAirport: { id: string; code: string; city: string | null } | null
    destinationAirport: { id: string; code: string; city: string | null } | null
    shipmentReadyDate: Date | null
    requiredAtDestinationDate: Date | null
    product: string | null
    commodity: string | null
    totalPieces: number
    totalVolume: string
    totalActualWeight: string
    totalChargeableWeight: string
  } | null = null
  let airCargoData: Array<{
    id: string
    name: string
    numberOfPieces: number
    lengthCm: string | null
    widthCm: string | null
    heightCm: string | null
    volumeM3: string
    actualWeightKg: string
    chargeableWeightKg: string
  }> = []

  let rfq: FrcRfq | null = null
  if (project.rfqId) {
    rfq = await em.findOne(
      FrcRfq,
      { id: project.rfqId, deletedAt: null },
      { populate: ['airCargo'] }
    )
    if (rfq) {
      // Collect RFQ airport IDs
      if (rfq.originAirportId) allAirportIds.push(rfq.originAirportId)
      if (rfq.destinationAirportId) allAirportIds.push(rfq.destinationAirportId)

      airCargoData = rfq.airCargo
        .getItems()
        .filter((cargo) => !cargo.deletedAt)
        .map((cargo) => ({
          id: cargo.id,
          name: cargo.name,
          numberOfPieces: cargo.numberOfPieces,
          lengthCm: cargo.lengthCm ?? null,
          widthCm: cargo.widthCm ?? null,
          heightCm: cargo.heightCm ?? null,
          volumeM3: cargo.volumeM3,
          actualWeightKg: cargo.actualWeightKg,
          chargeableWeightKg: cargo.chargeableWeightKg,
        }))
    }
  }

  // Fetch Offer with full details and air routing (no airport populate - they're UUIDs now)
  let offerData: {
    id: string
    name: string
    status: string
    awbNumber: string | null
    departureDate: Date | null
    connectionMethod: string | null
    connectionRateTotal: string | null
    airfreightRateTotal: string | null
    totalRate: string | null
    currencyCode: string
  } | null = null
  let airRoutingItems: Array<{
    id: string
    name: string
    type: string
    flightNumber: string | null
    originAirportId: string | null
    destinationAirportId: string | null
    departureDate: Date | null
    departureTime: string | null
    arrivalDate: Date | null
    arrivalTime: string | null
  }> = []

  if (project.offerId) {
    const offer = await em.findOne(
      FrcOffer,
      { id: project.offerId, deletedAt: null },
      { populate: ['airRouting'] }
    )
    if (offer) {
      offerData = {
        id: offer.id,
        name: offer.name,
        status: offer.status,
        awbNumber: offer.awbNumber ?? null,
        departureDate: offer.departureDate ?? null,
        connectionMethod: offer.connectionMethod ?? null,
        connectionRateTotal: offer.connectionRateTotal ?? null,
        airfreightRateTotal: offer.airfreightRateTotal ?? null,
        totalRate: offer.totalRate ?? null,
        currencyCode: offer.currencyCode,
      }
      airRoutingItems = offer.airRouting
        .getItems()
        .filter((routing) => !routing.deletedAt)
        .map((routing) => {
          // Collect routing airport IDs
          if (routing.originAirportId) allAirportIds.push(routing.originAirportId)
          if (routing.destinationAirportId) allAirportIds.push(routing.destinationAirportId)

          return {
            id: routing.id,
            name: routing.name,
            type: routing.type,
            flightNumber: routing.flightNumber ?? null,
            originAirportId: routing.originAirportId ?? null,
            destinationAirportId: routing.destinationAirportId ?? null,
            departureDate: routing.departureDate ?? null,
            departureTime: routing.departureTime ?? null,
            arrivalDate: routing.arrivalDate ?? null,
            arrivalTime: routing.arrivalTime ?? null,
          }
        })
    }
  }

  // Batch fetch all airports from FmsLocation
  const uniqueAirportIds = [...new Set(allAirportIds.filter(Boolean))]
  const airports =
    uniqueAirportIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: uniqueAirportIds }, type: 'airport' })
      : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  // Build RFQ data with resolved airports
  if (rfq) {
    const originAirport = rfq.originAirportId ? airportMap.get(rfq.originAirportId) : null
    const destinationAirport = rfq.destinationAirportId
      ? airportMap.get(rfq.destinationAirportId)
      : null

    rfqData = {
      id: rfq.id,
      name: rfq.name,
      salesStage: rfq.salesStage,
      originAirport: originAirport
        ? { id: originAirport.id, code: originAirport.code, city: originAirport.city ?? null }
        : null,
      destinationAirport: destinationAirport
        ? {
            id: destinationAirport.id,
            code: destinationAirport.code,
            city: destinationAirport.city ?? null,
          }
        : null,
      shipmentReadyDate: rfq.shipmentReadyDate ?? null,
      requiredAtDestinationDate: rfq.requiredAtDestinationDate ?? null,
      product: rfq.product ?? null,
      commodity: rfq.commodity ?? null,
      totalPieces: rfq.totalPieces,
      totalVolume: rfq.totalVolume,
      totalActualWeight: rfq.totalActualWeight,
      totalChargeableWeight: rfq.totalChargeableWeight,
    }
  }

  // Build air routing data with resolved airports
  const airRoutingData = airRoutingItems.map((routing) => {
    const originAirport = routing.originAirportId ? airportMap.get(routing.originAirportId) : null
    const destinationAirport = routing.destinationAirportId
      ? airportMap.get(routing.destinationAirportId)
      : null

    return {
      id: routing.id,
      name: routing.name,
      type: routing.type,
      flightNumber: routing.flightNumber,
      originAirport: originAirport ? { id: originAirport.id, code: originAirport.code } : null,
      destinationAirport: destinationAirport
        ? { id: destinationAirport.id, code: destinationAirport.code }
        : null,
      departureDate: routing.departureDate,
      departureTime: routing.departureTime,
      arrivalDate: routing.arrivalDate,
      arrivalTime: routing.arrivalTime,
    }
  })

  // Resolve project's own airports
  const projectOriginAirport = project.originAirportId
    ? airportMap.get(project.originAirportId)
    : null
  const projectDestinationAirport = project.destinationAirportId
    ? airportMap.get(project.destinationAirportId)
    : null

  return NextResponse.json({
    id: project.id,
    projectNumber: project.projectNumber,
    rfqId: rfqData?.id ?? null,
    rfqName: rfqData?.name ?? null,
    offerId: offerData?.id ?? null,
    offerName: offerData?.name ?? null,
    accountId: project.accountId ?? null,
    status: project.status,
    totalValue: project.totalValue ?? null,
    currencyCode: project.currencyCode,
    organizationId: project.organizationId,
    tenantId: project.tenantId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    // New fields for route, dates, AWBs, notes
    originAirportId: project.originAirportId ?? null,
    originAirport: projectOriginAirport
      ? { id: projectOriginAirport.id, code: projectOriginAirport.code, city: projectOriginAirport.city ?? null }
      : null,
    destinationAirportId: project.destinationAirportId ?? null,
    destinationAirport: projectDestinationAirport
      ? { id: projectDestinationAirport.id, code: projectDestinationAirport.code, city: projectDestinationAirport.city ?? null }
      : null,
    shipmentReadyDate: project.shipmentReadyDate ?? null,
    requiredDeliveryDate: project.requiredDeliveryDate ?? null,
    awbNumbers: project.awbNumbers ?? [],
    notes: project.notes ?? null,
    // Extended data for project detail view
    awbNumber: offerData?.awbNumber ?? null,
    offer: offerData,
    rfq: rfqData,
    airCargo: airCargoData,
    airRouting: airRoutingData,
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const body = await req.json()
  const validation = updateProjectSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.projectNumber !== undefined) project.projectNumber = data.projectNumber
  if (data.rfqId !== undefined) project.rfqId = data.rfqId ?? null
  if (data.offerId !== undefined) project.offerId = data.offerId ?? null
  if (data.accountId !== undefined) project.accountId = data.accountId ?? null
  if (data.status !== undefined) project.status = data.status
  if (data.totalValue !== undefined) project.totalValue = data.totalValue ?? null
  if (data.currencyCode !== undefined) project.currencyCode = data.currencyCode
  // New fields
  if (data.originAirportId !== undefined) project.originAirportId = data.originAirportId ?? null
  if (data.destinationAirportId !== undefined) project.destinationAirportId = data.destinationAirportId ?? null
  if (data.shipmentReadyDate !== undefined) {
    project.shipmentReadyDate = data.shipmentReadyDate ? new Date(data.shipmentReadyDate) : null
  }
  if (data.requiredDeliveryDate !== undefined) {
    project.requiredDeliveryDate = data.requiredDeliveryDate ? new Date(data.requiredDeliveryDate) : null
  }
  if (data.awbNumbers !== undefined) project.awbNumbers = data.awbNumbers ?? null
  if (data.notes !== undefined) project.notes = data.notes ?? null

  project.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: project.id, projectNumber: project.projectNumber })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Soft delete
  project.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
