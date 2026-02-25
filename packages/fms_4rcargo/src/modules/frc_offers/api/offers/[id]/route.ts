import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcOffer } from '../../../data/entities'
import { FrcRfq } from '../../../../frc_rfqs/data/entities'
import { updateOfferSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_offers.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
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
  if (!parse.success) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const offer = await em.findOne(FrcOffer, filters, {
    populate: ['airRouting', 'offerLines'],
  })

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Filter out deleted items
  const activeRouting = offer.airRouting.getItems().filter((r) => !r.deletedAt)
  const activeOfferLines = offer.offerLines.getItems().filter((l) => !l.deletedAt)

  // Collect all airport IDs (from RFQ and routing legs)
  const allAirportIds = new Set<string>()

  // Fetch RFQ data separately (no longer populate airports - they're UUIDs now)
  let rfqData: {
    id: string
    name: string
    originAirport: { id: string; code: string; city: string | null } | null
    destinationAirport: { id: string; code: string; city: string | null } | null
  } | null = null

  let rfq: typeof FrcRfq.prototype | null = null
  if (offer.rfqId) {
    rfq = await em.findOne(FrcRfq, { id: offer.rfqId })
    if (rfq) {
      if (rfq.originAirportId) allAirportIds.add(rfq.originAirportId)
      if (rfq.destinationAirportId) allAirportIds.add(rfq.destinationAirportId)
    }
  }

  // Collect routing airport IDs
  for (const routing of activeRouting) {
    if (routing.originAirportId) allAirportIds.add(routing.originAirportId)
    if (routing.destinationAirportId) allAirportIds.add(routing.destinationAirportId)
  }

  // Fetch all airports in one query
  const airportMap = new Map<string, { id: string; code: string; city: string | null }>()
  if (allAirportIds.size > 0) {
    const airports = await em.find(FmsLocation, {
      id: { $in: [...allAirportIds] },
      type: 'airport',
    })
    for (const airport of airports) {
      airportMap.set(airport.id, {
        id: airport.id,
        code: airport.code,
        city: airport.city ?? null,
      })
    }
  }

  // Build RFQ data with airports
  if (rfq) {
    rfqData = {
      id: rfq.id,
      name: rfq.name,
      originAirport: rfq.originAirportId ? airportMap.get(rfq.originAirportId) ?? null : null,
      destinationAirport: rfq.destinationAirportId
        ? airportMap.get(rfq.destinationAirportId) ?? null
        : null,
    }
  }

  return NextResponse.json({
    id: offer.id,
    name: offer.name,
    rfqId: rfqData?.id ?? null,
    rfqName: rfqData?.name ?? null,
    originAirport: rfqData?.originAirport ?? null,
    destinationAirport: rfqData?.destinationAirport ?? null,
    carrierId: offer.carrierId ?? null,
    status: offer.status,
    awbNumber: offer.awbNumber ?? null,
    connectionMethod: offer.connectionMethod ?? null,
    departureDate: offer.departureDate ?? null,
    connectionRatePerKg: offer.connectionRatePerKg ?? null,
    connectionRateTotal: offer.connectionRateTotal ?? null,
    airfreightRatePerKg: offer.airfreightRatePerKg ?? null,
    airfreightRateTotal: offer.airfreightRateTotal ?? null,
    totalRatePerKg: offer.totalRatePerKg ?? null,
    totalRate: offer.totalRate ?? null,
    currencyCode: offer.currencyCode,
    assignedToId: offer.assignedToId ?? null,
    validUntil: offer.validUntil ?? null,
    notes: offer.notes ?? null,
    organizationId: offer.organizationId,
    tenantId: offer.tenantId,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    airRouting: activeRouting.map((routing) => ({
      id: routing.id,
      name: routing.name,
      type: routing.type,
      flightNumber: routing.flightNumber ?? null,
      originAirport: routing.originAirportId ? airportMap.get(routing.originAirportId) ?? null : null,
      destinationAirport: routing.destinationAirportId
        ? airportMap.get(routing.destinationAirportId) ?? null
        : null,
      departureDate: routing.departureDate ?? null,
      departureTime: routing.departureTime ?? null,
      arrivalDate: routing.arrivalDate ?? null,
      arrivalTime: routing.arrivalTime ?? null,
    })),
    offerLines: activeOfferLines.map((line) => ({
      id: line.id,
      name: line.name,
      numberOfPieces: line.numberOfPieces,
      stackableType: line.stackableType,
      lengthCm: line.lengthCm ?? null,
      widthCm: line.widthCm ?? null,
      heightCm: line.heightCm ?? null,
      volumeM3: line.volumeM3,
      actualWeightKg: line.actualWeightKg,
      chargeableWeightKg: line.chargeableWeightKg,
      loadingMetres: line.loadingMetres,
    })),
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })

  const body = await req.json()
  const validation = updateOfferSchema.safeParse(body)
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

  const offer = await em.findOne(FrcOffer, filters)

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  // Also accept totalAmount from raw body as alias for totalRate
  const totalAmount = (body as Record<string, unknown>).totalAmount
  
  if (data.name !== undefined) offer.name = data.name
  if (data.carrierId !== undefined) offer.carrierId = data.carrierId ?? null
  if (data.status !== undefined) offer.status = data.status
  if (data.awbNumber !== undefined) offer.awbNumber = data.awbNumber ?? null
  if (data.connectionMethod !== undefined) offer.connectionMethod = data.connectionMethod ?? null
  if (data.departureDate !== undefined) offer.departureDate = data.departureDate ?? null
  if (data.connectionRatePerKg !== undefined) offer.connectionRatePerKg = data.connectionRatePerKg ?? null
  if (data.connectionRateTotal !== undefined) offer.connectionRateTotal = data.connectionRateTotal ?? null
  if (data.airfreightRatePerKg !== undefined) offer.airfreightRatePerKg = data.airfreightRatePerKg ?? null
  if (data.airfreightRateTotal !== undefined) offer.airfreightRateTotal = data.airfreightRateTotal ?? null
  if (data.totalRatePerKg !== undefined) offer.totalRatePerKg = data.totalRatePerKg ?? null
  if (data.totalRate !== undefined) offer.totalRate = data.totalRate ?? null
  // Handle totalAmount as alias for totalRate (frontend uses totalAmount)
  if (totalAmount !== undefined) {
    offer.totalRate = totalAmount === null ? null : String(totalAmount)
  }
  if (data.currencyCode !== undefined) offer.currencyCode = data.currencyCode
  if (data.assignedToId !== undefined) offer.assignedToId = data.assignedToId ?? null
  if (data.validUntil !== undefined) offer.validUntil = data.validUntil ?? null
  if (data.notes !== undefined) offer.notes = data.notes ?? null

  offer.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: offer.id, name: offer.name })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const offer = await em.findOne(FrcOffer, filters)

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Soft delete
  offer.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
