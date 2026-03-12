/**
 * Client Matcher
 *
 * Attempts to match shipper or consignee names from extracted document data
 * against existing contractors using Meilisearch for fuzzy, typo-tolerant matching.
 */

import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_projects.client_matcher')

export interface ClientMatchResult {
  contractorId: string
  name: string
  matchedField: 'shipper' | 'consignee'
}

interface SearchResult {
  recordId: string
  entityType: string
  presenter?: {
    title?: string
    subtitle?: string
  }
}

interface SearchResponse {
  results: SearchResult[]
}

interface SearchService {
  search: (
    query: string,
    options: {
      entityTypes?: string[]
      tenantId?: string
      organizationId?: string
      limit?: number
    }
  ) => Promise<SearchResponse>
}

/**
 * Resolve function type for DI container
 */
type ResolveFn = <T = unknown>(name: string) => T

/**
 * Attempts to match shipper or consignee names against existing contractors
 * Uses Meilisearch for fuzzy, typo-tolerant matching
 *
 * @param resolve - DI resolve function
 * @param extractedData - Extracted data from document with shipper/consignee info
 * @param scope - Tenant and organization scope
 * @returns Client match result or null if no match found
 *
 * @example
 * const match = await matchClient(resolve, {
 *   shipper: { name: 'MAERSK LINE' },
 *   consignee: { name: 'ABC Company Ltd' },
 * }, { tenantId, organizationId })
 *
 * if (match) {
 *   console.log(`Matched ${match.matchedField}: ${match.name}`)
 * }
 */
export async function matchClient(
  resolve: ResolveFn,
  extractedData: {
    shipper?: { name?: string } | null
    consignee?: { name?: string } | null
  },
  scope: { tenantId: string; organizationId: string }
): Promise<ClientMatchResult | null> {
  const { tenantId, organizationId } = scope

  // Get search service from DI
  let searchService: SearchService
  try {
    searchService = resolve('searchService') as SearchService
  } catch {
    logger.warn('search_service_unavailable', { tenantId })
    return null
  }

  // Normalize names for matching
  const shipperName = extractedData.shipper?.name?.trim()
  const consigneeName = extractedData.consignee?.name?.trim()

  if (!shipperName && !consigneeName) {
    return null
  }

  // Try shipper first, then consignee
  const namesToMatch: Array<{ name: string; field: 'shipper' | 'consignee' }> = []

  if (shipperName && shipperName.length >= 2) {
    namesToMatch.push({ name: shipperName, field: 'shipper' })
  }
  if (consigneeName && consigneeName.length >= 2) {
    namesToMatch.push({ name: consigneeName, field: 'consignee' })
  }

  for (const { name, field } of namesToMatch) {
    try {
      const results = await searchService.search(name, {
        entityTypes: ['contractors:contractor'],
        tenantId,
        organizationId,
        limit: 1, // Only need top match
      })

      if (results.results && results.results.length > 0) {
        const topMatch = results.results[0]

        logger.debug('client_match_found', {
          field,
          searchName: name,
          matchedId: topMatch.recordId,
          matchedName: topMatch.presenter?.title,
        })

        return {
          contractorId: topMatch.recordId,
          name: topMatch.presenter?.title || name,
          matchedField: field,
        }
      }
    } catch (error) {
      logger.warn('search_failed', {
        field,
        name,
        error: error instanceof Error ? error.message : String(error),
      })
      // Continue to next name if search fails
    }
  }

  logger.debug('no_client_match', {
    shipperName,
    consigneeName,
  })

  return null
}
