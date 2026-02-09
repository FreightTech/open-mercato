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

    // Build base filter
    // Only count offers with status 'draft' as unsent
    const baseWhere: FilterQuery<FmsOffer> = {
      tenantId,
      deletedAt: null,
      status: 'draft',
    }
    if (Array.isArray(organizationIds)) {
      baseWhere.organizationId = organizationIds.length === 1 ? organizationIds[0] : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get current unsent offers
    const unsentOffers = await em.find(FmsOffer, baseWhere, {
      orderBy: { createdAt: 'asc' as const },
      populate: ['rfq', 'calculations', 'calculations.lines'],
    })

    // Get previous count (7 days ago)
    const previousWhere: FilterQuery<FmsOffer> = {
      tenantId,
      deletedAt: null,
      status: 'draft',
      createdAt: { $lte: sevenDaysAgo },
    }
    if (Array.isArray(organizationIds)) {
      previousWhere.organizationId = organizationIds.length === 1 ? organizationIds[0] : { $in: Array.from(new Set(organizationIds)) }
    }
    const previousCount = await em.count(FmsOffer, previousWhere)

    // Calculate metrics
    const count = unsentOffers.length
    let maxLagMs: number | null = null
    let maxLagOfferId: string | null = null
    let totalValue = 0
    let currencyCode: string | null = null

    if (unsentOffers.length > 0) {
      // Find oldest offer (first in sorted array)
      const oldestOffer = unsentOffers[0]
      maxLagMs = now.getTime() - oldestOffer.createdAt.getTime()
      maxLagOfferId = oldestOffer.id

      // Calculate total value from offer calculation lines
      for (const offer of unsentOffers) {
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
    console.error('fms_offers.widgets.unsentOffers failed', err)
    return NextResponse.json(
      { error: translate('fms_offers.widgets.unsentOffers.error', 'Failed to load unsent offers data') },
      { status: 500 },
    )
  }
}

const unsentOffersResponseSchema = z.object({
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
  summary: 'Unsent offers widget',
  methods: {
    GET: {
      summary: 'Fetch unsent offers metrics',
      description: 'Returns count, max lag time, and trend for unsent offers within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: unsentOffersResponseSchema,
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
