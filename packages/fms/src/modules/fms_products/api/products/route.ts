import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct } from '../../data/entities'
import { chargeUnitSchema, productTransportModeSchema } from '../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../commands'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    q: z.string().optional(),
    chargeUnit: chargeUnitSchema.optional(),
    transportMode: productTransportModeSchema.optional(),
    isActive: z.coerce.boolean().optional(),
    sortField: z.string().optional().default('name'),
    sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
    filters: z.string().optional(),
  })
  .passthrough()

const createSchema = z.object({
  name: z.string().min(1).max(255),
  chargeCode: z.string().max(50).optional().nullable(),
  chargeUnit: chargeUnitSchema.optional().nullable(),
  transportMode: productTransportModeSchema.optional().nullable(),
  isActive: z.boolean().optional().default(true),
})

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organizationId',
  tenantId: 'tenantId',
  name: 'name',
  chargeCode: 'chargeCode',
  chargeUnit: 'chargeUnit',
  transportMode: 'transportMode',
  isActive: 'isActive',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy',
  deletedAt: 'deletedAt',
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
    chargeUnit: url.searchParams.get('chargeUnit') || undefined,
    transportMode: url.searchParams.get('transportMode') || undefined,
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

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else if (typeof auth.actorOrgId === 'string') {
    allowedOrgIds.add(auth.actorOrgId)
  } else if (typeof auth.orgId === 'string') {
    allowedOrgIds.add(auth.orgId)
  }

  // Build filters
  const filters: Record<string, unknown> = {
    deletedAt: null,
  }

  if (tenantId) {
    filters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  if (parse.data.isActive !== undefined) {
    filters.isActive = parse.data.isActive
  }

  if (parse.data.chargeUnit) {
    filters.chargeUnit = parse.data.chargeUnit
  }

  if (parse.data.transportMode) {
    filters.transportMode = parse.data.transportMode
  }

  // Search filter
  if (parse.data.q && parse.data.q.trim()) {
    const searchTerm = parse.data.q.trim().toLowerCase()
    filters.$or = [
      { name: { $ilike: `%${searchTerm}%` } },
      { chargeCode: { $ilike: `%${searchTerm}%` } },
    ]
  }

  // Parse DynamicTable filters from query string
  if (parse.data.filters) {
    try {
      const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(parse.data.filters)
      if (dynamicFilters.length > 0) {
        const parsedFilters = dynamicFilters
          .map(parseFilterRow)
          .filter((f): f is Record<string, unknown> => f !== null)

        if (parsedFilters.length > 0) {
          filters.$and = [...(filters.$and as Record<string, unknown>[] || []), ...parsedFilters]
        }
      }
    } catch {
      // Ignore invalid filters JSON
    }
  }

  // Build sort
  const sortFieldMap: Record<string, string> = {
    name: 'name',
    chargeCode: 'chargeCode',
    chargeUnit: 'chargeUnit',
    transportMode: 'transportMode',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'name'
  const sortDir = parse.data.sortDir || 'asc'

  // Fetch products
  const [products, total] = await em.findAndCount(FmsProduct, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
  })

  // Transform to response format
  const items = products.map((product) => ({
    id: product.id,
    name: product.name,
    chargeCode: product.chargeCode ?? null,
    chargeUnit: product.chargeUnit ?? null,
    transportMode: product.transportMode ?? null,
    isActive: product.isActive,
    createdAt: product.createdAt?.toISOString() || null,
    updatedAt: product.updatedAt?.toISOString() || null,
  }))

  return NextResponse.json({
    items,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute('fms_products.products.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        name: parse.data.name,
        chargeCode: parse.data.chargeCode ?? null,
        chargeUnit: parse.data.chargeUnit ?? null,
        transportMode: parse.data.transportMode ?? null,
        isActive: parse.data.isActive ?? true,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json({
      id: (result as { id: string }).id,
      name: parse.data.name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create product'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
