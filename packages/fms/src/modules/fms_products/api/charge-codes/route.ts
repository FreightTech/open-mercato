import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsChargeCode } from '../../data/entities'
import { createChargeCodeSchema, updateChargeCodeSchema } from '../../data/validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
// Import to register commands
import '../../commands'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    chargeUnit: z.enum(['per_container', 'per_piece', 'one_time']).optional(),
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

function buildSearchFilters(query: z.infer<typeof listSchema>): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (query.q && query.q.trim().length > 0) {
    const term = `%${escapeLikePattern(query.q.trim())}%`
    filters.$or = [
      { code: { $ilike: term } },
      { description: { $ilike: term } },
    ]
  }

  if (query.chargeUnit) {
    filters.chargeUnit = query.chargeUnit
  }

  if (query.isActive !== undefined) {
    filters.isActive = query.isActive
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
    fields: [
      'id',
      'code',
      'description',
      'charge_unit',
      'field_schema',
      'is_active',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      code: 'code',
      description: 'description',
      chargeUnit: 'charge_unit',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query) => buildSearchFilters(query),
    transformItem: (item: any) => ({
      id: item.id,
      code: item.code ?? null,
      description: item.description ?? null,
      chargeUnit: item.charge_unit ?? null,
      fieldSchema: item.field_schema ?? null,
      isActive: item.is_active ?? true,
      organization_id: item.organization_id ?? null,
      tenant_id: item.tenant_id ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
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
      if (input.description !== undefined) entity.description = input.description
      if (input.chargeUnit !== undefined) entity.chargeUnit = input.chargeUnit
      if (input.fieldSchema !== undefined) entity.fieldSchema = input.fieldSchema
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
        description: parse.data.description ?? null,
        chargeUnit: parse.data.chargeUnit,
        fieldSchema: parse.data.fieldSchema ?? null,
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
