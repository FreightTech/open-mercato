import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FrcQuote, FrcAirRouting } from '../../../../data/entities'
import { FrcAirport } from '../../../../../frc_airports/data/entities'
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
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'frc_quotes.view'] },
}

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const url = new URL(req.url)
    const rawQuery: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) rawQuery[key] = value
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new CrudHttpError(400, { error: translate('frc_quotes.errors.invalid_query', 'Invalid query parameters') })
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

    // Get upcoming routings with their quotes
    const routings = await em.find(FrcAirRouting, routingWhere, {
      orderBy: { departureDate: 'asc' as const, departureTime: 'asc' as const },
      limit: maxItems * 2, // Get more to filter out deleted quotes
      populate: ['quote', 'originAirport', 'destinationAirport'],
    })

    // Get account names for quotes
    const rfqIds = routings
      .map(r => r.quote?.rfqId)
      .filter((id): id is string => !!id)

    const rfqs = rfqIds.length > 0 
      ? await em.find(FrcRfq, { id: { $in: rfqIds }, deletedAt: null })
      : []
    const rfqMap = new Map(rfqs.map(r => [r.id, r]))

    // Build departures list
    const departures: Array<{
      quoteId: string
      quoteName: string
      routingId: string
      origin: string
      destination: string
      departureDate: string
      departureTime: string | null
      flightNumber: string | null
      accountName: string | null
    }> = []

    for (const routing of routings) {
      if (!routing.quote || routing.quote.deletedAt) continue
      if (departures.length >= maxItems) break

      const rfq = rfqMap.get(routing.quote.rfqId)
      
      departures.push({
        quoteId: routing.quote.id,
        quoteName: routing.quote.name,
        routingId: routing.id,
        origin: routing.originAirport?.code ?? '-',
        destination: routing.destinationAirport?.code ?? '-',
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
    console.error('frc_quotes.widgets.upcomingDepartures failed', err)
    return NextResponse.json(
      { error: translate('frc_quotes.widgets.upcomingDepartures.error', 'Failed to load upcoming departures data') },
      { status: 500 },
    )
  }
}

const upcomingDeparturesResponseSchema = z.object({
  departures: z.array(z.object({
    quoteId: z.string().uuid(),
    quoteName: z.string(),
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
  tag: '4R Cargo Quotes',
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
