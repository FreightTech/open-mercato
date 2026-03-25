import { z } from 'zod'
import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { EntityManager } from '@mikro-orm/postgresql'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    type: z.enum(['port', 'terminal']).optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_locations.ports.view'] },
}

const SORT_FIELD_MAP: Record<string, string> = {
  id: 'id',
  code: 'code',
  name: 'name',
  locode: 'locode',
  type: 'product_type',
  productType: 'product_type',
  city: 'city',
  country: 'country',
  lat: 'lat',
  lng: 'lng',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

// Field mapping from frontend camelCase to database column names for filtering
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organization_id',
  tenantId: 'tenant_id',
  code: 'code',
  name: 'name',
  type: 'product_type',
  productType: 'product_type',
  locode: 'locode',
  portId: 'port_id',
  lat: 'lat',
  lng: 'lng',
  city: 'city',
  country: 'country',
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  deletedAt: 'deleted_at',
}

// Parse DynamicTable FilterRow into SQL condition with params
function parseFilterRowToSQL(
  row: { field: string; operator: string; values: unknown[] },
  params: unknown[]
): string | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of': {
      if (!hasValues) return null
      const placeholders = row.values.map(() => '?').join(', ')
      params.push(...row.values)
      return `${field} IN (${placeholders})`
    }
    case 'is_not_any_of': {
      if (!hasValues) return null
      const placeholders = row.values.map(() => '?').join(', ')
      params.push(...row.values)
      return `${field} NOT IN (${placeholders})`
    }
    case 'contains': {
      if (!hasValue || typeof val !== 'string') return null
      params.push(`%${escapeLikePattern(val)}%`)
      return `${field} ILIKE ?`
    }
    case 'is_empty':
      return `${field} IS NULL`
    case 'is_not_empty':
      return `${field} IS NOT NULL`
    case 'equals': {
      if (!hasValue) return null
      params.push(val)
      return `${field} = ?`
    }
    case 'not_equals': {
      if (!hasValue) return null
      params.push(val)
      return `${field} != ?`
    }
    case 'is_true':
      return `${field} = TRUE`
    case 'is_false':
      return `${field} = FALSE`
    case 'greater_than': {
      if (!hasValue) return null
      params.push(val)
      return `${field} > ?`
    }
    case 'less_than': {
      if (!hasValue) return null
      params.push(val)
      return `${field} < ?`
    }
    default:
      return null
  }
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const url = new URL(req.url)
  const rawParams = Object.fromEntries(url.searchParams.entries())
  const query = listSchema.parse(rawParams)

  const { page, limit, q, type, sortField, sortDir } = query

  const conditions: string[] = []
  const params: any[] = []

  const allowedOrgIds: string[] = []
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.push(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.push(fallbackOrgId)
    }
  }

  if (allowedOrgIds.length > 0) {
    const placeholders = allowedOrgIds.map(() => '?').join(', ')
    conditions.push(`organization_id IN (${placeholders})`)
    params.push(...allowedOrgIds)
  }

  if (auth.tenantId) {
    conditions.push(`tenant_id = ?`)
    params.push(auth.tenantId)
  }

  conditions.push(`deleted_at IS NULL`)

  if (q && q.trim().length > 0) {
    const term = `%${escapeLikePattern(q.trim())}%`
    conditions.push(`(code ILIKE ? OR name ILIKE ?)`)
    params.push(term, term)
  }

  if (type) {
    conditions.push(`product_type = ?`)
    params.push(type)
  }

  // Parse DynamicTable filters from query string
  const filtersParam = url.searchParams.get('filters')
  if (filtersParam) {
    try {
      const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
      for (const filterRow of dynamicFilters) {
        const sqlCondition = parseFilterRowToSQL(filterRow, params)
        if (sqlCondition) {
          conditions.push(sqlCondition)
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sortColumn = SORT_FIELD_MAP[sortField || 'code'] || 'code'
  const sortDirection = sortDir === 'desc' ? 'DESC' : 'ASC'
  const orderClause = `ORDER BY ${sortColumn} ${sortDirection}`

  const offset = (page - 1) * limit

  const countQuery = `SELECT COUNT(*) as count FROM fms_locations ${whereClause}`
  const countParams = [...params]
  const countResult = await em.getConnection().execute(countQuery, countParams)
  const total = parseInt(countResult[0]?.count || '0', 10)

  const dataQuery = `
    SELECT
      id,
      organization_id,
      tenant_id,
      code,
      name,
      locode,
      product_type,
      port_id,
      lat,
      lng,
      city,
      country,
      address_line1,
      created_at,
      updated_at
    FROM fms_locations
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `
  const dataParams = [...params, limit, offset]

  const items = await em.getConnection().execute(dataQuery, dataParams)

  const transformedItems = items.map((item: any) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    locode: item.locode,
    type: item.product_type,
    portId: item.port_id,
    lat: item.lat,
    lng: item.lng,
    city: item.city,
    country: item.country,
    addressLine1: item.address_line1,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }))

  return NextResponse.json({
    items: transformedItems,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export const openApi = {
  get: { operationId: 'listFmsLocations', summary: 'List FMS locations', tags: ['FMS Locations'], responses: { 200: { description: 'Locations list' } } },
}
