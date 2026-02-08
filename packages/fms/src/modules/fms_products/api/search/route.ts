import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProduct } from '../../data/entities'

const searchSchema = z.object({
  q: z.string().optional(),
  chargeCode: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})

type ProductSearchResult = {
  productId: string
  productName: string
  chargeCode: string
  chargeCodeName: string
  chargeUnit: string | null
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    q: url.searchParams.get('q') || undefined,
    chargeCode: url.searchParams.get('chargeCode') || undefined,
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
  }

  const parse = searchSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parse.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((id) => { if (typeof id === 'string') allowedOrgIds.add(id) })
  } else if (typeof auth.actorOrgId === 'string') {
    allowedOrgIds.add(auth.actorOrgId)
  } else if (typeof auth.orgId === 'string') {
    allowedOrgIds.add(auth.orgId)
  }

  // Build product filters
  const productFilters: Record<string, unknown> = {
    isActive: true,
    deletedAt: null,
  }

  if (tenantId) {
    productFilters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    productFilters.organizationId = { $in: [...allowedOrgIds] }
  }

  // Fetch products with charge codes
  const products = await em.find(FmsProduct, productFilters, {
    populate: ['chargeCode'],
    orderBy: { name: 'ASC' },
  })

  // Build search results
  const results: ProductSearchResult[] = []

  for (const product of products) {
    // Apply search filter
    if (parse.data.q) {
      const searchTerm = parse.data.q.toLowerCase()
      const matchesName = product.name.toLowerCase().includes(searchTerm)
      const matchesCode = product.chargeCode?.code?.toLowerCase().includes(searchTerm)
      if (!matchesName && !matchesCode) continue
    }

    // Apply charge code filter
    if (parse.data.chargeCode && product.chargeCode?.code !== parse.data.chargeCode) {
      continue
    }

    results.push({
      productId: product.id,
      productName: product.name,
      chargeCode: product.chargeCode?.code || '',
      chargeCodeName: product.chargeCode?.description || product.chargeCode?.code || '',
      chargeUnit: product.chargeCode?.chargeUnit || null,
    })
  }

  // Paginate
  const total = results.length
  const start = (parse.data.page - 1) * parse.data.limit
  const paginatedResults = results.slice(start, start + parse.data.limit)

  return NextResponse.json({
    items: paginatedResults,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
}
