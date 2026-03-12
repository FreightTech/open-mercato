import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcOffer, FrcAirRouting } from '../../../../../data/entities'
import { updateAirRoutingSchema } from '../../../../../data/validators'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
  routingId: z.string().uuid(),
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

function generateRoutingName(
  originCode: string | null,
  destinationCode: string | null,
  departureDate: Date | string | null
): string {
  const origin = originCode || '???'
  const destination = destinationCode || '???'
  const dateStr = departureDate
    ? new Date(departureDate).toISOString().split('T')[0]
    : 'TBD'
  return `${origin}/${destination}/${dateStr}`
}

export async function PUT(
  req: Request,
  ctx: { params?: Promise<{ id?: string; routingId?: string }> }
) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, routingId: params?.routingId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const body = await req.json()
  const validation = updateAirRoutingSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify the offer exists and user has access
  const offer = await em.findOne(FrcOffer, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Find the routing leg
  const routing = await em.findOne(FrcAirRouting, {
    id: parse.data.routingId,
    offer: { id: offer.id },
    deletedAt: null,
  })

  if (!routing) return NextResponse.json({ error: 'Routing leg not found' }, { status: 404 })

  const data = validation.data

  // Track if we need to regenerate the name
  let shouldRegenerateName = false
  let originAirportId = routing.originAirportId
  let destinationAirportId = routing.destinationAirportId
  let departureDate = routing.departureDate

  // Update fields
  if (data.carrierId !== undefined) routing.carrierId = data.carrierId ?? null
  if (data.carrierType !== undefined) routing.carrierType = data.carrierType ?? null
  if (data.flightNumber !== undefined) routing.flightNumber = data.flightNumber ?? null
  if (data.type !== undefined) routing.type = data.type
  if (data.originAirportId !== undefined) {
    routing.originAirportId = data.originAirportId ?? null
    originAirportId = data.originAirportId ?? null
    shouldRegenerateName = true
  }
  if (data.destinationAirportId !== undefined) {
    routing.destinationAirportId = data.destinationAirportId ?? null
    destinationAirportId = data.destinationAirportId ?? null
    shouldRegenerateName = true
  }
  if (data.departureDate !== undefined) {
    routing.departureDate = data.departureDate ?? null
    departureDate = data.departureDate ?? null
    shouldRegenerateName = true
  }
  if (data.departureTime !== undefined) routing.departureTime = data.departureTime ?? null
  if (data.arrivalDate !== undefined) routing.arrivalDate = data.arrivalDate ?? null
  if (data.arrivalTime !== undefined) routing.arrivalTime = data.arrivalTime ?? null
  if (data.connectionRateTotal !== undefined) routing.connectionRateTotal = data.connectionRateTotal ?? null
  if (data.currencyCode !== undefined) routing.currencyCode = data.currencyCode

  // Regenerate name if needed
  if (shouldRegenerateName) {
    const airportIds = [originAirportId, destinationAirportId].filter(
      (id): id is string => Boolean(id)
    )

    let originCode: string | null = null
    let destinationCode: string | null = null

    if (airportIds.length > 0) {
      const airports = await em.find(FmsLocation, { id: { $in: airportIds }, type: 'airport' })
      const airportMap = new Map(airports.map((a) => [a.id, a]))
      originCode = originAirportId ? airportMap.get(originAirportId)?.code ?? null : null
      destinationCode = destinationAirportId ? airportMap.get(destinationAirportId)?.code ?? null : null
    }

    routing.name = generateRoutingName(originCode, destinationCode, departureDate ?? null)
  }

  routing.updatedAt = new Date()

  await em.flush()

  // Fetch airport data for response
  const airportIds = [routing.originAirportId, routing.destinationAirportId].filter(
    (id): id is string => Boolean(id)
  )
  
  let originAirport: { id: string; code: string } | null = null
  let destinationAirport: { id: string; code: string } | null = null

  if (airportIds.length > 0) {
    const airports = await em.find(FmsLocation, { id: { $in: airportIds }, type: 'airport' })
    const airportMap = new Map(airports.map((a) => [a.id, a]))
    
    if (routing.originAirportId) {
      const origin = airportMap.get(routing.originAirportId)
      if (origin) originAirport = { id: origin.id, code: origin.code }
    }
    if (routing.destinationAirportId) {
      const dest = airportMap.get(routing.destinationAirportId)
      if (dest) destinationAirport = { id: dest.id, code: dest.code }
    }
  }

  return NextResponse.json({
    id: routing.id,
    name: routing.name,
    type: routing.type,
    flightNumber: routing.flightNumber,
    originAirport,
    destinationAirport,
    departureDate: routing.departureDate,
    departureTime: routing.departureTime,
    arrivalDate: routing.arrivalDate,
    arrivalTime: routing.arrivalTime,
  })
}

export async function DELETE(
  req: Request,
  ctx: { params?: Promise<{ id?: string; routingId?: string }> }
) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, routingId: params?.routingId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify the offer exists and user has access
  const offer = await em.findOne(FrcOffer, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Find the routing leg
  const routing = await em.findOne(FrcAirRouting, {
    id: parse.data.routingId,
    offer: { id: offer.id },
    deletedAt: null,
  })

  if (!routing) return NextResponse.json({ error: 'Routing leg not found' }, { status: 404 })

  // Soft delete
  routing.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
