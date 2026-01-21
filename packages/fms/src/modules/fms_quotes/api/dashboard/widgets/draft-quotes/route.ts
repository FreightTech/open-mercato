import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsQuote } from '../../../../data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'fms_quotes.quotes.view'] },
}

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const url = new URL(req.url)
    const rawQuery: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) rawQuery[key] = value
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new CrudHttpError(400, { error: translate('fms_quotes.errors.invalid_query', 'Invalid query parameters') })
    }

    const { em, tenantId, organizationIds } = await resolveWidgetScope(req, translate, {
      tenantId: parsed.data.tenantId ?? null,
      organizationId: parsed.data.organizationId ?? null,
    })

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Build base filter
    const baseWhere: FilterQuery<FmsQuote> = {
      tenantId,
      deletedAt: null,
      status: 'draft',
    }
    if (Array.isArray(organizationIds)) {
      baseWhere.organizationId = organizationIds.length === 1 ? organizationIds[0] : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get current draft quotes
    const draftQuotes = await em.find(FmsQuote, baseWhere, {
      orderBy: { createdAt: 'asc' as const },
    })

    // Get previous count (7 days ago)
    const previousWhere: FilterQuery<FmsQuote> = {
      tenantId,
      deletedAt: null,
      status: 'draft',
      createdAt: { $lte: sevenDaysAgo },
    }
    if (Array.isArray(organizationIds)) {
      previousWhere.organizationId = organizationIds.length === 1 ? organizationIds[0] : { $in: Array.from(new Set(organizationIds)) }
    }
    const previousCount = await em.count(FmsQuote, previousWhere)

    // Calculate metrics
    const count = draftQuotes.length
    let maxLagMs: number | null = null
    let maxLagQuoteId: string | null = null
    let totalValue = 0
    let currencyCode: string | null = null

    if (draftQuotes.length > 0) {
      // Find oldest quote (first in sorted array)
      const oldestQuote = draftQuotes[0]
      maxLagMs = now.getTime() - oldestQuote.createdAt.getTime()
      maxLagQuoteId = oldestQuote.id

      // Calculate total value (sum of all quote lines would be better, but this is simpler for now)
      // We'll just use the first currency we find
      for (const quote of draftQuotes) {
        if (quote.currencyCode && !currencyCode) {
          currencyCode = quote.currencyCode
        }
        // Note: We don't have a totalAmount field on FmsQuote, so we'd need to aggregate lines
        // For now, we'll skip the total value calculation
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
      maxLagQuoteId,
      totalValue: null, // We'll calculate this properly if needed
      currencyCode,
      previousCount,
      trend,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('fms_quotes.widgets.draftQuotes failed', err)
    return NextResponse.json(
      { error: translate('fms_quotes.widgets.draftQuotes.error', 'Failed to load draft quotes data') },
      { status: 500 },
    )
  }
}

const draftQuotesResponseSchema = z.object({
  count: z.number(),
  maxLagMs: z.number().nullable(),
  maxLagQuoteId: z.string().uuid().nullable(),
  totalValue: z.number().nullable(),
  currencyCode: z.string().nullable(),
  previousCount: z.number(),
  trend: z.enum(['up', 'down', 'stable']),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Quotes',
  summary: 'Draft quotes widget',
  methods: {
    GET: {
      summary: 'Fetch draft quotes metrics',
      description: 'Returns count, max lag time, and trend for draft quotes within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: draftQuotesResponseSchema,
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
