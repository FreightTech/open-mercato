import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsPriceType } from '../../data/entities'
import { createPriceTypeSchema, updatePriceTypeSchema } from '../../data/validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { E } from '#generated/entities.ids.generated'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
// Import to register commands
import '../../commands/price-types'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .loose()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.price_types.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.price_types.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.price_types.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.price_types.manage'] },
}

export const metadata = routeMetadata

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organization_id',
  tenantId: 'tenant_id',
  code: 'code',
  name: 'name',
  description: 'description',
  isActive: 'is_active',
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  deletedAt: 'deleted_at',
}

// Parse DynamicTable FilterRow into query engine filter format
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): { field: string; filter: Record<string, unknown> } | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      return { field, filter: { $in: row.values } }
    case 'is_not_any_of':
      if (!hasValues) return null
      return { field, filter: { $nin: row.values } }
    case 'contains':
      if (!hasValue) return null
      return { field, filter: { $ilike: `%${val}%` } }
    case 'is_empty':
      return { field, filter: { $eq: null } }
    case 'is_not_empty':
      return { field, filter: { $ne: null } }
    case 'equals':
      if (!hasValue) return null
      return { field, filter: { $eq: val } }
    case 'not_equals':
      if (!hasValue) return null
      return { field, filter: { $ne: val } }
    case 'is_true':
      return { field, filter: { $eq: true } }
    case 'is_false':
      return { field, filter: { $eq: false } }
    default:
      return null
  }
}

function buildSearchFilters(query: z.infer<typeof listSchema>, ctx?: { request?: Request }): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (query.q && query.q.trim().length > 0) {
    const term = `%${escapeLikePattern(query.q.trim())}%`
    filters.code = { $ilike: term }
  }

  if (query.isActive !== undefined) {
    filters.isActive = query.isActive
  }

  // Parse DynamicTable filters from request
  if (ctx?.request) {
    const url = new URL(ctx.request.url)
    const filtersParam = url.searchParams.get('filters')
    if (filtersParam) {
      try {
        const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
        for (const filterRow of dynamicFilters) {
          const parsed = parseFilterRow(filterRow)
          if (parsed) {
            filters[parsed.field] = parsed.filter
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  return filters
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsPriceType,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.fms_products.fms_price_type },
  list: {
    schema: listSchema,
    entityId: E.fms_products.fms_price_type,
    fields: [
      'id',
      'code',
      'name',
      'description',
      'is_active',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      code: 'code',
      name: 'name',
      description: 'description',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query, ctx) => buildSearchFilters(query, ctx),
    transformItem: (item: any) => ({
      id: item.id,
      code: item.code ?? null,
      name: item.name ?? null,
      description: item.description ?? null,
      isActive: item.is_active ?? true,
      organizationId: item.organization_id ?? null,
      tenantId: item.tenant_id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  },
  create: {
    schema: createPriceTypeSchema.partial(),
    mapToEntity: (input) => ({
      ...input,
    }),
  },
  update: {
    schema: updatePriceTypeSchema.partial(),
    applyToEntity: (entity, input) => {
      if (input.name !== undefined) entity.name = input.name
      if (input.description !== undefined) entity.description = input.description
      if (input.isActive !== undefined) entity.isActive = input.isActive
      entity.updatedAt = new Date()
      if (input.updatedBy !== undefined) entity.updatedBy = input.updatedBy
    },
  },
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createPriceTypeSchema.safeParse(body)

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
    const { result } = await bus.execute('fms_products.price_types.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        code: parse.data.code,
        name: parse.data.name,
        description: parse.data.description ?? null,
        isActive: parse.data.isActive ?? true,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create price type'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PUT = crud.PUT
export const DELETE = crud.DELETE
