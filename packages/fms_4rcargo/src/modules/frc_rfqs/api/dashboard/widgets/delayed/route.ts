import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FrcRfq } from '../../../../data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'frc_rfqs.view'] },
}

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const url = new URL(req.url)
    const rawQuery: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) rawQuery[key] = value
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new CrudHttpError(400, { error: translate('frc_rfqs.errors.invalid_query', 'Invalid query parameters') })
    }

    const { em, tenantId, organizationIds } = await resolveWidgetScope(req, translate, {
      tenantId: parsed.data.tenantId ?? null,
      organizationId: parsed.data.organizationId ?? null,
    })

    // Build base filter for delayed RFQs
    // Delayed means: isDelayed = true OR deliveryStatus = 'in_transit_delayed'
    const baseWhere: FilterQuery<FrcRfq> = {
      tenantId,
      deletedAt: null,
      $or: [
        { isDelayed: true },
        { deliveryStatus: 'in_transit_delayed' },
      ],
    }
    if (Array.isArray(organizationIds)) {
      baseWhere.organizationId = organizationIds.length === 1 
        ? organizationIds[0] 
        : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get delayed RFQs
    const delayedRfqs = await em.find(FrcRfq, baseWhere, {
      orderBy: { requestDate: 'asc' as const },
    })

    // Calculate metrics
    const count = delayedRfqs.length
    let isDelayedCount = 0
    let inTransitDelayedCount = 0
    let totalValue = 0
    let currencyCode: string | null = null
    let oldest: { id: string; name: string; daysDelayed: number } | null = null

    const now = new Date()

    for (const rfq of delayedRfqs) {
      // Count by type
      if (rfq.isDelayed) {
        isDelayedCount++
      }
      if (rfq.deliveryStatus === 'in_transit_delayed') {
        inTransitDelayedCount++
      }

      // Total value
      if (rfq.amount) {
        const amountValue = parseFloat(String(rfq.amount))
        if (!isNaN(amountValue)) {
          if (!currencyCode) {
            currencyCode = rfq.currencyCode
          }
          if (rfq.currencyCode === currencyCode) {
            totalValue += amountValue
          }
        }
      }

      // Find oldest
      if (rfq.requestDate) {
        const daysDelayed = Math.floor((now.getTime() - new Date(rfq.requestDate).getTime()) / (24 * 60 * 60 * 1000))
        if (!oldest || daysDelayed > oldest.daysDelayed) {
          oldest = {
            id: rfq.id,
            name: rfq.name,
            daysDelayed,
          }
        }
      }
    }

    return NextResponse.json({
      count,
      byStatus: {
        isDelayed: isDelayedCount,
        inTransitDelayed: inTransitDelayedCount,
      },
      oldest,
      totalValue: totalValue > 0 ? totalValue : null,
      currencyCode,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('frc_rfqs.widgets.delayed failed', err)
    return NextResponse.json(
      { error: translate('frc_rfqs.widgets.delayed.error', 'Failed to load delayed shipments data') },
      { status: 500 },
    )
  }
}

const delayedResponseSchema = z.object({
  count: z.number(),
  byStatus: z.object({
    isDelayed: z.number(),
    inTransitDelayed: z.number(),
  }),
  oldest: z.object({
    id: z.string().uuid(),
    name: z.string(),
    daysDelayed: z.number(),
  }).nullable(),
  totalValue: z.number().nullable(),
  currencyCode: z.string().nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo RFQs',
  summary: 'Delayed shipments widget',
  methods: {
    GET: {
      summary: 'Fetch delayed shipments metrics',
      description: 'Returns count and details for delayed RFQs within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: delayedResponseSchema,
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
