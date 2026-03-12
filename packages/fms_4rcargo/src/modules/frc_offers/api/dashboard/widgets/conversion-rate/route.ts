import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FrcOffer } from '../../../../data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  dateRange: z.enum(['last7', 'last30', 'last90', 'thisMonth', 'thisQuarter']).optional().default('last30'),
  showComparison: z.string().optional().transform(v => v === 'true'),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'frc_offers.view'] },
}

function getDateRange(preset: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)
  let start: Date

  switch (preset) {
    case 'last7':
      start = new Date(now)
      start.setDate(start.getDate() - 7)
      break
    case 'last30':
      start = new Date(now)
      start.setDate(start.getDate() - 30)
      break
    case 'last90':
      start = new Date(now)
      start.setDate(start.getDate() - 90)
      break
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'thisQuarter':
      const quarter = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), quarter * 3, 1)
      break
    default:
      start = new Date(now)
      start.setDate(start.getDate() - 30)
  }

  return { start, end }
}

function getPreviousDateRange(preset: string): { start: Date; end: Date } {
  const current = getDateRange(preset)
  const diff = current.end.getTime() - current.start.getTime()
  return {
    start: new Date(current.start.getTime() - diff),
    end: new Date(current.start.getTime() - 1),
  }
}

function calculateConversionRate(booked: number, rejected: number, expired: number): number {
  const completed = booked + rejected + expired
  if (completed === 0) return 0
  return Math.round((booked / completed) * 1000) / 10 // Round to 1 decimal place
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

    const dateRange = getDateRange(parsed.data.dateRange)
    const showComparison = parsed.data.showComparison

    // Build base filter for completed offers (booked, rejected, expired)
    const baseWhere: FilterQuery<FrcOffer> = {
      tenantId,
      deletedAt: null,
      status: { $in: ['booked', 'rejected', 'expired'] },
      createdAt: { $gte: dateRange.start, $lte: dateRange.end },
    }
    if (Array.isArray(organizationIds)) {
      baseWhere.organizationId = organizationIds.length === 1 
        ? organizationIds[0] 
        : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get offers
    const offers = await em.find(FrcOffer, baseWhere)

    // Count by status
    let booked = 0
    let rejected = 0
    let expired = 0

    for (const offer of offers) {
      switch (offer.status) {
        case 'booked':
          booked++
          break
        case 'rejected':
          rejected++
          break
        case 'expired':
          expired++
          break
      }
    }

    const total = booked + rejected + expired
    const rate = calculateConversionRate(booked, rejected, expired)

    // Calculate comparison if requested
    let comparison: { previousRate: number; change: number; direction: 'up' | 'down' | 'stable' } | undefined
    if (showComparison) {
      const prevRange = getPreviousDateRange(parsed.data.dateRange)
      const prevWhere: FilterQuery<FrcOffer> = {
        tenantId,
        deletedAt: null,
        status: { $in: ['booked', 'rejected', 'expired'] },
        createdAt: { $gte: prevRange.start, $lte: prevRange.end },
      }
      if (Array.isArray(organizationIds)) {
        prevWhere.organizationId = organizationIds.length === 1 
          ? organizationIds[0] 
          : { $in: Array.from(new Set(organizationIds)) }
      }

      const prevOffers = await em.find(FrcOffer, prevWhere)
      let prevBooked = 0
      let prevRejected = 0
      let prevExpired = 0

      for (const offer of prevOffers) {
        switch (offer.status) {
          case 'booked':
            prevBooked++
            break
          case 'rejected':
            prevRejected++
            break
          case 'expired':
            prevExpired++
            break
        }
      }

      const previousRate = calculateConversionRate(prevBooked, prevRejected, prevExpired)
      const change = Math.round((rate - previousRate) * 10) / 10
      const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'stable'

      comparison = { previousRate, change: Math.abs(change), direction }
    }

    return NextResponse.json({
      booked,
      rejected,
      expired,
      total,
      rate,
      comparison,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('frc_offers.widgets.conversionRate failed', err)
    return NextResponse.json(
      { error: translate('frc_offers.widgets.conversionRate.error', 'Failed to load offer conversion data') },
      { status: 500 },
    )
  }
}

const conversionRateResponseSchema = z.object({
  booked: z.number(),
  rejected: z.number(),
  expired: z.number(),
  total: z.number(),
  rate: z.number(),
  comparison: z.object({
    previousRate: z.number(),
    change: z.number(),
    direction: z.enum(['up', 'down', 'stable']),
  }).optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Offers',
  summary: 'Offer conversion rate widget',
  methods: {
    GET: {
      summary: 'Fetch offer conversion rate metrics',
      description: 'Returns conversion rate and breakdown of offers by final status within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: conversionRateResponseSchema,
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
