import { describe, it, expect } from 'vitest'
import { buildScopeFilters } from '../scope-filters'

describe('buildScopeFilters', () => {
  it('includes tenantId from auth', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: null },
      null
    )
    expect(result.tenantId).toBe('tenant-1')
  })

  it('omits tenantId when auth.tenantId is null', () => {
    const result = buildScopeFilters(
      { tenantId: null, orgId: null },
      null
    )
    expect(result.tenantId).toBeUndefined()
  })

  it('uses filterIds when provided (highest priority)', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: 'org-fallback' },
      { filterIds: ['org-1', 'org-2'], allowedIds: ['org-3'], selectedId: 'org-4' }
    )
    expect(result.organizationId).toEqual({ $in: ['org-1', 'org-2'] })
  })

  it('uses allowedIds when filterIds is empty', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: 'org-fallback' },
      { filterIds: [], allowedIds: ['org-a', 'org-b'], selectedId: 'org-c' }
    )
    expect(result.organizationId).toEqual({ $in: ['org-a', 'org-b'] })
  })

  it('uses selectedId when both filterIds and allowedIds are empty', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: 'org-fallback' },
      { filterIds: [], allowedIds: [], selectedId: 'org-selected' }
    )
    expect(result.organizationId).toEqual({ $in: ['org-selected'] })
  })

  it('falls back to auth.orgId when scope has no IDs', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: 'org-auth' },
      { filterIds: null, allowedIds: null, selectedId: null }
    )
    expect(result.organizationId).toEqual({ $in: ['org-auth'] })
  })

  it('omits organizationId when no org IDs available', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: null },
      null
    )
    expect(result.organizationId).toBeUndefined()
  })

  it('deduplicates org IDs in filterIds', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: null },
      { filterIds: ['org-1', 'org-1', 'org-2'], allowedIds: null, selectedId: null }
    )
    expect(result.organizationId).toEqual({ $in: ['org-1', 'org-2'] })
  })

  it('skips non-string values in filterIds', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: null },
      { filterIds: ['org-1', null as any, undefined as any, 42 as any], allowedIds: null, selectedId: null }
    )
    expect(result.organizationId).toEqual({ $in: ['org-1'] })
  })

  it('uses scope.selectedId over auth.orgId', () => {
    const result = buildScopeFilters(
      { tenantId: 'tenant-1', orgId: 'org-auth' },
      { filterIds: null, allowedIds: null, selectedId: 'org-selected' }
    )
    expect(result.organizationId).toEqual({ $in: ['org-selected'] })
  })
})
