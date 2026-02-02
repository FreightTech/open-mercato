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
  contractType: z.enum(['SPOT', 'NAC', 'BASKET']).optional(),
  containerSize: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})

type ProductSearchResult = {
  productId: string
  productName: string
  productType: string
  chargeCode: string
  chargeCodeName: string
  variantId: string | null
  variantName?: string | null
  containerSize?: string | null
  priceId: string | null
  price: string | null
  currencyCode: string | null
  contractType: string | null
  contractNumber?: string | null
  validityStart: string | null
  validityEnd?: string | null
  providerContractorId?: string | null
  loop?: string | null
  source?: string | null
  destination?: string | null
  transitTime?: number | null
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    q: url.searchParams.get('q') || undefined,
    chargeCode: url.searchParams.get('chargeCode') || undefined,
    contractType: url.searchParams.get('contractType') || undefined,
    containerSize: url.searchParams.get('containerSize') || undefined,
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

  // Fetch products with charge codes, variants, prices, and related entities
  const products = await em.find(FmsProduct, productFilters, {
    populate: ['chargeCode', 'variants', 'variants.prices', 'variants.provider', 'serviceProvider'],
    orderBy: { name: 'ASC' },
  })

  // Build search results by flattening product -> variant -> price hierarchy
  const today = new Date()
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

    // Get product type-specific fields
    const productType = product.productType
    let loop: string | null = null
    let source: string | null = null
    let destination: string | null = null
    let transitTime: number | null = null

    if (productType === 'GFRT') {
      loop = product.loop || null
      // source and destination are FmsLocation relations - get code if populated
      source = (product.source as unknown as { code?: string })?.code ?? null
      destination = (product.destination as unknown as { code?: string })?.code ?? null
      transitTime = product.transitTime ?? null
    }

    const variants = product.variants.getItems().filter((v) => v.isActive && !v.deletedAt)

    // If no variants, still return the product
    if (variants.length === 0) {
      // Skip if contract type filter is set (requires price)
      if (parse.data.contractType) continue

      results.push({
        productId: product.id,
        productName: product.name,
        productType,
        chargeCode: product.chargeCode?.code || '',
        chargeCodeName: product.chargeCode?.description || product.chargeCode?.code || '',
        variantId: null,
        variantName: null,
        containerSize: null,
        priceId: null,
        price: null,
        currencyCode: null,
        contractType: null,
        contractNumber: null,
        validityStart: null,
        validityEnd: null,
        providerContractorId: null,
        loop,
        source,
        destination,
        transitTime,
      })
      continue
    }

    for (const variant of variants) {
      // Apply container size filter
      const containerSize = variant.containerSize || null
      if (variant.variantType === 'container' && parse.data.containerSize && containerSize !== parse.data.containerSize) {
        continue
      }

      const prices = variant.prices.getItems().filter((p) => p.isActive && !p.deletedAt)

      // If no prices, still return the variant
      if (prices.length === 0) {
        // Skip if contract type filter is set (requires price)
        if (parse.data.contractType) continue

        results.push({
          productId: product.id,
          productName: product.name,
          productType,
          chargeCode: product.chargeCode?.code || '',
          chargeCodeName: product.chargeCode?.description || product.chargeCode?.code || '',
          variantId: variant.id,
          variantName: variant.name,
          containerSize,
          priceId: null,
          price: null,
          currencyCode: null,
          contractType: null,
          contractNumber: null,
          validityStart: null,
          validityEnd: null,
          providerContractorId: variant.provider?.id ?? null,
          loop,
          source,
          destination,
          transitTime,
        })
        continue
      }

      for (const price of prices) {
        // Apply contract type filter
        if (parse.data.contractType && price.contractType !== parse.data.contractType) {
          continue
        }

        // Check validity dates
        const validityStart = new Date(price.validityStart)
        const validityEnd = price.validityEnd ? new Date(price.validityEnd) : null

        // Only include currently valid prices or future prices
        if (validityEnd && validityEnd < today) continue

        results.push({
          productId: product.id,
          productName: product.name,
          productType,
          chargeCode: product.chargeCode?.code || '',
          chargeCodeName: product.chargeCode?.description || product.chargeCode?.code || '',
          variantId: variant.id,
          variantName: variant.name,
          containerSize,
          priceId: price.id,
          price: price.price,
          currencyCode: price.currencyCode,
          contractType: price.contractType,
          contractNumber: price.contractNumber,
          validityStart: validityStart.toISOString().split('T')[0],
          validityEnd: validityEnd?.toISOString().split('T')[0] ?? null,
          providerContractorId: variant.provider?.id ?? null,
          loop,
          source,
          destination,
          transitTime,
        })
      }
    }
  }

  // Sort results: NAC > BASKET > SPOT, then by validity date (items without prices last)
  const contractTypePriority: Record<string, number> = { NAC: 1, BASKET: 2, SPOT: 3 }
  results.sort((a, b) => {
    const aPriority = a.contractType ? (contractTypePriority[a.contractType] || 99) : 100
    const bPriority = b.contractType ? (contractTypePriority[b.contractType] || 99) : 100
    const priorityDiff = aPriority - bPriority
    if (priorityDiff !== 0) return priorityDiff
    const aTime = a.validityStart ? new Date(a.validityStart).getTime() : 0
    const bTime = b.validityStart ? new Date(b.validityStart).getTime() : 0
    return bTime - aTime
  })

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
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.view'] },
}
