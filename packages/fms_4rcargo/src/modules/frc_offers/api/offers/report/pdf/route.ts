import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FrcOffer } from '../../../../data/entities'
import { FrcRfq } from '../../../../../frc_rfqs/data/entities'
import {
  generateOffersReportPdf,
  type ReportColumn,
  type OfferReportRow,
} from '../../../../lib/offers-report-pdf.service'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['frc_offers.view'],
  },
}

const filterRowSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.unknown(),
})

const sortRuleSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
})

const columnSchema = z.object({
  data: z.string(),
  title: z.string(),
  width: z.number().optional(),
})

const reportRequestSchema = z.object({
  filters: z.array(filterRowSchema).optional(),
  sorting: z.array(sortRuleSchema).optional(),
  columns: z.array(columnSchema),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  perspectiveName: z.string().optional(),
})

export const openApi = {
  post: {
    tags: ['FRC Offers'],
    operationId: 'generateOffersReportPdf',
    summary: 'Generate PDF report of offers',
    description:
      'Generates a PDF report containing offers matching the provided filters and date range. Returns the PDF as a downloadable file.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              filters: {
                type: 'array',
                description: 'Perspective filters to apply',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    operator: { type: 'string' },
                    value: {},
                  },
                },
              },
              sorting: {
                type: 'array',
                description: 'Sorting rules',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    direction: { type: 'string', enum: ['asc', 'desc'] },
                  },
                },
              },
              columns: {
                type: 'array',
                description: 'Columns to include in the report',
                items: {
                  type: 'object',
                  required: ['data', 'title'],
                  properties: {
                    data: { type: 'string' },
                    title: { type: 'string' },
                    width: { type: 'number' },
                  },
                },
              },
              dateFrom: {
                type: 'string',
                format: 'date',
                description: 'Start date for created_at filter (ISO format)',
              },
              dateTo: {
                type: 'string',
                format: 'date',
                description: 'End date for created_at filter (ISO format)',
              },
              perspectiveName: {
                type: 'string',
                description: 'Name of the perspective for the report header',
              },
            },
            required: ['columns'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'PDF report generated successfully',
        content: {
          'application/pdf': {
            schema: { type: 'string', format: 'binary' },
          },
        },
      },
      400: { description: 'Invalid request parameters' },
      401: { description: 'Unauthorized' },
      500: { description: 'Server error during PDF generation' },
    },
  },
}

const MAX_REPORT_ROWS = 1000

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

type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'

function applyPerspectiveFilters(
  baseFilters: Record<string, unknown>,
  perspectiveFilters: Array<{ field: string; operator: string; value: unknown }> | undefined
): Record<string, unknown> {
  if (!perspectiveFilters || perspectiveFilters.length === 0) {
    return baseFilters
  }

  const conditions: Array<Record<string, unknown>> = []

  for (const filter of perspectiveFilters) {
    const { field, operator, value } = filter
    const op = operator as FilterOperator

    // Skip meta fields
    if (field.startsWith('_')) continue

    let condition: Record<string, unknown> | null = null

    switch (op) {
      case 'eq':
        condition = { [field]: value }
        break
      case 'neq':
        condition = { [field]: { $ne: value } }
        break
      case 'gt':
        condition = { [field]: { $gt: value } }
        break
      case 'gte':
        condition = { [field]: { $gte: value } }
        break
      case 'lt':
        condition = { [field]: { $lt: value } }
        break
      case 'lte':
        condition = { [field]: { $lte: value } }
        break
      case 'contains':
        if (typeof value === 'string') {
          condition = { [field]: { $ilike: `%${escapeLikePattern(value)}%` } }
        }
        break
      case 'startsWith':
        if (typeof value === 'string') {
          condition = { [field]: { $ilike: `${escapeLikePattern(value)}%` } }
        }
        break
      case 'endsWith':
        if (typeof value === 'string') {
          condition = { [field]: { $ilike: `%${escapeLikePattern(value)}` } }
        }
        break
      case 'isEmpty':
        condition = { [field]: null }
        break
      case 'isNotEmpty':
        condition = { [field]: { $ne: null } }
        break
    }

    if (condition) {
      conditions.push(condition)
    }
  }

  if (conditions.length === 0) {
    return baseFilters
  }

  return {
    ...baseFilters,
    $and: [...(Array.isArray(baseFilters.$and) ? baseFilters.$and : []), ...conditions],
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = reportRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { filters, sorting, columns, dateFrom, dateTo, perspectiveName } = parseResult.data

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const em = container.resolve('em') as EntityManager

    const scopeFilters = buildScopeFilters(auth, scope)

    // Build base filters
    let queryFilters: Record<string, unknown> = {
      deletedAt: null,
      ...scopeFilters,
    }

    // Apply date range filter on createdAt
    if (dateFrom || dateTo) {
      const dateConditions: Record<string, unknown> = {}
      if (dateFrom) {
        dateConditions.$gte = new Date(dateFrom)
      }
      if (dateTo) {
        // Include the entire end date (add one day and use $lt)
        const endDate = new Date(dateTo)
        endDate.setDate(endDate.getDate() + 1)
        dateConditions.$lt = endDate
      }
      queryFilters.createdAt = dateConditions
    }

    // Apply perspective filters
    queryFilters = applyPerspectiveFilters(queryFilters, filters)

    // Build sorting
    const orderBy: Record<string, 'asc' | 'desc'> = {}
    if (sorting && sorting.length > 0) {
      const sortFieldMap: Record<string, string> = {
        id: 'id',
        name: 'name',
        status: 'status',
        departureDate: 'departureDate',
        totalRate: 'totalRate',
        totalAmount: 'totalRate',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        currencyCode: 'currencyCode',
      }
      for (const sort of sorting) {
        const field = sortFieldMap[sort.field] || sort.field
        orderBy[field] = sort.direction
      }
    } else {
      orderBy.createdAt = 'desc'
    }

    // Get total count first
    const totalCount = await em.count(FrcOffer, queryFilters)

    // Fetch offers with limit
    const offers = await em.find(FrcOffer, queryFilters, {
      orderBy,
      limit: MAX_REPORT_ROWS,
    })

    // Fetch RFQ names for display
    const rfqIds = [...new Set(offers.map((o) => o.rfqId).filter(Boolean))]
    const rfqMap = new Map<string, string>()
    if (rfqIds.length > 0) {
      const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds } }, { fields: ['id', 'name'] })
      rfqs.forEach((rfq) => rfqMap.set(rfq.id, rfq.name))
    }

    // Helper to safely convert date values (MikroORM date columns may return strings)
    const toIsoString = (value: Date | string | null | undefined): string | null => {
      if (!value) return null
      if (value instanceof Date) return value.toISOString()
      return String(value)
    }

    // Transform to report rows
    const reportRows: OfferReportRow[] = offers.map((offer) => ({
      id: offer.id,
      name: offer.name,
      rfqName: rfqMap.get(offer.rfqId) ?? null,
      status: offer.status,
      currencyCode: offer.currencyCode,
      totalAmount: offer.totalRate ? parseFloat(offer.totalRate) : null,
      departureDate: toIsoString(offer.departureDate),
      validUntil: null, // FrcOffer doesn't have validUntil, set to null
      notes: null, // FrcOffer doesn't have notes field
      createdAt: toIsoString(offer.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoString(offer.updatedAt) ?? undefined,
    }))

    // Get tenant name for branding
    let tenantName = '4RCargo'
    try {
      const tenantRows = await em.getConnection().execute<Array<{ name: string }>>(
        'SELECT name FROM tenants WHERE id = ? LIMIT 1',
        [auth.tenantId]
      )
      if (tenantRows.length > 0 && tenantRows[0].name) {
        tenantName = tenantRows[0].name
      }
    } catch {
      // Fallback to default if tenant table doesn't exist or query fails
    }

    // Generate PDF
    const pdfBuffer = await generateOffersReportPdf(
      reportRows,
      {
        columns: columns as ReportColumn[],
        perspectiveName,
        dateFrom,
        dateTo,
        totalCount,
      },
      tenantName
    )

    // Generate filename
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `frc-offers-report-${dateStr}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    console.error('[frc_offers/report/pdf] Error generating PDF:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to generate PDF report', message },
      { status: 500 }
    )
  }
}
