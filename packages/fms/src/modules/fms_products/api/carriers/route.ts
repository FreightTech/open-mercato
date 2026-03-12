import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsCarrier } from '../../data/entities'
import { createCarrierSchema, updateCarrierSchema, carrierTypeSchema } from '../../data/validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { parseDynamicTableFilters } from '@open-mercato/ui/backend/dynamic-table/server'
import { E } from '#generated/entities.ids.generated'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
// Import to register commands
import '../../commands/carriers'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    carrierType: carrierTypeSchema.optional(),
    isActive: z.coerce.boolean().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .loose()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.carriers.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.carriers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.carriers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.carriers.manage'] },
}

export const metadata = routeMetadata

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organization_id',
  tenantId: 'tenant_id',
  code: 'code',
  name: 'name',
  carrierType: 'carrier_type',
  isActive: 'is_active',
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  deletedAt: 'deleted_at',
}

function buildSearchFilters(query: z.infer<typeof listSchema>, ctx?: { request?: Request }): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (query.q && query.q.trim().length > 0) {
    const term = `%${escapeLikePattern(query.q.trim())}%`
    filters.code = { $ilike: term }
  }

  if (query.carrierType) {
    filters.carrierType = query.carrierType
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
        const dynamicFilters = JSON.parse(filtersParam)
        const parsedFilters = parseDynamicTableFilters(dynamicFilters, FIELD_MAP)
        for (const f of parsedFilters) {
          Object.assign(filters, f)
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
    entity: FmsCarrier,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.fms_products.fms_carrier },
  list: {
    schema: listSchema,
    entityId: E.fms_products.fms_carrier,
    fields: [
      'id',
      'code',
      'name',
      'carrier_type',
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
      carrierType: 'carrier_type',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query, ctx) => buildSearchFilters(query, ctx),
    transformItem: (item: any) => ({
      id: item.id,
      code: item.code ?? null,
      name: item.name ?? null,
      carrierType: item.carrier_type ?? null,
      isActive: item.is_active ?? true,
      organizationId: item.organization_id ?? null,
      tenantId: item.tenant_id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  },
  create: {
    schema: createCarrierSchema.partial(),
    mapToEntity: (input) => ({
      ...input,
    }),
  },
  update: {
    schema: updateCarrierSchema.partial(),
    applyToEntity: (entity, input) => {
      if (input.name !== undefined) entity.name = input.name
      if (input.carrierType !== undefined) entity.carrierType = input.carrierType
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

// Input schema for API - organizationId/tenantId come from auth context
// Code is optional - will be auto-generated from name if not provided
const apiCreateCarrierSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores only').optional(),
  name: z.string().min(1).max(255),
  carrierType: carrierTypeSchema,
  isActive: z.boolean().optional().default(true),
})

// Generate code from name: "Mediterranean Shipping Company" -> "MEDITERRANEAN_SHIPPING_COMPANY"
function generateCodeFromName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = apiCreateCarrierSchema.safeParse(body)

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
    const code = parse.data.code || generateCodeFromName(parse.data.name)

    const { result } = await bus.execute('fms_products.carriers.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        code,
        name: parse.data.name,
        carrierType: parse.data.carrierType,
        isActive: parse.data.isActive ?? true,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create carrier'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PUT = crud.PUT
export const DELETE = crud.DELETE
