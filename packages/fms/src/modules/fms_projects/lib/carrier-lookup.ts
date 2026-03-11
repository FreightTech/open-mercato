/**
 * Carrier Lookup Service
 *
 * Provides utilities for looking up carrier entities by name or code.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsCarrier } from '../../fms_products/data/entities'
import { detectCarrierCodeFromName } from './carrier-scac-mapper'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_projects.carrier_lookup')

/**
 * Result of a carrier lookup operation.
 */
export interface CarrierLookupResult {
  id: string
  name: string
}

/**
 * Escape SQL LIKE wildcard characters (% and _) in search terms
 * to treat them as literal characters in LIKE patterns.
 *
 * This prevents SQL injection through LIKE pattern manipulation.
 *
 * @param input - The search term to escape
 * @returns The escaped search term safe for use in LIKE patterns
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Lookup carrier entity by name using direct database query.
 * Searches both code and name fields.
 *
 * Strategy:
 * 1. Normalize carrier name to SCAC code using existing patterns
 * 2. Try exact match on code (case-insensitive)
 * 3. If no exact match, try partial name match (LIKE '%term%')
 *
 * @param em - Entity manager for database queries
 * @param carrierName - The carrier name to search for
 * @param tenantId - Tenant ID for scoping
 * @param organizationId - Organization ID for scoping
 * @returns Carrier lookup result or null if not found
 */
export async function lookupCarrierByName(
  em: EntityManager,
  carrierName: string,
  tenantId: string,
  organizationId: string
): Promise<CarrierLookupResult | null> {
  // Normalize to carrier code using existing patterns (for better matching)
  const carrierCode = detectCarrierCodeFromName(carrierName)
  const searchTerm = carrierCode || carrierName.substring(0, 30).trim()

  if (searchTerm.length < 2) return null

  try {
    // Try exact match on code first
    let carrier = await em.findOne(FmsCarrier, {
      code: searchTerm.toUpperCase(),
      tenantId,
      organizationId,
      deletedAt: null,
    })

    // If no exact match, try partial name match
    // Note: escape SQL wildcards to prevent LIKE pattern injection
    if (!carrier) {
      const escapedTerm = escapeLikePattern(searchTerm)
      carrier = await em.findOne(FmsCarrier, {
        name: { $like: `%${escapedTerm}%` },
        tenantId,
        organizationId,
        deletedAt: null,
      })
    }

    if (carrier) {
      return { id: carrier.id, name: carrier.name }
    }

    return null
  } catch (error) {
    logger.warn('carrier_lookup_failed', {
      carrierName,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
