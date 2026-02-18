import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcOffer, FrcAirRouting } from '../../../../data/entities'
import { createAirRoutingSchema } from '../../../../data/validators'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
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

export async function POST(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })

  const body = await req.json()
  
  // Merge offerId from URL params
  const validation = createAirRoutingSchema.safeParse({
    ...body,
    offerId: parse.data.id,
    name: body.name || 'New Routing', // Will be auto-generated below
  })
  
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

  // Fetch airport codes for name generation
  const airportIds = [validation.data.originAirportId, validation.data.destinationAirportId].filter(
    (id): id is string => Boolean(id)
  )
  
  let originCode: string | null = null
  let destinationCode: string | null = null
  
  if (airportIds.length > 0) {
    const airports = await em.find(FmsLocation, { id: { $in: airportIds }, type: 'airport' })
    const airportMap = new Map(airports.map((a) => [a.id, a]))
    originCode = validation.data.originAirportId
      ? airportMap.get(validation.data.originAirportId)?.code ?? null
      : null
    destinationCode = validation.data.destinationAirportId
      ? airportMap.get(validation.data.destinationAirportId)?.code ?? null
      : null
  }

  // Generate routing name
  const routingName = generateRoutingName(originCode, destinationCode, validation.data.departureDate ?? null)

  // Create the routing leg
  const routing = new FrcAirRouting()
  routing.organizationId = offer.organizationId
  routing.tenantId = offer.tenantId
  routing.offer = em.getReference(FrcOffer, offer.id)
  routing.name = routingName
  routing.type = validation.data.type
  routing.carrierId = validation.data.carrierId ?? null
  routing.carrierType = validation.data.carrierType ?? null
  routing.flightNumber = validation.data.flightNumber ?? null
  routing.originAirportId = validation.data.originAirportId ?? null
  routing.destinationAirportId = validation.data.destinationAirportId ?? null
  routing.departureDate = validation.data.departureDate ?? null
  routing.departureTime = validation.data.departureTime ?? null
  routing.arrivalDate = validation.data.arrivalDate ?? null
  routing.arrivalTime = validation.data.arrivalTime ?? null
  routing.connectionRateTotal = validation.data.connectionRateTotal ?? null
  routing.currencyCode = validation.data.currencyCode

  em.persist(routing)
  await em.flush()

  return NextResponse.json({
    id: routing.id,
    name: routing.name,
    type: routing.type,
    flightNumber: routing.flightNumber,
    originAirport: originCode ? { id: validation.data.originAirportId, code: originCode } : null,
    destinationAirport: destinationCode ? { id: validation.data.destinationAirportId, code: destinationCode } : null,
    departureDate: routing.departureDate,
    departureTime: routing.departureTime,
    arrivalDate: routing.arrivalDate,
    arrivalTime: routing.arrivalTime,
  }, { status: 201 })
}
