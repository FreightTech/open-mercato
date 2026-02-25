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

// DynamicTable sends filters with `values` array, not single `value`
const filterRowSchema = z.object({
  id: z.string().optional(),
  field: z.string(),
  operator: z.string(),
  values: z.array(z.unknown()),
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

// Field mapping for DynamicTable filters (table column name -> ORM field name)
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  name: 'name',
  rfqId: 'rfqId',
  carrierId: 'carrierId',
  status: 'status',
  awbNumber: 'awbNumber',
  departureDate: 'departureDate',
  totalRate: 'totalRate',
  totalRatePerKg: 'totalRatePerKg',
  totalAmount: 'totalRate',
  currencyCode: 'currencyCode',
  assignedToId: 'assignedToId',
  validUntil: 'validUntil',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
}

// Parse a single DynamicTable FilterRow into MikroORM filter format
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): Record<string, unknown> | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      return { [field]: { $in: row.values } }
    case 'is_not_any_of':
      if (!hasValues) return null
      return { [field]: { $nin: row.values } }
    case 'contains':
      if (!hasValue || typeof val !== 'string') return null
      return { [field]: { $ilike: `%${escapeLikePattern(val)}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
    case 'eq':
      if (!hasValue) return null
      return { [field]: { $eq: val } }
    case 'not_equals':
    case 'neq':
      if (!hasValue) return null
      return { [field]: { $ne: val } }
    case 'greater_than':
    case 'gt':
      if (!hasValue) return null
      return { [field]: { $gt: val } }
    case 'greater_than_or_equal':
    case 'gte':
      if (!hasValue) return null
      return { [field]: { $gte: val } }
    case 'less_than':
    case 'lt':
      if (!hasValue) return null
      return { [field]: { $lt: val } }
    case 'less_than_or_equal':
    case 'lte':
      if (!hasValue) return null
      return { [field]: { $lte: val } }
    case 'starts_with':
    case 'startsWith':
      if (!hasValue || typeof val !== 'string') return null
      return { [field]: { $ilike: `${escapeLikePattern(val)}%` } }
    case 'ends_with':
    case 'endsWith':
      if (!hasValue || typeof val !== 'string') return null
      return { [field]: { $ilike: `%${escapeLikePattern(val)}` } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    default:
      return null
  }
}

type FilterRow = { field: string; operator: string; values: unknown[] }

/**
 * Apply perspective filters to base query filters.
 * Handles both regular fields and the special `rfqName` joined field.
 */
async function applyPerspectiveFilters(
  em: EntityManager,
  baseFilters: Record<string, unknown>,
  perspectiveFilters: FilterRow[] | undefined,
  scopeFilters: { tenantId?: string; organizationId?: { $in: string[] } }
): Promise<Record<string, unknown>> {
  if (!perspectiveFilters || perspectiveFilters.length === 0) {
    return baseFilters
  }

  // Separate rfqName filters (joined field) from regular filters
  const rfqNameFilters = perspectiveFilters.filter((f) => f.field === 'rfqName')
  const regularFilters = perspectiveFilters.filter((f) => f.field !== 'rfqName' && !f.field.startsWith('_'))

  const conditions: Array<Record<string, unknown>> = []

  // Handle rfqName filters by querying RFQ table first
  if (rfqNameFilters.length > 0) {
    const rfqConditions: Record<string, unknown>[] = []
    
    for (const row of rfqNameFilters) {
      const val = row.values[0]
      const hasValue = val !== undefined && val !== null && val !== ''

      switch (row.operator) {
        case 'contains':
          if (hasValue && typeof val === 'string') {
            rfqConditions.push({ name: { $ilike: `%${escapeLikePattern(val)}%` } })
          }
          break
        case 'equals':
        case 'eq':
          if (hasValue) {
            rfqConditions.push({ name: { $eq: val } })
          }
          break
        case 'is_any_of':
          if (Array.isArray(row.values) && row.values.length > 0) {
            rfqConditions.push({ name: { $in: row.values } })
          }
          break
        case 'is_not_any_of':
          if (Array.isArray(row.values) && row.values.length > 0) {
            rfqConditions.push({ name: { $nin: row.values } })
          }
          break
        case 'is_empty':
          rfqConditions.push({ name: { $eq: null } })
          break
        case 'is_not_empty':
          rfqConditions.push({ name: { $ne: null } })
          break
        case 'starts_with':
        case 'startsWith':
          if (hasValue && typeof val === 'string') {
            rfqConditions.push({ name: { $ilike: `${escapeLikePattern(val)}%` } })
          }
          break
        case 'ends_with':
        case 'endsWith':
          if (hasValue && typeof val === 'string') {
            rfqConditions.push({ name: { $ilike: `%${escapeLikePattern(val)}` } })
          }
          break
      }
    }

    if (rfqConditions.length > 0) {
      // Find matching RFQ IDs
      const matchingRfqs = await em.find(
        FrcRfq,
        { $and: rfqConditions, deletedAt: null, ...scopeFilters },
        { fields: ['id'] }
      )
      const matchingRfqIds = matchingRfqs.map((r) => r.id)

      if (matchingRfqIds.length > 0) {
        conditions.push({ rfqId: { $in: matchingRfqIds } })
      } else {
        // No matching RFQs - force empty result
        conditions.push({ rfqId: { $in: [] } })
      }
    }
  }

  // Handle regular filters
  for (const filter of regularFilters) {
    const condition = parseFilterRow(filter)
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

    // Apply perspective filters (handles both regular fields and rfqName joined field)
    queryFilters = await applyPerspectiveFilters(em, queryFilters, filters, scopeFilters)

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
      validUntil: toIsoString(offer.validUntil),
      notes: offer.notes ?? null,
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
