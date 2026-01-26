import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsChargeCode } from '../../fms_products/data/entities'
import type { ChargeCodeMatch, LineItemMatchResult } from '../data/types'

/**
 * ChargeCodeMatcherService - Matches invoice line items to charge codes
 *
 * Matching algorithm:
 * 1. Exact code match - if description contains a charge code
 * 2. Keyword match - intersection with charge code keywords
 * 3. Fuzzy name match - Levenshtein distance on code name
 *
 * Returns top matches sorted by confidence score
 */
export class ChargeCodeMatcherService {
  private em: EntityManager

  constructor(em: EntityManager) {
    this.em = em
  }

  /**
   * Match a single line item description to charge codes
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
    // Get all active charge codes for this org/tenant
    const chargeCodes = await this.em.find(
      FmsChargeCode,
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

    if (chargeCodes.length === 0) {
      return []
    }

    // Normalize description for matching
    const normalizedDesc = this.normalizeText(description)
    const descWords = this.extractWords(normalizedDesc)

    // Score each charge code
    const scored: Array<ChargeCodeMatch & { score: number }> = []

    for (const cc of chargeCodes) {
      const match = this.scoreChargeCode(cc, normalizedDesc, descWords)
      if (match.score > 0) {
        scored.push({
          chargeCodeId: cc.id,
          code: cc.code,
          name: cc.name ?? null,
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
   * Score a charge code against a description
   */
  private scoreChargeCode(
    chargeCode: FmsChargeCode,
    normalizedDesc: string,
    descWords: Set<string>
  ): { score: number; reason: string } {
    let totalScore = 0
    const reasons: string[] = []

    // 1. Exact code match in description (highest priority)
    const codeNormalized = this.normalizeText(chargeCode.code)
    if (normalizedDesc.includes(codeNormalized)) {
      totalScore += 80
      reasons.push(`Code "${chargeCode.code}" found in description`)
    }

    // 2. Code name match
    if (chargeCode.name) {
      const nameNormalized = this.normalizeText(chargeCode.name)
      const nameWords = this.extractWords(nameNormalized)

      // Check for name substring match
      if (normalizedDesc.includes(nameNormalized)) {
        totalScore += 70
        reasons.push(`Name "${chargeCode.name}" found in description`)
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

    // 3. Keyword matching (if keywords exist)
    if (chargeCode.keywords && chargeCode.keywords.length > 0) {
      const keywordSet = new Set(
        chargeCode.keywords.map((k) => this.normalizeText(k))
      )

      let keywordMatches = 0
      for (const keyword of keywordSet) {
        if (normalizedDesc.includes(keyword)) {
          keywordMatches++
        }
      }

      if (keywordMatches > 0) {
        const keywordScore = Math.min(60, keywordMatches * 25)
        totalScore += keywordScore
        reasons.push(`${keywordMatches} keyword(s) matched`)
      }
    }

    // 4. Common freight terms matching
    const freightTermScore = this.matchFreightTerms(normalizedDesc, chargeCode.code)
    if (freightTermScore !== null && freightTermScore.score > 0) {
      totalScore += freightTermScore.score
      reasons.push(freightTermScore.reason)
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
