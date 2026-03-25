/**
 * Shared helper to build tenant/organization scope filters for MikroORM queries.
 * Used across all fms_files API routes to enforce tenant isolation.
 */

type AuthScope = {
  tenantId?: string | null
  orgId?: string | null
}

type OrganizationScope = {
  tenantId?: string | null
  selectedId?: string | null
  filterIds?: string[] | null
  allowedIds?: string[] | null
} | null

type ScopeFilters = {
  tenantId?: string
  organizationId?: { $in: string[] }
}

export function buildScopeFilters(auth: AuthScope, scope: OrganizationScope): ScopeFilters {
  const filters: ScopeFilters = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const orgIdsSet = new Set<string>()
  const filterIds = scope?.filterIds
  const allowedIds = scope?.allowedIds
  const fallbackOrgId = scope?.selectedId ?? auth.orgId ?? null

  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => { if (typeof id === 'string') orgIdsSet.add(id) })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => { if (typeof id === 'string') orgIdsSet.add(id) })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) {
    filters.organizationId = { $in: [...orgIdsSet] }
  }

  return filters
}
