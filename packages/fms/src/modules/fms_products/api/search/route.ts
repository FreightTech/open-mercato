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
  containerSize: z.string().optional(),
  variantsOnly: z.coerce.boolean().optional().default(false),
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
  containerSize?: string | null
  price: string | null
  currencyCode: string | null
  reference?: string | null
  validityStart: string | null
  validityEnd?: string | null
  providerContractorId?: string | null
  providerName?: string | null
  loop?: string | null
  source?: string | null
  destination?: string | null
  sourceId?: string | null
  destinationId?: string | null
  transitTime?: number | null
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    q: url.searchParams.get('q') || undefined,
    chargeCode: url.searchParams.get('chargeCode') || undefined,
    containerSize: url.searchParams.get('containerSize') || undefined,
    variantsOnly: url.searchParams.get('variantsOnly') || undefined,
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

  // Fetch products with charge codes, variants, and related entities
  const products = await em.find(FmsProduct, productFilters, {
    populate: ['chargeCode', 'variants', 'variants.provider', 'carrier', 'source', 'destination'],
    orderBy: { name: 'ASC' },
  })

  // Build search results by flattening product -> variant hierarchy
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

    // Derive product type from charge code
    const chargeCodeValue = product.chargeCode?.code || null
    const systemTypes = ['GFRT', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GTHC', 'GCUS']
    const productType = chargeCodeValue && systemTypes.includes(chargeCodeValue) ? chargeCodeValue : 'CUSTOM'

    // Get product fields - source/destination/loop/transitTime can exist on any product type
    const loop: string | null = product.loop || null
    const sourceLocation = product.source as unknown as { id?: string; name?: string } | null
    const destinationLocation = product.destination as unknown as { id?: string; name?: string } | null
    const source: string | null = sourceLocation?.name ?? null
    const destination: string | null = destinationLocation?.name ?? null
    const sourceId: string | null = sourceLocation?.id ?? null
    const destinationId: string | null = destinationLocation?.id ?? null
    const transitTime: number | null = product.transitTime ?? null

    const variants = product.variants.getItems().filter((v) => v.isActive && !v.deletedAt)

    // If no variants, optionally return the product (based on variantsOnly flag)
    if (variants.length === 0) {
      // Skip products without variants if variantsOnly is true
      if (parse.data.variantsOnly) continue

      results.push({
        productId: product.id,
        productName: product.name,
        productType,
        chargeCode: product.chargeCode?.code || '',
        chargeCodeName: product.chargeCode?.description || product.chargeCode?.code || '',
        variantId: null,
        containerSize: null,
        price: null,
        currencyCode: null,
        reference: null,
        validityStart: null,
        validityEnd: null,
        providerContractorId: null,
        providerName: null,
        loop,
        source,
        destination,
        sourceId,
        destinationId,
        transitTime,
      })
      continue
    }

    for (const variant of variants) {
      // Apply container size filter
      const containerSize = variant.containerSize || null
      if (parse.data.containerSize && containerSize && containerSize !== parse.data.containerSize) {
        continue
      }

      // Check validity dates (skip expired)
      const validityStart = variant.validityStart ? new Date(variant.validityStart) : null
      const validityEnd = variant.validityEnd ? new Date(variant.validityEnd) : null

      // Only include currently valid prices or future prices
      if (validityEnd && validityEnd < today) continue

      results.push({
        productId: product.id,
        productName: product.name,
        productType,
        chargeCode: product.chargeCode?.code || '',
        chargeCodeName: product.chargeCode?.description || product.chargeCode?.code || '',
        variantId: variant.id,
        containerSize,
        price: variant.price ?? null,
        currencyCode: variant.currencyCode || 'USD',
        reference: variant.reference,
        validityStart: validityStart ? validityStart.toISOString().split('T')[0] : null,
        validityEnd: validityEnd ? validityEnd.toISOString().split('T')[0] : null,
        providerContractorId: variant.provider?.id ?? null,
        providerName: variant.provider?.name ?? null,
        loop,
        source,
        destination,
        sourceId,
        destinationId,
        transitTime,
      })
    }
  }

  // Sort results by validity date (newest first), items without validity last
  results.sort((a, b) => {
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
