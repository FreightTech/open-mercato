import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct } from '../../data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../commands'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    q: z.string().optional(),
    productType: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
    sortField: z.string().optional().default('name'),
    sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
    filters: z.string().optional(),
  })
  .passthrough()

const createSchema = z.object({
  name: z.string().min(1).max(255),
  productType: z.enum(['GFRT', 'GTHC', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GCUS', 'CUSTOM']),
  chargeCodeId: z.string().uuid().optional().nullable(),
  serviceProviderId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  // Type-specific fields
  loop: z.string().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  destinationId: z.string().uuid().optional().nullable(),
  transitTime: z.number().int().positive().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})

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
    productType: url.searchParams.get('productType') || undefined,
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

  // Search filter
  if (parse.data.q && parse.data.q.trim()) {
    const searchTerm = parse.data.q.trim().toLowerCase()
    filters.$or = [{ name: { $ilike: `%${searchTerm}%` } }]
  }

  // Parse JSON filters from table
  if (parse.data.filters) {
    try {
      const tableFilters = JSON.parse(parse.data.filters)
      if (Array.isArray(tableFilters)) {
        for (const f of tableFilters) {
          if (f.column === 'productType' && f.value) {
            filters.productType = f.value
          }
          if (f.column === 'isActive' && f.value !== undefined) {
            filters.isActive = f.value === 'true' || f.value === true
          }
        }
      }
    } catch {
      // Ignore invalid filters JSON
    }
  }

  // Direct productType filter
  if (parse.data.productType) {
    filters.productType = parse.data.productType
  }

  // Build sort
  const sortFieldMap: Record<string, string> = {
    name: 'name',
    productType: 'productType',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    internalNotes: 'internalNotes',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'name'
  const sortDir = parse.data.sortDir || 'asc'

  // Fetch products with relations
  const [products, total] = await em.findAndCount(FmsProduct, filters, {
    populate: ['chargeCode', 'serviceProvider', 'variants'],
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
  })

  // Transform to response format
  const items = products.map((product) => {
    const chargeCode = product.chargeCode
    const serviceProvider = product.serviceProvider
    const variantCount = product.variants.isInitialized() ? product.variants.count() : 0

    return {
      id: product.id,
      name: product.name,
      productType: product.productType,
      chargeCodeCode: chargeCode?.code || null,
      chargeCodeId: chargeCode?.id || null,
      serviceProviderName: serviceProvider?.name || serviceProvider?.shortName || null,
      serviceProviderId: serviceProvider?.id || null,
      variantCount,
      internalNotes: product.internalNotes || null,
      isActive: product.isActive,
      createdAt: product.createdAt?.toISOString() || null,
      updatedAt: product.updatedAt?.toISOString() || null,
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
    const { result } = await bus.execute<
      {
        organizationId: string
        tenantId: string
        name: string
        productType: string
        chargeCodeId?: string | null
        serviceProviderId?: string | null
        internalNotes?: string | null
        isActive?: boolean
        loop?: string | null
        sourceId?: string | null
        destinationId?: string | null
        transitTime?: number | null
        locationId?: string | null
        description?: string | null
        createdBy?: string | null
      },
      { id: string }
    >('fms_products.products.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        name: parse.data.name,
        productType: parse.data.productType,
        chargeCodeId: parse.data.chargeCodeId ?? null,
        serviceProviderId: parse.data.serviceProviderId ?? null,
        internalNotes: parse.data.internalNotes ?? null,
        isActive: parse.data.isActive ?? true,
        loop: parse.data.loop ?? null,
        sourceId: parse.data.sourceId ?? null,
        destinationId: parse.data.destinationId ?? null,
        transitTime: parse.data.transitTime ?? null,
        locationId: parse.data.locationId ?? null,
        description: parse.data.description ?? null,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json({
      id: result.id,
      name: parse.data.name,
      productType: parse.data.productType,
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
