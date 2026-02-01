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

  // Query projects where contractor is linked in various roles
  const projectQuery = `
    SELECT
      p.id,
      p.project_number as "projectNumber",
      p.current_step as "currentStep",
      p.shipment_type as "shipmentType",
      p.direction,
      p.project_date as "projectDate",
      p.origin_address as "originAddress",
      p.destination_address as "destinationAddress",
      CASE
        WHEN p.client_id = ? THEN 'client'
        WHEN p.shipper_id = ? THEN 'shipper'
        WHEN p.consignee_id = ? THEN 'consignee'
        WHEN p.notify_party_id = ? THEN 'notify_party'
        WHEN p.controlling_agent_id = ? THEN 'controlling_agent'
        WHEN p.sending_agent_id = ? THEN 'sending_agent'
        WHEN p.receiving_agent_id = ? THEN 'receiving_agent'
        WHEN p.creditor_id = ? THEN 'creditor'
        ELSE 'other'
      END as role,
      p.created_at as "createdAt"
    FROM fms_projects p
    WHERE
      p.organization_id = ?
      AND p.tenant_id = ?
      AND p.deleted_at IS NULL
      AND (
        p.client_id = ?
        OR p.shipper_id = ?
        OR p.consignee_id = ?
        OR p.notify_party_id = ?
        OR p.controlling_agent_id = ?
        OR p.sending_agent_id = ?
        OR p.receiving_agent_id = ?
        OR p.creditor_id = ?
      )
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `

  const countQuery = `
    SELECT COUNT(*) as total
    FROM fms_projects p
    WHERE
      p.organization_id = ?
      AND p.tenant_id = ?
      AND p.deleted_at IS NULL
      AND (
        p.client_id = ?
        OR p.shipper_id = ?
        OR p.consignee_id = ?
        OR p.notify_party_id = ?
        OR p.controlling_agent_id = ?
        OR p.sending_agent_id = ?
        OR p.receiving_agent_id = ?
        OR p.creditor_id = ?
      )
  `

  // Also check for carrier in project legs
  const legQuery = `
    SELECT DISTINCT
      p.id,
      p.project_number as "projectNumber",
      p.current_step as "currentStep",
      p.shipment_type as "shipmentType",
      p.direction,
      p.project_date as "projectDate",
      p.origin_address as "originAddress",
      p.destination_address as "destinationAddress",
      'carrier' as role,
      p.created_at as "createdAt"
    FROM fms_projects p
    INNER JOIN fms_project_legs l ON l.project_id = p.id
    WHERE
      p.organization_id = ?
      AND p.tenant_id = ?
      AND p.deleted_at IS NULL
      AND l.carrier_id = ?
      AND l.deleted_at IS NULL
  `

  // Parameters for projectQuery:
  // - 8 placeholders in CASE for contractorId
  // - 2 for organizationId, tenantId
  // - 8 in WHERE OR for contractorId
  // - 2 for pageSize, offset
  const projectParams = [
    contractorId, contractorId, contractorId, contractorId,
    contractorId, contractorId, contractorId, contractorId,
    organizationId, tenantId,
    contractorId, contractorId, contractorId, contractorId,
    contractorId, contractorId, contractorId, contractorId,
    pageSize, offset,
  ]

  // Parameters for countQuery:
  // - 2 for organizationId, tenantId
  // - 8 in WHERE OR for contractorId
  const countParams = [
    organizationId, tenantId,
    contractorId, contractorId, contractorId, contractorId,
    contractorId, contractorId, contractorId, contractorId,
  ]

  // Parameters for legQuery:
  // - 2 for organizationId, tenantId
  // - 1 for carrier_id
  const legParams = [organizationId, tenantId, contractorId]

  const [projects, countResult, carrierProjects] = await Promise.all([
    conn.execute(projectQuery, projectParams),
    conn.execute(countQuery, countParams),
    conn.execute(legQuery, legParams),
  ])

  // Merge carrier projects if not already included
  const projectIds = new Set(projects.map((p: { id: string }) => p.id))
  const allProjects = [
    ...projects,
    ...carrierProjects.filter((p: { id: string }) => !projectIds.has(p.id)),
  ]

  // Sort by createdAt desc and apply pagination
  allProjects.sort((a: { createdAt: string }, b: { createdAt: string }) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const total = parseInt(countResult[0]?.total ?? '0', 10) +
    carrierProjects.filter((p: { id: string }) => !projectIds.has(p.id)).length

  return NextResponse.json({
    items: allProjects.slice(0, pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
