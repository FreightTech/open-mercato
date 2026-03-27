import type { EntityManager } from '@mikro-orm/postgresql'
import { Contractor } from '../../contractors/data/entities'

export interface ContractorMatchResult {
  contractorId: string
  contractorName: string
}

/**
 * Normalize a tax ID by stripping dashes, spaces, and common prefixes.
 */
function normalizeTaxId(taxId: string): string {
  return taxId.replace(/[\s\-\.]/g, '').replace(/^PL/i, '').trim()
}

/**
 * Match a contractor by tax ID within the tenant/org scope.
 */
export async function matchContractorByTaxId(
  em: EntityManager,
  taxId: string | null | undefined,
  scope: { tenantId: string; organizationId: string }
): Promise<ContractorMatchResult | null> {
  if (!taxId || taxId.trim().length === 0) return null

  const normalized = normalizeTaxId(taxId)
  if (normalized.length === 0) return null

  // Query all active contractors with a tax ID and check normalized match
  const contractors = await em.find(
    Contractor,
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      isActive: true,
      deletedAt: null,
      taxId: { $ne: null },
    },
    { fields: ['id', 'name', 'taxId'], limit: 100 }
  )

  for (const c of contractors) {
    if (c.taxId && normalizeTaxId(c.taxId) === normalized) {
      return { contractorId: c.id, contractorName: c.name }
    }
  }

  return null
}
