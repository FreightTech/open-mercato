import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsOffer } from '../../../../data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'fms_offers.offers.view'] },
}

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const url = new URL(req.url)
    const rawQuery: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) rawQuery[key] = value
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new CrudHttpError(400, { error: translate('fms_offers.errors.invalid_query', 'Invalid query parameters') })
    }

    const { em, tenantId, organizationIds } = await resolveWidgetScope(req, translate, {
      tenantId: parsed.data.tenantId ?? null,
      organizationId: parsed.data.organizationId ?? null,
    })

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Build base filter for sent offers pending response
    // Status 'sent' = sent but not yet accepted/declined
    const baseWhere: FilterQuery<FmsOffer> = {
      tenantId,
      deletedAt: null,
      status: 'sent',
    }
    if (Array.isArray(organizationIds)) {
      baseWhere.organizationId = organizationIds.length === 1 ? organizationIds[0] : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get current pending response offers
    const pendingOffers = await em.find(FmsOffer, baseWhere, {
      orderBy: { sentAt: 'asc' as const },
      populate: ['rfq', 'calculations', 'calculations.lines'],
    })

    // Get previous count (7 days ago)
    const previousWhere: FilterQuery<FmsOffer> = {
      tenantId,
      deletedAt: null,
      status: 'sent',
      createdAt: { $lte: sevenDaysAgo },
    }
    if (Array.isArray(organizationIds)) {
      previousWhere.organizationId = organizationIds.length === 1 ? organizationIds[0] : { $in: Array.from(new Set(organizationIds)) }
    }
    const previousCount = await em.count(FmsOffer, previousWhere)

    // Calculate metrics
    const count = pendingOffers.length
    let maxLagMs: number | null = null
    let maxLagOfferId: string | null = null
    let totalValue = 0
    let currencyCode: string | null = null

    if (pendingOffers.length > 0) {
      // Find oldest offer by sentAt (first in sorted array)
      const oldestOffer = pendingOffers[0]
      if (oldestOffer.sentAt) {
        maxLagMs = now.getTime() - oldestOffer.sentAt.getTime()
        maxLagOfferId = oldestOffer.id
      }

      // Calculate total value from offer calculation lines
      for (const offer of pendingOffers) {
        const allLines = offer.calculations?.getItems().flatMap(c => c.lines?.getItems() || []) || []
        for (const line of allLines) {
          if (!line.deletedAt && line.isEnabled) {
            if (line.currencyCode && !currencyCode) {
              currencyCode = line.currencyCode
            }
            if (line.currencyCode === currencyCode) {
              totalValue += parseFloat(String(line.sellPrice)) || 0
            }
          }
        }
      }
    }

    // Determine trend
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (count > previousCount) {
      trend = 'up'
    } else if (count < previousCount) {
      trend = 'down'
    }

    return NextResponse.json({
      count,
      maxLagMs,
      maxLagOfferId,
      totalValue: totalValue > 0 ? totalValue : null,
      currencyCode,
      previousCount,
      trend,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('fms_offers.widgets.pendingResponseOffers failed', err)
    return NextResponse.json(
      { error: translate('fms_offers.widgets.pendingResponseOffers.error', 'Failed to load pending response offers data') },
      { status: 500 },
    )
  }
}

const pendingResponseOffersResponseSchema = z.object({
  count: z.number(),
  maxLagMs: z.number().nullable(),
  maxLagOfferId: z.string().uuid().nullable(),
  totalValue: z.number().nullable(),
  currencyCode: z.string().nullable(),
  previousCount: z.number(),
  trend: z.enum(['up', 'down', 'stable']),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'Pending response offers widget',
  methods: {
    GET: {
      summary: 'Fetch pending response offers metrics',
      description: 'Returns count, max lag time, and trend for sent offers pending customer response within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: pendingResponseOffersResponseSchema,
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
