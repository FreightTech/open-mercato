import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct, FmsChargeCode } from '../../data/entities'
import { Contractor } from '../../../contractors/data/entities'

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
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Verify charge code exists (if provided)
  let chargeCode = null
  if (parse.data.chargeCodeId) {
    chargeCode = await em.findOne(FmsChargeCode, { id: parse.data.chargeCodeId })
    if (!chargeCode) {
      return NextResponse.json({ error: 'Charge code not found' }, { status: 404 })
    }
  }

  // Verify service provider exists (if provided)
  let serviceProvider = null
  if (parse.data.serviceProviderId) {
    serviceProvider = await em.findOne(Contractor, { id: parse.data.serviceProviderId })
    if (!serviceProvider) {
      return NextResponse.json({ error: 'Service provider not found' }, { status: 404 })
    }
  }

  // Create the product
  const product = new FmsProduct()
  product.organizationId = organizationId as string
  product.tenantId = tenantId as string
  product.name = parse.data.name
  product.productType = parse.data.productType
  product.internalNotes = parse.data.internalNotes ?? null
  product.isActive = parse.data.isActive ?? true
  product.createdBy = typeof auth.userId === 'string' ? auth.userId : null

  if (chargeCode) {
    product.chargeCode = chargeCode
  }
  if (serviceProvider) {
    product.serviceProvider = serviceProvider
  }

  // Type-specific fields
  product.loop = parse.data.loop ?? null
  product.transitTime = parse.data.transitTime ?? null
  product.description = parse.data.description ?? null

  await em.persistAndFlush(product)

  return NextResponse.json({
    id: product.id,
    name: product.name,
    productType: product.productType,
  })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
