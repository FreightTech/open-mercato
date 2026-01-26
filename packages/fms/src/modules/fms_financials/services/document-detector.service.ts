import type { DocumentType, DocumentDetectionResult, ExtractionSchema } from '../data/schema-types'
import type { SchemaRegistry } from './schema-registry.service'

/**
 * DocumentDetector - Detects document type using weighted pattern matching
 *
 * Responsibilities:
 * - Score document text against all schema detection patterns
 * - Check required patterns
 * - Return best match with confidence score (0-100)
 */
export class DocumentDetector {
  constructor(private schemaRegistry: SchemaRegistry) {}

  /**
   * Detect document type from raw text
   *
   * @param text - The OCR-extracted text from the document
   * @returns Detection result with document type and confidence
   */
  async detect(text: string): Promise<DocumentDetectionResult> {
    const configs = await this.schemaRegistry.getDetectionConfigs()
    const normalizedText = this.normalizeText(text)

    const scores: Record<DocumentType, { score: number; matchedPatterns: string[] }> = {
      invoice: { score: 0, matchedPatterns: [] },
      bill_of_lading: { score: 0, matchedPatterns: [] },
      delivery_note: { score: 0, matchedPatterns: [] },
      customs_declaration: { score: 0, matchedPatterns: [] },
      unknown: { score: 0, matchedPatterns: [] },
    }

    for (const { documentType, schema } of configs) {
      const result = this.scoreDocument(normalizedText, schema)
      scores[documentType] = result
    }

    // Find the best match
    let bestType: DocumentType = 'unknown'
    let bestScore = 0
    let bestMatchedPatterns: string[] = []

    for (const [docType, { score, matchedPatterns }] of Object.entries(scores)) {
      const schema = await this.schemaRegistry.getSchema(docType as DocumentType)
      if (!schema) continue

      // Check minimum score threshold
      if (score >= schema.detection.minScore && score > bestScore) {
        bestType = docType as DocumentType
        bestScore = score
        bestMatchedPatterns = matchedPatterns
      }
    }

    // Calculate confidence (0-100) based on score relative to maximum possible
    const confidence = this.calculateConfidence(bestScore, bestType, configs)

    return {
      documentType: bestType,
      confidence,
      matchedPatterns: bestMatchedPatterns,
      allScores: Object.fromEntries(
        Object.entries(scores).map(([k, v]) => [k, v.score])
      ) as Record<DocumentType, number>,
    }
  }

  /**
   * Normalize text for pattern matching
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Score document against a single schema's detection config
   */
  private scoreDocument(
    normalizedText: string,
    schema: ExtractionSchema
  ): { score: number; matchedPatterns: string[] } {
    let score = 0
    const matchedPatterns: string[] = []
    const detection = schema.detection

    // Check all patterns
    for (const pattern of detection.patterns) {
      try {
        const regex = new RegExp(pattern.regex, 'gi')
        if (regex.test(normalizedText)) {
          score += pattern.weight
          matchedPatterns.push(pattern.regex)
        }
      } catch {
        // Invalid regex, skip
      }
    }

    // Check required patterns - if none match, score is 0
    if (detection.requiredPatterns?.length) {
      const hasRequired = detection.requiredPatterns.some((reqPattern) => {
        try {
          const regex = new RegExp(reqPattern, 'gi')
          return regex.test(normalizedText)
        } catch {
          return false
        }
      })

      if (!hasRequired) {
        return { score: 0, matchedPatterns: [] }
      }
    }

    return { score, matchedPatterns }
  }

  /**
   * Calculate confidence score (0-100)
   */
  private calculateConfidence(
    score: number,
    documentType: DocumentType,
    configs: Array<{ documentType: DocumentType; schema: ExtractionSchema }>
  ): number {
    if (documentType === 'unknown' || score === 0) {
      return 0
    }

    // Find the schema for this document type
    const config = configs.find((c) => c.documentType === documentType)
    if (!config) return 0

    // Calculate max possible score for this schema
    const maxScore = config.schema.detection.patterns.reduce((sum, p) => sum + p.weight, 0)

    if (maxScore === 0) return 0

    // Confidence is the percentage of max score achieved, capped at 100
    return Math.min(100, Math.round((score / maxScore) * 100))
  }

  /**
   * Check if a specific document type matches
   */
  async matchesType(text: string, documentType: DocumentType): Promise<boolean> {
    const result = await this.detect(text)
    return result.documentType === documentType
  }

  /**
   * Get detection scores for all document types without selecting best
   */
  async getScores(text: string): Promise<Record<DocumentType, number>> {
    const result = await this.detect(text)
    return result.allScores
  }
}

/**
 * Factory function to create DocumentDetector
 */
export function createDocumentDetector(schemaRegistry: SchemaRegistry): DocumentDetector {
  return new DocumentDetector(schemaRegistry)
}
