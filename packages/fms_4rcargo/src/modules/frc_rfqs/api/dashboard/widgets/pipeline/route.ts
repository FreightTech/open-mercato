import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FrcRfq } from '../../../../data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'
import { FRC_SALES_STAGES, type FrcSalesStage } from '../../../../../../lib/types'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  dateRange: z.enum(['last7', 'last30', 'last90', 'thisMonth', 'thisQuarter']).optional().default('last30'),
  showComparison: z.string().optional().transform(v => v === 'true'),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'frc_rfqs.view'] },
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

    const dateRange = getDateRange(parsed.data.dateRange)
    const showComparison = parsed.data.showComparison

    // Build base filter
    const baseWhere: FilterQuery<FrcRfq> = {
      tenantId,
      deletedAt: null,
      requestDate: { $gte: dateRange.start, $lte: dateRange.end },
    }
    if (Array.isArray(organizationIds)) {
      baseWhere.organizationId = organizationIds.length === 1 
        ? organizationIds[0] 
        : { $in: Array.from(new Set(organizationIds)) }
    }

    // Get RFQs
    const rfqs = await em.find(FrcRfq, baseWhere)

    // Aggregate by sales stage
    const stageMap = new Map<FrcSalesStage, { count: number; totalValue: number }>()
    for (const stage of FRC_SALES_STAGES) {
      stageMap.set(stage, { count: 0, totalValue: 0 })
    }

    let currencyCode: string | null = null
    let totalCount = 0
    let totalValue = 0

    for (const rfq of rfqs) {
      const stageData = stageMap.get(rfq.salesStage)
      if (stageData) {
        stageData.count++
        totalCount++
        
        if (rfq.amount) {
          const amountValue = parseFloat(String(rfq.amount))
          if (!isNaN(amountValue)) {
            if (!currencyCode) {
              currencyCode = rfq.currencyCode
            }
            if (rfq.currencyCode === currencyCode) {
              stageData.totalValue += amountValue
              totalValue += amountValue
            }
          }
        }
      }
    }

    const stages = FRC_SALES_STAGES.map(stage => ({
      stage,
      count: stageMap.get(stage)?.count ?? 0,
      totalValue: stageMap.get(stage)?.totalValue ?? 0,
    }))

    // Calculate comparison if requested
    let comparison: { previousCount: number; change: number; direction: 'up' | 'down' | 'stable' } | undefined
    if (showComparison) {
      const prevRange = getPreviousDateRange(parsed.data.dateRange)
      const prevWhere: FilterQuery<FrcRfq> = {
        tenantId,
        deletedAt: null,
        requestDate: { $gte: prevRange.start, $lte: prevRange.end },
      }
      if (Array.isArray(organizationIds)) {
        prevWhere.organizationId = organizationIds.length === 1 
          ? organizationIds[0] 
          : { $in: Array.from(new Set(organizationIds)) }
      }

      const previousCount = await em.count(FrcRfq, prevWhere)
      const change = totalCount - previousCount
      const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'stable'

      comparison = { previousCount, change: Math.abs(change), direction }
    }

    return NextResponse.json({
      stages,
      totals: { count: totalCount, value: totalValue },
      currencyCode,
      comparison,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('frc_rfqs.widgets.pipeline failed', err)
    return NextResponse.json(
      { error: translate('frc_rfqs.widgets.pipeline.error', 'Failed to load RFQ pipeline data') },
      { status: 500 },
    )
  }
}

const pipelineResponseSchema = z.object({
  stages: z.array(z.object({
    stage: z.enum(['received', 'quote_sent', 'quote_accepted', 'closed_lost']),
    count: z.number(),
    totalValue: z.number(),
  })),
  totals: z.object({
    count: z.number(),
    value: z.number(),
  }),
  currencyCode: z.string().nullable(),
  comparison: z.object({
    previousCount: z.number(),
    change: z.number(),
    direction: z.enum(['up', 'down', 'stable']),
  }).optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo RFQs',
  summary: 'RFQ pipeline widget',
  methods: {
    GET: {
      summary: 'Fetch RFQ pipeline metrics',
      description: 'Returns RFQ counts and values grouped by sales stage within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: pipelineResponseSchema,
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
