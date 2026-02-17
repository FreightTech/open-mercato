import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcOffer, FrcAirRouting } from '../../../../data/entities'
import { FrcRfq } from '../../../../../frc_rfqs/data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  daysAhead: z.coerce.number().min(1).max(30).optional().default(7),
  maxItems: z.coerce.number().min(1).max(20).optional().default(5),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'frc_offers.view'] },
}

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const url = new URL(req.url)
    const rawQuery: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) rawQuery[key] = value
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new CrudHttpError(400, { error: translate('frc_offers.errors.invalid_query', 'Invalid query parameters') })
    }

    const { em, tenantId, organizationIds } = await resolveWidgetScope(req, translate, {
      tenantId: parsed.data.tenantId ?? null,
      organizationId: parsed.data.organizationId ?? null,
    })

    const daysAhead = parsed.data.daysAhead
    const maxItems = parsed.data.maxItems

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const futureDate = new Date(today)
    futureDate.setDate(futureDate.getDate() + daysAhead)

    // Build base filter for air routings with departure in the specified period
    const routingWhere: FilterQuery<FrcAirRouting> = {
      tenantId,
      deletedAt: null,
      departureDate: { $gte: today, $lte: futureDate },
    }
    if (Array.isArray(organizationIds)) {
      routingWhere.organizationId = organizationIds.length === 1 
        ? organizationIds[0] 
        : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get upcoming routings with their offers (no longer populate airports - they're UUIDs now)
    const routings = await em.find(FrcAirRouting, routingWhere, {
      orderBy: { departureDate: 'asc' as const, departureTime: 'asc' as const },
      limit: maxItems * 2, // Get more to filter out deleted offers
      populate: ['offer'],
    })

    // Collect all airport IDs from routings
    const airportIds = routings
      .flatMap((r) => [r.originAirportId, r.destinationAirportId])
      .filter((id): id is string => Boolean(id))

    const airports =
      airportIds.length > 0
        ? await em.find(FmsLocation, { id: { $in: [...new Set(airportIds)] }, type: 'airport' })
        : []
    const airportMap = new Map(airports.map((a) => [a.id, a]))

    // Get account names for offers
    const rfqIds = routings
      .map(r => r.offer?.rfqId)
      .filter((id): id is string => !!id)

    const rfqs = rfqIds.length > 0 
      ? await em.find(FrcRfq, { id: { $in: rfqIds }, deletedAt: null })
      : []
    const rfqMap = new Map(rfqs.map(r => [r.id, r]))

    // Build departures list
    const departures: Array<{
      offerId: string
      offerName: string
      routingId: string
      origin: string
      destination: string
      departureDate: string
      departureTime: string | null
      flightNumber: string | null
      accountName: string | null
    }> = []

    for (const routing of routings) {
      if (!routing.offer || routing.offer.deletedAt) continue
      if (departures.length >= maxItems) break

      const rfq = rfqMap.get(routing.offer.rfqId)
      const originAirport = routing.originAirportId ? airportMap.get(routing.originAirportId) : null
      const destinationAirport = routing.destinationAirportId ? airportMap.get(routing.destinationAirportId) : null
      
      departures.push({
        offerId: routing.offer.id,
        offerName: routing.offer.name,
        routingId: routing.id,
        origin: originAirport?.code ?? '-',
        destination: destinationAirport?.code ?? '-',
        departureDate: routing.departureDate?.toISOString().split('T')[0] ?? '',
        departureTime: routing.departureTime ?? null,
        flightNumber: routing.flightNumber ?? null,
        accountName: rfq?.name ?? null,
      })
    }

    return NextResponse.json({
      departures,
      totalCount: departures.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('frc_offers.widgets.upcomingDepartures failed', err)
    return NextResponse.json(
      { error: translate('frc_offers.widgets.upcomingDepartures.error', 'Failed to load upcoming departures data') },
      { status: 500 },
    )
  }
}

const upcomingDeparturesResponseSchema = z.object({
  departures: z.array(z.object({
    offerId: z.string().uuid(),
    offerName: z.string(),
    routingId: z.string().uuid(),
    origin: z.string(),
    destination: z.string(),
    departureDate: z.string(),
    departureTime: z.string().nullable(),
    flightNumber: z.string().nullable(),
    accountName: z.string().nullable(),
  })),
  totalCount: z.number(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Offers',
  summary: 'Upcoming departures widget',
  methods: {
    GET: {
      summary: 'Fetch upcoming departures',
      description: 'Returns upcoming flight departures within the specified period for the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: upcomingDeparturesResponseSchema,
        },
      ],
      errors: [
        { status: 400, description: 'Invalid query parameters', schema: z.object({ error: z.string() }) },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
        { status: 500, description: 'Widget failed to load', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
