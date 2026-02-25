import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { EventBus } from '@open-mercato/events'
import { FrcTruck } from '../../data/entities'
import { createTruckSchema, truckFilterSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_trucks.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_trucks.manage'] },
}

// Field mapping for DynamicTable filters (table column name -> ORM field name)
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  name: 'name',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
}

// Parse DynamicTable FilterRow into MikroORM filter format
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
      if (!hasValue) return null
      return { [field]: { $ilike: `%${val}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
      if (!hasValue) return null
      return { [field]: { $eq: val } }
    case 'not_equals':
      if (!hasValue) return null
      return { [field]: { $ne: val } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    case 'greater_than':
      if (!hasValue) return null
      return { [field]: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { [field]: { $lt: val } }
    default:
      return null
  }
}

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

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const query = {
    q: url.searchParams.get('q') || undefined,
    isActive: url.searchParams.get('isActive') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'name',
    sortDir: url.searchParams.get('sortDir') || 'asc',
  }

  const parse = truckFilterSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const filters: Record<string, unknown> = {
    deletedAt: null,
    ...scopeFilters,
  }

  if (parse.data.q && parse.data.q.trim().length > 0) {
    const term = `%${escapeLikePattern(parse.data.q.trim())}%`
    filters.$or = [
      { name: { $ilike: term } },
    ]
  }

  if (parse.data.isActive !== undefined) {
    filters.isActive = parse.data.isActive
  }

  // Parse DynamicTable filters from query string
  const filtersParam = url.searchParams.get('filters')
  if (filtersParam) {
    try {
      const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
      if (dynamicFilters.length > 0) {
        const parsedFilters = dynamicFilters
          .map(parseFilterRow)
          .filter((f): f is Record<string, unknown> => f !== null)

        if (parsedFilters.length > 0) {
          filters.$and = [...(filters.$and as Record<string, unknown>[] || []), ...parsedFilters]
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  const sortFieldMap: Record<string, string> = {
    id: 'id',
    name: 'name',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'name'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcTruck, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      isActive: item.isActive,
      organizationId: item.organizationId,
      tenantId: item.tenantId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    total,
    limit: parse.data.limit,
    offset: parse.data.offset,
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createTruckSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Use direct auth properties (from JWT) - matching the FMS pattern
  // This avoids issues with stale/invalid cookie values
  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const now = new Date()
  const truck = em.create(FrcTruck, {
    organizationId: organizationId as string,
    tenantId: tenantId as string,
    name: parse.data.name,
    isActive: parse.data.isActive,
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(truck)

  // Emit search index event for the new truck
  try {
    const eventBus = container.resolve<EventBus>('eventBus')
    await eventBus.emitEvent('search.index_record', {
      entityId: 'frc_trucks:frc_truck',
      recordId: truck.id,
      tenantId: tenantId as string,
      organizationId: organizationId as string,
    })
  } catch {
    // Search indexing is non-critical, log but don't fail the request
  }

  return NextResponse.json(
    {
      id: truck.id,
      name: truck.name,
    },
    { status: 201 }
  )
}
