import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsChargeCode } from '../../data/entities'
import { createChargeCodeSchema, updateChargeCodeSchema } from '../../data/validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { E } from '#generated/entities.ids.generated'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
// Import to register commands
import '../../commands'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    chargeUnit: z.enum(['container', 'file', 'weight_measure', 'cargo_value_percent']).optional(),
    usage: z.enum(['most_common', 'common', 'rare']).optional(),
    isActive: z.coerce.boolean().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .loose()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.manage'] },
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
  chargeUnit: 'charge_unit',
  keywords: 'keywords',
  usage: 'usage',
  isActive: 'is_active',
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  deletedAt: 'deleted_at',
}

// Parse DynamicTable FilterRow into query engine filter format
// The query engine expects { field: { $op: value } } format (flat, not nested in $and)
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
    case 'greater_than':
      if (!hasValue) return null
      return { field, filter: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { field, filter: { $lt: val } }
    default:
      return null
  }
}

function buildSearchFilters(query: z.infer<typeof listSchema>, ctx?: { request?: Request }): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (query.q && query.q.trim().length > 0) {
    const term = `%${escapeLikePattern(query.q.trim())}%`
    // For search, use $ilike on code and description
    // The query engine doesn't support $or, so we apply ilike to code field for now
    filters.code = { $ilike: term }
  }

  if (query.chargeUnit) {
    filters.chargeUnit = query.chargeUnit
  }

  if (query.usage) {
    filters.usage = query.usage
  }

  if (query.isActive !== undefined) {
    filters.isActive = query.isActive
  }

  // Parse DynamicTable filters from request
  // The query engine expects flat filters like { field: { $op: value } }
  // It does NOT support compound operators like $and or $or
  if (ctx?.request) {
    const url = new URL(ctx.request.url)
    const filtersParam = url.searchParams.get('filters')
    if (filtersParam) {
      try {
        const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
        for (const filterRow of dynamicFilters) {
          const parsed = parseFilterRow(filterRow)
          if (parsed) {
            // Merge filter into filters object
            // Note: If multiple filters on same field, last one wins
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
    entity: FmsChargeCode,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.fms_products.fms_charge_code },
  list: {
    schema: listSchema,
    entityId: E.fms_products.fms_charge_code,
    fields: [
      'id',
      'code',
      'name',
      'description',
      'charge_unit',
      'keywords',
      'usage',
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
      chargeUnit: 'charge_unit',
      usage: 'usage',
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
      chargeUnit: item.charge_unit ?? null,
      keywords: item.keywords ?? null,
      usage: item.usage ?? null,
      isActive: item.is_active ?? true,
      organizationId: item.organization_id ?? null,
      tenantId: item.tenant_id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  },
  create: {
    schema: createChargeCodeSchema.partial(),
    mapToEntity: (input) => ({
      ...input,
    }),
  },
  update: {
    schema: updateChargeCodeSchema.partial(),
    applyToEntity: (entity, input) => {
      if (input.name !== undefined) entity.name = input.name
      if (input.description !== undefined) entity.description = input.description
      if (input.chargeUnit !== undefined) entity.chargeUnit = input.chargeUnit
      if (input.keywords !== undefined) entity.keywords = input.keywords
      if (input.usage !== undefined) entity.usage = input.usage
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
  const parse = createChargeCodeSchema.safeParse(body)

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
    const { result } = await bus.execute('fms_products.charge_codes.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        code: parse.data.code,
        name: parse.data.name ?? null,
        description: parse.data.description ?? null,
        chargeUnit: parse.data.chargeUnit,
        keywords: parse.data.keywords ?? null,
        usage: parse.data.usage ?? null,
        isActive: parse.data.isActive ?? true,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create charge code'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// Keep CRUD factory for PUT and DELETE as fallback (charge-codes/[id] handles individual operations)
export const PUT = crud.PUT
export const DELETE = crud.DELETE
