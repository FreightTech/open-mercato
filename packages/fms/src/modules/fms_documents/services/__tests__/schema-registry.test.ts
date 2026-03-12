import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { SchemaRegistry, createSchemaRegistry } from '../schema-registry.service'
import type { ExtractionSchema, SchemaFieldDef } from '../../data/schema-types'

// Mock fs module
vi.mock('fs')

// Sample valid schema YAML content
const sampleInvoiceSchema = `
schema:
  version: "1.0"
  name: "Invoice"
  documentType: "invoice"
  description: "Standard invoice extraction"

detection:
  minScore: 30
  patterns:
    - regex: "invoice"
      weight: 30
    - regex: "total"
      weight: 20
  requiredPatterns:
    - "invoice|faktura"

fields:
  invoiceNumber:
    type: string
    required: true
    description: "Unique invoice identifier"
  issueDate:
    type: date
    required: true
    description: "Invoice issue date"
  totalAmount:
    type: decimal
    required: true
    description: "Total amount"
  currency:
    type: string
    description: "Currency code"
  lineItems:
    type: array
    itemSchema:
      description:
        type: string
        required: true
      quantity:
        type: integer
      unitPrice:
        type: decimal
`

const sampleBolSchema = `
schema:
  version: "1.0"
  name: "Bill of Lading"
  documentType: "bill_of_lading"

detection:
  minScore: 40
  patterns:
    - regex: "bill of lading"
      weight: 50
    - regex: "b/l"
      weight: 40

fields:
  blNumber:
    type: string
    required: true
    description: "Bill of Lading number"
  shipper:
    type: string
  consignee:
    type: string
`

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry

  beforeEach(() => {
    // Reset module state between tests
    vi.resetAllMocks()
    
    // Mock fs.existsSync to return true for schemas dir
    vi.mocked(fs.existsSync).mockReturnValue(true)
    
    // Create a new registry instance with a custom schemas dir
    registry = new SchemaRegistry('/mock/schemas')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('loadSchemas', () => {
    it('should load schemas from YAML files', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('invoice.yaml')) {
          return sampleInvoiceSchema
        }
        if (filePath.includes('bill_of_lading.yaml')) {
          return sampleBolSchema
        }
        throw new Error(`File not found: ${filePath}`)
      })

      await registry.loadSchemas()
      const schemas = await registry.getAllSchemas()

      expect(schemas.length).toBeGreaterThanOrEqual(2)
    })

    it('should skip invalid YAML files gracefully', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('invoice.yaml')) {
          return sampleInvoiceSchema
        }
        // Return invalid YAML for other files
        return 'invalid: yaml: content: ['
      })

      // Should not throw
      await expect(registry.loadSchemas()).resolves.not.toThrow()
    })

    it('should only load schemas once (caching)', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(sampleInvoiceSchema)

      await registry.loadSchemas()
      await registry.loadSchemas()
      await registry.loadSchemas()

      // readFileSync should be called for each schema file, but only on first load
      const callCount = vi.mocked(fs.readFileSync).mock.calls.length
      
      // Second and third calls to loadSchemas shouldn't cause additional file reads
      await registry.loadSchemas()
      expect(vi.mocked(fs.readFileSync).mock.calls.length).toBe(callCount)
    })
  })

  describe('getSchema', () => {
    it('should return schema for valid document type', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(sampleInvoiceSchema)

      const schema = await registry.getSchema('invoice')

      expect(schema).not.toBeNull()
      expect(schema?.schema.documentType).toBe('invoice')
      expect(schema?.schema.name).toBe('Invoice')
    })

    it('should return null for unknown document type', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(sampleInvoiceSchema)

      const schema = await registry.getSchema('unknown' as any)

      expect(schema).toBeNull()
    })
  })

  describe('getAllSchemas', () => {
    it('should return all loaded schemas', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('invoice.yaml')) return sampleInvoiceSchema
        if (filePath.includes('bill_of_lading.yaml')) return sampleBolSchema
        throw new Error('File not found')
      })

      const schemas = await registry.getAllSchemas()

      expect(schemas.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getDetectionConfigs', () => {
    it('should return document type and schema pairs', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(sampleInvoiceSchema)

      const configs = await registry.getDetectionConfigs()

      expect(configs.length).toBeGreaterThanOrEqual(1)
      expect(configs[0]).toHaveProperty('documentType')
      expect(configs[0]).toHaveProperty('schema')
    })
  })

  describe('toJsonSchema', () => {
    beforeEach(() => {
      vi.mocked(fs.readFileSync).mockReturnValue(sampleInvoiceSchema)
    })

    it('should convert extraction schema to JSON Schema', async () => {
      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema).not.toBeNull()
      expect(jsonSchema?.type).toBe('object')
      expect(jsonSchema?.properties).toBeDefined()
    })

    it('should include required fields in JSON Schema', async () => {
      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.required).toContain('invoiceNumber')
      expect(jsonSchema?.required).toContain('issueDate')
      expect(jsonSchema?.required).toContain('totalAmount')
    })

    it('should convert string fields correctly', async () => {
      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.properties?.invoiceNumber?.type).toBe('string')
    })

    it('should convert decimal fields to string type', async () => {
      const jsonSchema = await registry.toJsonSchema('invoice')

      // Decimals are converted to strings for precision
      expect(jsonSchema?.properties?.totalAmount?.type).toBe('string')
    })

    it('should convert date fields to string type', async () => {
      const jsonSchema = await registry.toJsonSchema('invoice')

      // Dates are converted to strings (ISO format)
      expect(jsonSchema?.properties?.issueDate?.type).toBe('string')
    })

    it('should convert array fields correctly', async () => {
      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.properties?.lineItems?.type).toBe('array')
      expect(jsonSchema?.properties?.lineItems?.items).toBeDefined()
    })

    it('should return null for unknown document type', async () => {
      const jsonSchema = await registry.toJsonSchema('unknown' as any)

      expect(jsonSchema).toBeNull()
    })
  })

  describe('buildExtractionPrompt', () => {
    beforeEach(() => {
      vi.mocked(fs.readFileSync).mockReturnValue(sampleInvoiceSchema)
    })

    it('should build extraction prompt from schema', async () => {
      const prompt = await registry.buildExtractionPrompt('invoice')

      expect(prompt).not.toBeNull()
      expect(prompt).toContain('Invoice')
      expect(prompt).toContain('JSON')
    })

    it('should include field descriptions in prompt', async () => {
      const prompt = await registry.buildExtractionPrompt('invoice')

      expect(prompt).toContain('invoiceNumber')
      expect(prompt).toContain('required')
    })

    it('should include extraction rules in prompt', async () => {
      const prompt = await registry.buildExtractionPrompt('invoice')

      expect(prompt).toContain('ISO 8601')
      expect(prompt).toContain('decimal strings')
    })

    it('should return null for unknown document type', async () => {
      const prompt = await registry.buildExtractionPrompt('unknown' as any)

      expect(prompt).toBeNull()
    })
  })

  describe('getSupportedDocumentTypes', () => {
    it('should return all supported document types', () => {
      const types = registry.getSupportedDocumentTypes()

      expect(types).toContain('invoice')
      expect(types).toContain('bill_of_lading')
      expect(types).toContain('booking_confirmation')
      expect(types).toContain('delivery_note')
      expect(types).toContain('customs_declaration')
      expect(types).toContain('packing_list')
      expect(types).toContain('vgm_certificate')
    })

    it('should return 7 document types', () => {
      const types = registry.getSupportedDocumentTypes()
      expect(types.length).toBe(7)
    })
  })

  describe('validateSchema (via loadSchemas)', () => {
    it('should reject schema without version', async () => {
      const invalidSchema = `
schema:
  name: "Invalid"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields:
  test:
    type: string
`
      vi.mocked(fs.readFileSync).mockReturnValue(invalidSchema)

      await registry.loadSchemas()
      const schema = await registry.getSchema('invoice')

      // Schema should not be loaded due to validation failure
      expect(schema).toBeNull()
    })

    it('should reject schema without name', async () => {
      const invalidSchema = `
schema:
  version: "1.0"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields:
  test:
    type: string
`
      vi.mocked(fs.readFileSync).mockReturnValue(invalidSchema)

      await registry.loadSchemas()
      const schema = await registry.getSchema('invoice')

      expect(schema).toBeNull()
    })

    it('should reject schema without detection patterns', async () => {
      const invalidSchema = `
schema:
  version: "1.0"
  name: "Invalid"
  documentType: "invoice"
detection:
  patterns: []
fields:
  test:
    type: string
`
      vi.mocked(fs.readFileSync).mockReturnValue(invalidSchema)

      await registry.loadSchemas()
      const schema = await registry.getSchema('invoice')

      expect(schema).toBeNull()
    })

    it('should reject schema without fields', async () => {
      const invalidSchema = `
schema:
  version: "1.0"
  name: "Invalid"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields: {}
`
      vi.mocked(fs.readFileSync).mockReturnValue(invalidSchema)

      await registry.loadSchemas()
      const schema = await registry.getSchema('invoice')

      expect(schema).toBeNull()
    })
  })

  describe('field type mapping', () => {
    it('should map integer type correctly', async () => {
      const schemaWithInteger = `
schema:
  version: "1.0"
  name: "Test"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields:
  quantity:
    type: integer
`
      vi.mocked(fs.readFileSync).mockReturnValue(schemaWithInteger)

      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.properties?.quantity?.type).toBe('integer')
    })

    it('should map boolean type correctly', async () => {
      const schemaWithBoolean = `
schema:
  version: "1.0"
  name: "Test"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields:
  isPaid:
    type: boolean
`
      vi.mocked(fs.readFileSync).mockReturnValue(schemaWithBoolean)

      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.properties?.isPaid?.type).toBe('boolean')
    })

    it('should map enum type to string with enum values', async () => {
      const schemaWithEnum = `
schema:
  version: "1.0"
  name: "Test"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields:
  status:
    type: enum
    values:
      - pending
      - paid
      - cancelled
`
      vi.mocked(fs.readFileSync).mockReturnValue(schemaWithEnum)

      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.properties?.status?.type).toBe('string')
      expect(jsonSchema?.properties?.status?.enum).toEqual(['pending', 'paid', 'cancelled'])
    })

    it('should map object type with nested properties', async () => {
      const schemaWithObject = `
schema:
  version: "1.0"
  name: "Test"
  documentType: "invoice"
detection:
  patterns:
    - regex: "test"
      weight: 10
fields:
  address:
    type: object
    properties:
      street:
        type: string
        required: true
      city:
        type: string
`
      vi.mocked(fs.readFileSync).mockReturnValue(schemaWithObject)

      const jsonSchema = await registry.toJsonSchema('invoice')

      expect(jsonSchema?.properties?.address?.type).toBe('object')
      expect(jsonSchema?.properties?.address?.properties?.street?.type).toBe('string')
      expect(jsonSchema?.properties?.address?.properties?.city?.type).toBe('string')
      expect(jsonSchema?.properties?.address?.required).toContain('street')
    })
  })
})

describe('createSchemaRegistry', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
  })

  it('should return a singleton instance', () => {
    const registry1 = createSchemaRegistry('/mock/schemas')
    const registry2 = createSchemaRegistry('/mock/schemas')

    // Due to singleton pattern, should be same instance
    expect(registry1).toBe(registry2)
  })
})
