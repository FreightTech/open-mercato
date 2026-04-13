import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { HsClassification } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs.view'] },
}

export const openApi = {
  GET: {
    summary: 'Search past HS classifications by product description',
    tags: ['customs'],
  },
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const query = url.searchParams.get('q') ?? ''

  if (query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  // Find past classifications where agent selected an HS code, matching by product description
  const filter: Record<string, unknown> = {
    tenantId: auth.tenantId,
    selectedHsCode: { $ne: null },
  }
  if (auth.orgId) {
    filter.organizationId = auth.orgId
  }

  const allSelected = await em.find(HsClassification, filter, {
    orderBy: { createdAt: 'desc' } as never,
    limit: 200,
  })

  // Filter by description similarity (case-insensitive substring match)
  const queryLower = query.toLowerCase()
  const matching = allSelected.filter((c) =>
    c.productDescription.toLowerCase().includes(queryLower) ||
    queryLower.includes(c.productDescription.toLowerCase().slice(0, 10)),
  )

  // Deduplicate by selectedHsCode + productDescription
  const seen = new Set<string>()
  const deduplicated = matching.filter((c) => {
    const key = `${c.selectedHsCode}-${c.productDescription}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json({
    results: deduplicated.slice(0, 10).map((c) => ({
      productDescription: c.productDescription,
      selectedHsCode: c.selectedHsCode,
      selectedDescription: c.selectedDescription,
      selectedDutyRate: c.selectedDutyRate,
      selectedAt: c.selectedAt?.toISOString() ?? null,
    })),
  })
}
