import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentDetector, createDocumentDetector } from '../document-detector.service'
import type { SchemaRegistry } from '../schema-registry.service'
import type { DocumentType, ExtractionSchema } from '../../data/schema-types'

// Helper to create mock schema
function createMockSchema(
  documentType: DocumentType,
  patterns: Array<{ regex: string; weight: number }>,
  requiredPatterns?: string[],
  negativePatterns?: Array<{ regex: string; weight: number }>,
  minScore = 10
): ExtractionSchema {
  return {
    schema: {
      version: '1.0',
      name: `Test ${documentType}`,
      documentType,
    },
    detection: {
      patterns,
      requiredPatterns,
      negativePatterns,
      minScore,
    },
    fields: {
      testField: {
        type: 'string',
        required: true,
        description: 'Test field',
      },
    },
  }
}

// Create mock SchemaRegistry
function createMockSchemaRegistry(
  schemas: Array<{ documentType: DocumentType; schema: ExtractionSchema }>
): SchemaRegistry {
  const schemaMap = new Map<DocumentType, ExtractionSchema>()
  for (const { documentType, schema } of schemas) {
    schemaMap.set(documentType, schema)
  }

  return {
    loadSchemas: vi.fn().mockResolvedValue(undefined),
    getSchema: vi.fn().mockImplementation((type: DocumentType) => 
      Promise.resolve(schemaMap.get(type) ?? null)
    ),
    getAllSchemas: vi.fn().mockResolvedValue(Array.from(schemaMap.values())),
    getDetectionConfigs: vi.fn().mockResolvedValue(schemas),
    toJsonSchema: vi.fn(),
    buildExtractionPrompt: vi.fn(),
    getSupportedDocumentTypes: vi.fn().mockReturnValue(Array.from(schemaMap.keys())),
  } as unknown as SchemaRegistry
}

describe('DocumentDetector', () => {
  describe('detect', () => {
    it('should detect invoice when invoice patterns match', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
        { regex: 'amount', weight: 15 },
      ])

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('This is an INVOICE document with TOTAL AMOUNT due')

      expect(result.documentType).toBe('invoice')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should detect bill_of_lading when BOL patterns match', async () => {
      const bolSchema = createMockSchema('bill_of_lading', [
        { regex: 'bill of lading', weight: 50 },
        { regex: 'b/l', weight: 40 },
        { regex: 'consignee', weight: 20 },
        { regex: 'shipper', weight: 20 },
      ])

      const registry = createMockSchemaRegistry([
        { documentType: 'bill_of_lading', schema: bolSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('BILL OF LADING - Shipper: ABC, Consignee: XYZ')

      expect(result.documentType).toBe('bill_of_lading')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should detect booking_confirmation', async () => {
      const bookingSchema = createMockSchema('booking_confirmation', [
        { regex: 'booking confirmation', weight: 50 },
        { regex: 'booking number', weight: 30 },
        { regex: 'vessel', weight: 20 },
      ])

      const registry = createMockSchemaRegistry([
        { documentType: 'booking_confirmation', schema: bookingSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('BOOKING CONFIRMATION - Booking Number: BKG123 - Vessel: EVER GIVEN')

      expect(result.documentType).toBe('booking_confirmation')
    })

    it('should return unknown when no patterns match minimum score', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 50) // minScore 50

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('This text has invoice word but not enough score')

      // Score is 30, minScore is 50, so should be unknown
      expect(result.documentType).toBe('unknown')
    })

    it('should return document with highest score when multiple match', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
      ], undefined, undefined, 10)

      const bolSchema = createMockSchema('bill_of_lading', [
        { regex: 'shipping', weight: 15 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
        { documentType: 'bill_of_lading', schema: bolSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE with TOTAL amount for SHIPPING goods')

      // Invoice: 30+20=50, BOL: 15. Invoice should win.
      expect(result.documentType).toBe('invoice')
    })

    it('should return allScores for all document types', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const bolSchema = createMockSchema('bill_of_lading', [
        { regex: 'bill of lading', weight: 40 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
        { documentType: 'bill_of_lading', schema: bolSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE document')

      expect(result.allScores).toBeDefined()
      expect(result.allScores.invoice).toBe(30)
      expect(result.allScores.bill_of_lading).toBe(0)
    })

    it('should return matchedPatterns list', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
        { regex: 'payment', weight: 10 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE with TOTAL amount')

      expect(result.matchedPatterns).toBeDefined()
      expect(result.matchedPatterns).toContain('invoice')
      expect(result.matchedPatterns).toContain('total')
      expect(result.matchedPatterns).not.toContain('payment')
    })
  })

  describe('scoreDocument (via detect)', () => {
    it('should sum weights for matched patterns', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
        { regex: 'amount', weight: 15 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE with TOTAL AMOUNT')

      // All three patterns match: 30+20+15=65
      expect(result.allScores.invoice).toBe(65)
    })

    it('should return 0 if no required patterns match', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
      ], ['faktura', 'invoice'], // requiredPatterns - at least one must match
      undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      // Text has TOTAL but no "faktura" or "invoice" keywords
      const result = await detector.detect('This has TOTAL due for payment')

      // Required pattern not matched, score should be 0
      expect(result.allScores.invoice).toBe(0)
    })

    it('should pass if any required pattern matches', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'faktura', weight: 30 },
      ], ['faktura', 'invoice'], // At least one required
      undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('FAKTURA document')

      expect(result.allScores.invoice).toBe(30)
      expect(result.documentType).toBe('invoice')
    })

    it('should subtract weight for negative patterns', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
      ], undefined, 
      [{ regex: 'proforma', weight: 40 }], // Negative pattern
      10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('PROFORMA INVOICE with TOTAL')

      // 30+20-40=10
      expect(result.allScores.invoice).toBe(10)
    })

    it('should not go below 0 score', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 10 },
      ], undefined, 
      [{ regex: 'proforma', weight: 50 }], // Large negative weight
      5)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('PROFORMA INVOICE')

      // 10-50=-40 but capped at 0
      expect(result.allScores.invoice).toBe(0)
    })

    it('should handle invalid regex patterns gracefully', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: '[invalid(regex', weight: 20 }, // Invalid regex
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      
      // Should not throw, should skip invalid pattern
      const result = await detector.detect('INVOICE document')
      expect(result.allScores.invoice).toBe(30)
    })
  })

  describe('calculateConfidence', () => {
    it('should return 0 for unknown document type', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 50)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('Random text without patterns')

      expect(result.documentType).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('should return 100 for maximum possible score', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
        { regex: 'total', weight: 20 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE with TOTAL')

      // All patterns matched, max score = 50, achieved = 50, confidence = 100%
      expect(result.confidence).toBe(100)
    })

    it('should scale confidence linearly', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 50 },
        { regex: 'total', weight: 50 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE document') // Only one pattern

      // Max = 100, achieved = 50, confidence = 50%
      expect(result.confidence).toBe(50)
    })

    it('should cap confidence at 100', async () => {
      // This scenario shouldn't happen normally but testing the cap
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('INVOICE')

      expect(result.confidence).toBeLessThanOrEqual(100)
    })
  })

  describe('matchesType', () => {
    it('should return true when document matches specified type', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
      ])

      const detector = createDocumentDetector(registry)
      const matches = await detector.matchesType('INVOICE document', 'invoice')

      expect(matches).toBe(true)
    })

    it('should return false when document does not match specified type', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const bolSchema = createMockSchema('bill_of_lading', [
        { regex: 'bill of lading', weight: 40 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
        { documentType: 'bill_of_lading', schema: bolSchema },
      ])

      const detector = createDocumentDetector(registry)
      const matches = await detector.matchesType('BILL OF LADING document', 'invoice')

      expect(matches).toBe(false)
    })
  })

  describe('getScores', () => {
    it('should return scores for all document types', async () => {
      const invoiceSchema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const bolSchema = createMockSchema('bill_of_lading', [
        { regex: 'bill of lading', weight: 40 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema: invoiceSchema },
        { documentType: 'bill_of_lading', schema: bolSchema },
      ])

      const detector = createDocumentDetector(registry)
      const scores = await detector.getScores('INVOICE document')

      expect(scores).toHaveProperty('invoice')
      expect(scores).toHaveProperty('bill_of_lading')
      expect(scores.invoice).toBe(30)
      expect(scores.bill_of_lading).toBe(0)
    })
  })

  describe('text normalization', () => {
    it('should normalize text to lowercase for matching', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      
      // Test various cases
      const result1 = await detector.detect('INVOICE')
      const result2 = await detector.detect('invoice')
      const result3 = await detector.detect('InVoIcE')

      expect(result1.documentType).toBe('invoice')
      expect(result2.documentType).toBe('invoice')
      expect(result3.documentType).toBe('invoice')
    })

    it('should collapse multiple spaces', async () => {
      const schema = createMockSchema('bill_of_lading', [
        { regex: 'bill of lading', weight: 40 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'bill_of_lading', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('BILL   OF   LADING')

      expect(result.documentType).toBe('bill_of_lading')
    })

    it('should trim whitespace', async () => {
      const schema = createMockSchema('invoice', [
        { regex: 'invoice', weight: 30 },
      ], undefined, undefined, 10)

      const registry = createMockSchemaRegistry([
        { documentType: 'invoice', schema },
      ])

      const detector = createDocumentDetector(registry)
      const result = await detector.detect('   INVOICE   ')

      expect(result.documentType).toBe('invoice')
    })
  })
})

describe('createDocumentDetector', () => {
  it('should create a DocumentDetector instance', () => {
    const registry = createMockSchemaRegistry([])
    const detector = createDocumentDetector(registry)
    
    expect(detector).toBeInstanceOf(DocumentDetector)
  })
})
