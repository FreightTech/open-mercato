import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct, FmsProductVariant } from '../../../data/entities'
import { createRowId } from '../../../lib/fieldClassification'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    q: z.string().optional(),
    chargeCodeId: z.string().uuid().optional(),
    carrierId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional(),
    sortField: z.string().optional().default('name'),
    sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
    filters: z.string().optional(),
  })
  .passthrough()

// Field mapping from frontend camelCase to database field names for products
const PRODUCT_FIELD_MAP: Record<string, string> = {
  name: 'p.name',
  chargeCodeId: 'p.chargeCode',
  carrierId: 'p.carrier',
  isActive: 'p.isActive',
  loop: 'p.loop',
  sourceId: 'p.source',
  destinationId: 'p.destination',
  transitTime: 'p.transitTime',
  createdAt: 'p.createdAt',
  updatedAt: 'p.updatedAt',
}

// Field mapping for variant fields
const VARIANT_FIELD_MAP: Record<string, string> = {
  validityStart: 'v.validityStart',
  validityEnd: 'v.validityEnd',
  price: 'v.price',
  currencyCode: 'v.currencyCode',
  priceTypeId: 'v.priceType',
  providerId: 'v.provider',
  reference: 'v.reference',
  containerSize: 'v.containerSize',
  variantIsActive: 'v.isActive',
}

// Combined field map
const FIELD_MAP = { ...PRODUCT_FIELD_MAP, ...VARIANT_FIELD_MAP }

// Sort field mapping
const SORT_FIELD_MAP: Record<string, string> = {
  name: 'p.name',
  chargeCodeCode: 'cc.code',
  carrierName: 'cr.name',
  loop: 'p.loop',
  transitTime: 'p.transitTime',
  validityStart: 'v.validityStart',
  validityEnd: 'v.validityEnd',
  price: 'v.price',
  currencyCode: 'v.currencyCode',
  providerName: 'co.name',
  reference: 'v.reference',
  containerSize: 'v.containerSize',
  isActive: 'p.isActive',
  variantIsActive: 'v.isActive',
  createdAt: 'p.createdAt',
  updatedAt: 'p.updatedAt',
}

// Parse DynamicTable FilterRow into SQL conditions
function parseFilterRow(
  row: { field: string; operator: string; values: unknown[] },
  params: unknown[]
): string | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      const placeholders = row.values.map(() => {
        params.push(row.values.shift())
        return `$${params.length}`
      })
      // Re-add values to array
      row.values.forEach((v) => params.push(v))
      const inPlaceholders = row.values.map((_, i) => `$${params.length - row.values.length + i + 1}`)
      return `${field} IN (${inPlaceholders.join(', ')})`
    case 'is_not_any_of':
      if (!hasValues) return null
      const notInPlaceholders = row.values.map((v) => {
        params.push(v)
        return `$${params.length}`
      })
      return `${field} NOT IN (${notInPlaceholders.join(', ')})`
    case 'contains':
      if (!hasValue) return null
      params.push(`%${val}%`)
      return `${field} ILIKE $${params.length}`
    case 'is_empty':
      return `${field} IS NULL`
    case 'is_not_empty':
      return `${field} IS NOT NULL`
    case 'equals':
      if (!hasValue) return null
      params.push(val)
      return `${field} = $${params.length}`
    case 'not_equals':
      if (!hasValue) return null
      params.push(val)
      return `${field} != $${params.length}`
    case 'is_true':
      return `${field} = true`
    case 'is_false':
      return `${field} = false`
    case 'greater_than':
      if (!hasValue) return null
      params.push(val)
      return `${field} > $${params.length}`
    case 'less_than':
      if (!hasValue) return null
      params.push(val)
      return `${field} < $${params.length}`
    default:
      return null
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const query = {
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
    q: url.searchParams.get('q') || undefined,
    chargeCodeId: url.searchParams.get('chargeCodeId') || undefined,
    carrierId: url.searchParams.get('carrierId') || undefined,
    providerId: url.searchParams.get('providerId') || undefined,
    isActive: url.searchParams.get('isActive') || undefined,
    sortField: url.searchParams.get('sortField') || 'name',
    sortDir: url.searchParams.get('sortDir') || 'asc',
    filters: url.searchParams.get('filters') || undefined,
  }

  const parse = listSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const allowedOrgIds: string[] = []
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.push(id)
    })
  } else if (typeof auth.actorOrgId === 'string') {
    allowedOrgIds.push(auth.actorOrgId)
  } else if (typeof auth.orgId === 'string') {
    allowedOrgIds.push(auth.orgId)
  }

  // Build the flat query using raw SQL for LEFT JOIN
  const params: unknown[] = []
  const conditions: string[] = ['p.deleted_at IS NULL']

  // Tenant filter
  if (tenantId) {
    params.push(tenantId)
    conditions.push(`p.tenant_id = $${params.length}`)
  }

  // Organization filter
  if (allowedOrgIds.length > 0) {
    const orgPlaceholders = allowedOrgIds.map((orgId) => {
      params.push(orgId)
      return `$${params.length}`
    })
    conditions.push(`p.organization_id IN (${orgPlaceholders.join(', ')})`)
  }

  // Active filter for products
  if (parse.data.isActive !== undefined) {
    params.push(parse.data.isActive)
    conditions.push(`p.is_active = $${params.length}`)
  }

  // Search filter
  if (parse.data.q && parse.data.q.trim()) {
    const searchTerm = `%${parse.data.q.trim().toLowerCase()}%`
    params.push(searchTerm)
    conditions.push(`(LOWER(p.name) LIKE $${params.length} OR LOWER(cc.code) LIKE $${params.length} OR LOWER(cr.name) LIKE $${params.length})`)
  }

  // Charge code filter
  if (parse.data.chargeCodeId) {
    params.push(parse.data.chargeCodeId)
    conditions.push(`p.charge_code_id = $${params.length}`)
  }

  // Carrier filter
  if (parse.data.carrierId) {
    params.push(parse.data.carrierId)
    conditions.push(`p.carrier_id = $${params.length}`)
  }

  // Provider filter (on variants)
  if (parse.data.providerId) {
    params.push(parse.data.providerId)
    conditions.push(`v.provider_id = $${params.length}`)
  }

  // Parse DynamicTable filters
  if (parse.data.filters) {
    try {
      const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> =
        JSON.parse(parse.data.filters)
      for (const filterRow of dynamicFilters) {
        const filterCondition = parseFilterRow(filterRow, params)
        if (filterCondition) {
          conditions.push(filterCondition)
        }
      }
    } catch {
      // Ignore invalid filters JSON
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Determine sort
  const sortField = SORT_FIELD_MAP[parse.data.sortField] || 'p.name'
  const sortDir = parse.data.sortDir === 'desc' ? 'DESC' : 'ASC'
  const orderClause = `ORDER BY ${sortField} ${sortDir} NULLS LAST, p.id ASC, v.id ASC NULLS LAST`

  // Count query (count unique product-variant combinations)
  const countSql = `
    SELECT COUNT(*) as total
    FROM fms_products p
    LEFT JOIN fms_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
    LEFT JOIN fms_charge_codes cc ON cc.id = p.charge_code_id
    LEFT JOIN fms_carriers cr ON cr.id = p.carrier_id
    LEFT JOIN contractors co ON co.id = v.provider_id
    ${whereClause}
  `

  const countResult = await em.getConnection().execute(countSql, params)
  const total = parseInt(countResult[0]?.total || '0', 10)

  // Data query with pagination
  const offset = (parse.data.page - 1) * parse.data.limit
  params.push(parse.data.limit)
  const limitParam = params.length
  params.push(offset)
  const offsetParam = params.length

  const dataSql = `
    SELECT
      p.id as product_id,
      p.name,
      p.loop,
      p.transit_time,
      p.internal_notes,
      p.description,
      p.is_active,
      p.created_at,
      p.updated_at,

      -- Charge code
      cc.id as charge_code_id,
      cc.code as charge_code_code,
      cc.name as charge_code_name,

      -- Carrier
      cr.id as carrier_id,
      cr.name as carrier_name,
      cr.code as carrier_code,

      -- Source location
      sl.id as source_id,
      sl.name as source_name,

      -- Destination location
      dl.id as destination_id,
      dl.name as destination_name,

      -- Location (for GTHC)
      loc.id as location_id,
      loc.name as location_name,

      -- Variant fields
      v.id as variant_id,
      v.validity_start,
      v.validity_end,
      v.price,
      v.currency_code,
      v.reference,
      v.container_size,
      v.is_active as variant_is_active,

      -- Provider (contractor)
      co.id as provider_id,
      co.name as provider_name,
      co.short_name as provider_short_name,

      -- Price type
      pt.id as price_type_id,
      pt.name as price_type_name,
      pt.code as price_type_code

    FROM fms_products p
    LEFT JOIN fms_product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
    LEFT JOIN fms_charge_codes cc ON cc.id = p.charge_code_id
    LEFT JOIN fms_carriers cr ON cr.id = p.carrier_id
    LEFT JOIN fms_locations sl ON sl.id = p.source_id
    LEFT JOIN fms_locations dl ON dl.id = p.destination_id
    LEFT JOIN fms_locations loc ON loc.id = p.location_id
    LEFT JOIN contractors co ON co.id = v.provider_id
    LEFT JOIN fms_price_types pt ON pt.id = v.price_type_id
    ${whereClause}
    ${orderClause}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `

  const rows = await em.getConnection().execute(dataSql, params)

  // Helper to derive product type from charge code
  const deriveProductType = (code: string | null | undefined): string => {
    const systemTypes = ['GFRT', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GTHC', 'GCUS']
    if (code && systemTypes.includes(code)) return code
    return 'CUSTOM'
  }

  // Transform to response format
  const items = rows.map((row: Record<string, unknown>) => {
    const productId = row.product_id as string
    const variantId = row.variant_id as string | null

    return {
      // Composite row ID for identifying which row to update
      rowId: createRowId(productId, variantId),
      productId,
      variantId,

      // Product fields
      name: row.name as string,
      productType: deriveProductType(row.charge_code_code as string | null),
      chargeCodeId: row.charge_code_id as string | null,
      chargeCodeCode: row.charge_code_code as string | null,
      chargeCodeName: row.charge_code_name as string | null,
      carrierId: row.carrier_id as string | null,
      carrierName: row.carrier_name as string | null,
      carrierCode: row.carrier_code as string | null,
      loop: row.loop as string | null,
      sourceId: row.source_id as string | null,
      sourceName: row.source_name as string | null,
      destinationId: row.destination_id as string | null,
      destinationName: row.destination_name as string | null,
      locationId: row.location_id as string | null,
      locationName: row.location_name as string | null,
      transitTime: row.transit_time as number | null,
      description: row.description as string | null,
      internalNotes: row.internal_notes as string | null,
      isActive: row.is_active as boolean,
      createdAt: row.created_at ? (row.created_at as Date).toISOString() : null,
      updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : null,

      // Variant fields (null if product has no variants)
      validityStart: row.validity_start
        ? (row.validity_start as Date).toISOString().split('T')[0]
        : null,
      validityEnd: row.validity_end
        ? (row.validity_end as Date).toISOString().split('T')[0]
        : null,
      price: row.price as string | null,
      currencyCode: (row.currency_code as string) || 'USD',
      priceTypeId: row.price_type_id as string | null,
      priceTypeName: row.price_type_name as string | null,
      priceTypeCode: row.price_type_code as string | null,
      providerId: row.provider_id as string | null,
      providerName: (row.provider_name as string) || (row.provider_short_name as string) || null,
      reference: row.reference as string | null,
      containerSize: row.container_size as string | null,
      variantIsActive: row.variant_is_active as boolean | null,
    }
  })

  return NextResponse.json({
    items,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
}
