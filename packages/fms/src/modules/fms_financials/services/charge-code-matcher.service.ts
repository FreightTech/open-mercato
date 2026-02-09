import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProduct } from '../../fms_products/data/entities'
import type { ChargeCodeMatch, LineItemMatchResult } from '../data/types'

/**
 * ChargeCodeMatcherService - Matches invoice line items to products
 *
 * Matching algorithm:
 * 1. Exact charge code match - if description contains a product's charge code
 * 2. Name match - substring or word overlap with product name
 * 3. Freight terms match - common freight industry terms to charge codes
 *
 * Returns top matches sorted by confidence score
 */
export class ChargeCodeMatcherService {
  private em: EntityManager

  constructor(em: EntityManager) {
    this.em = em
  }

  /**
   * Match a single line item description to products
   *
   * @param description - The line item description to match
   * @param organizationId - Organization scope
   * @param tenantId - Tenant scope
   * @param limit - Maximum number of matches to return (default 5)
   */
  async matchLineItem(
    description: string,
    organizationId: string,
    tenantId: string,
    limit: number = 5
  ): Promise<ChargeCodeMatch[]> {
    // Get all active products for this org/tenant
    const products = await this.em.find(
      FmsProduct,
      {
        organizationId,
        tenantId,
        isActive: true,
        deletedAt: null,
      },
      {
        limit: 1000, // Reasonable limit for matching
      }
    )

    if (products.length === 0) {
      return []
    }

    // Normalize description for matching
    const normalizedDesc = this.normalizeText(description)
    const descWords = this.extractWords(normalizedDesc)

    // Score each product
    const scored: Array<ChargeCodeMatch & { score: number }> = []

    for (const product of products) {
      const match = this.scoreProduct(product, normalizedDesc, descWords)
      if (match.score > 0) {
        scored.push({
          productId: product.id,
          chargeCode: product.chargeCode ?? null,
          name: product.name ?? null,
          confidence: Math.min(100, Math.round(match.score)),
          matchReason: match.reason,
          score: match.score,
        })
      }
    }

    // Sort by score descending and take top N
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map(({ score, ...rest }) => rest)
  }

  /**
   * Match multiple line items and return best matches for each
   */
  async matchLineItems(
    lineItems: Array<{ id: string; description: string }>,
    organizationId: string,
    tenantId: string
  ): Promise<LineItemMatchResult[]> {
    const results: LineItemMatchResult[] = []

    for (const item of lineItems) {
      const matches = await this.matchLineItem(
        item.description,
        organizationId,
        tenantId
      )

      results.push({
        lineItemId: item.id,
        matches,
        bestMatch: matches.length > 0 ? matches[0] : null,
      })
    }

    return results
  }

  /**
   * Normalize text for matching
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Extract meaningful words from text
   */
  private extractWords(text: string): Set<string> {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'uslugi', 'usluga', 'za', 'na', 'do', 'od', 'z', 'w', 'i', 'oraz',
    ])

    return new Set(
      text
        .split(' ')
        .filter((w) => w.length > 2 && !stopWords.has(w))
    )
  }

  /**
   * Score a product against a description
   */
  private scoreProduct(
    product: FmsProduct,
    normalizedDesc: string,
    descWords: Set<string>
  ): { score: number; reason: string } {
    let totalScore = 0
    const reasons: string[] = []

    // 1. Exact charge code match in description (highest priority)
    if (product.chargeCode) {
      const codeNormalized = this.normalizeText(product.chargeCode)
      if (normalizedDesc.includes(codeNormalized)) {
        totalScore += 80
        reasons.push(`Charge code "${product.chargeCode}" found in description`)
      }
    }

    // 2. Product name match
    if (product.name) {
      const nameNormalized = this.normalizeText(product.name)
      const nameWords = this.extractWords(nameNormalized)

      // Check for name substring match
      if (normalizedDesc.includes(nameNormalized)) {
        totalScore += 70
        reasons.push(`Name "${product.name}" found in description`)
      } else {
        // Check word overlap
        const overlap = this.countOverlap(descWords, nameWords)
        if (overlap > 0) {
          const overlapScore = Math.min(50, overlap * 20)
          totalScore += overlapScore
          reasons.push(`${overlap} word(s) match name`)
        }
      }
    }

    // 3. Common freight terms matching
    if (product.chargeCode) {
      const freightTermScore = this.matchFreightTerms(normalizedDesc, product.chargeCode)
      if (freightTermScore !== null && freightTermScore.score > 0) {
        totalScore += freightTermScore.score
        reasons.push(freightTermScore.reason)
      }
    }

    return {
      score: Math.min(100, totalScore),
      reason: reasons.join('; ') || 'No match',
    }
  }

  /**
   * Count word overlap between two sets
   */
  private countOverlap(set1: Set<string>, set2: Set<string>): number {
    let count = 0
    for (const word of set1) {
      if (set2.has(word)) count++
    }
    return count
  }

  /**
   * Match common freight industry terms to charge codes
   */
  private matchFreightTerms(
    normalizedDesc: string,
    chargeCode: string
  ): { score: number; reason: string } | null {
    // Map of common freight terms to charge codes
    const termMappings: Record<string, string[]> = {
      // Ocean freight terms
      freight: ['GFRT', 'OF', 'OFR'],
      ocean: ['GFRT', 'OF', 'OFR'],
      fracht: ['GFRT', 'OF', 'OFR'], // Polish
      morski: ['GFRT', 'OF', 'OFR'], // Polish

      // THC terms
      terminal: ['GTHC', 'THC', 'OTHC', 'DTHC'],
      handling: ['GTHC', 'THC'],
      port: ['GTHC', 'THC', 'POL', 'POD'],

      // BAF terms
      baf: ['GBAF', 'BAF'],
      bunker: ['GBAF', 'BAF'],
      fuel: ['GBAF', 'BAF'],

      // Documentation
      bl: ['GBOL', 'BL', 'DOC'],
      lading: ['GBOL', 'BL'],
      konosament: ['GBOL', 'BL'], // Polish

      // Customs
      customs: ['GCUS', 'CUS', 'CLR'],
      celna: ['GCUS', 'CUS', 'CLR'], // Polish
      odprawa: ['GCUS', 'CUS', 'CLR'], // Polish

      // Container related
      container: ['GFRT', 'CNT'],
      kontener: ['GFRT', 'CNT'], // Polish

      // Insurance
      insurance: ['INS', 'CIF'],
      ubezpieczenie: ['INS', 'CIF'], // Polish

      // Demurrage/Detention
      demurrage: ['DEM', 'DMG'],
      detention: ['DET', 'DTN'],
      przestoj: ['DEM', 'DET'], // Polish
    }

    for (const [term, codes] of Object.entries(termMappings)) {
      if (normalizedDesc.includes(term) && codes.includes(chargeCode.toUpperCase())) {
        return {
          score: 40,
          reason: `Term "${term}" matches charge type`,
        }
      }
    }

    return null
  }
}

/**
 * Factory function for DI
 */
export function createChargeCodeMatcherService(em: EntityManager): ChargeCodeMatcherService {
  return new ChargeCodeMatcherService(em)
}
