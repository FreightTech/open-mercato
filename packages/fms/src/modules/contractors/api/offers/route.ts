import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
}

const querySchema = z.object({
  contractorId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const organizationId = scope.selectedId
  const tenantId = scope.tenantId

  if (!organizationId || !tenantId) {
    return NextResponse.json({ error: 'Organization scope required' }, { status: 400 })
  }

  const url = new URL(request.url)
  const queryRaw: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    queryRaw[key] = value
  })

  const parsed = querySchema.safeParse(queryRaw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { contractorId, page, pageSize } = parsed.data
  const offset = (page - 1) * pageSize

  const em = container.resolve('em') as EntityManager
  const conn = em.getConnection()

  // Look up contractor name to match against RFQ company_name
  const [contractor] = await conn.execute(
    `SELECT name FROM contractors WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [contractorId, tenantId]
  )

  if (!contractor) {
    return NextResponse.json({ items: [], total: 0, page, pageSize, totalPages: 0 })
  }

  // Query offers linked to contractor via rfq.company_name matching contractor name
  const query = `
    SELECT
      o.id,
      o.offer_number as "offerNumber",
      o.version,
      o.status,
      o.direction,
      o.transport_mode as "transportMode",
      o.valid_until as "validUntil",
      o.sent_at as "sentAt",
      o.sent_to_email as "sentToEmail",
      o.created_at as "createdAt",
      r.title as "rfqTitle",
      r.id as "rfqId"
    FROM fms_offers o
    LEFT JOIN fms_rfqs r ON r.id = o.rfq_id
    WHERE
      o.organization_id = ?
      AND o.tenant_id = ?
      AND o.deleted_at IS NULL
      AND r.company_name = ?
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `

  const countQuery = `
    SELECT COUNT(*) as total
    FROM fms_offers o
    LEFT JOIN fms_rfqs r ON r.id = o.rfq_id
    WHERE
      o.organization_id = ?
      AND o.tenant_id = ?
      AND o.deleted_at IS NULL
      AND r.company_name = ?
  `

  const [offers, countResult] = await Promise.all([
    conn.execute(query, [organizationId, tenantId, contractor.name, pageSize, offset]),
    conn.execute(countQuery, [organizationId, tenantId, contractor.name]),
  ])

  const total = parseInt(countResult[0]?.total ?? '0', 10)

  return NextResponse.json({
    items: offers,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
