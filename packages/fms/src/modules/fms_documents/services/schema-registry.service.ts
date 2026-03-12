import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { fileURLToPath } from 'url'
import type {
  DocumentType,
  ExtractionSchema,
  SchemaFieldDef,
  JsonSchema,
  JsonSchemaProperty,
} from '../data/schema-types'

/**
 * Resolve schemas directory path
 * Works in both development (src) and production (dist) environments
 */
function resolveSchemasDir(): string {
  // Try multiple possible locations for the schemas directory
  const possiblePaths = [
    // From process.cwd() - monorepo root
    path.join(process.cwd(), 'packages/fms/src/modules/fms_documents/data/schemas'),
    // Relative to this file in src
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'schemas'),
    // Relative to this file, going from dist to src
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'src', 'modules', 'fms_documents', 'data', 'schemas'),
  ]

  for (const schemasPath of possiblePaths) {
    if (fs.existsSync(schemasPath)) {
      return schemasPath
    }
  }

  // Fallback to first path (will fail but with clear error message)
  console.warn('[SchemaRegistry] Could not find schemas directory, tried:', possiblePaths)
  return possiblePaths[0]
}

/**
 * SchemaRegistry - Manages YAML-based extraction schemas
 *
 * Responsibilities:
 * - Load and cache YAML schemas from data/schemas/ directory
 * - Validate schema structure
 * - Convert to JSON Schema for Mistral API
 * - Build extraction prompts from schema definitions
 */
export class SchemaRegistry {
  private schemas: Map<DocumentType, ExtractionSchema> = new Map()
  private schemasLoaded = false
  private schemasDir: string

  constructor(schemasDir?: string) {
    this.schemasDir = schemasDir ?? resolveSchemasDir()
  }

  /**
   * Load all YAML schemas from the schemas directory
   */
  async loadSchemas(): Promise<void> {
    if (this.schemasLoaded) return

    const schemaFiles = [
      'invoice.yaml',
      'bill_of_lading.yaml',
      'delivery_note.yaml',
      'customs_declaration.yaml',
      'booking_confirmation.yaml',
      'packing_list.yaml',
      'vgm_certificate.yaml',
    ]

    for (const file of schemaFiles) {
      try {
        const filePath = path.join(this.schemasDir, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const schema = yaml.load(content) as ExtractionSchema

        if (schema && schema.schema?.documentType) {
          this.validateSchema(schema)
          this.schemas.set(schema.schema.documentType, schema)
        }
      } catch (error) {
        console.error(`Failed to load schema ${file}:`, error)
      }
    }

    this.schemasLoaded = true
  }

  /**
   * Validate schema structure
   */
  private validateSchema(schema: ExtractionSchema): void {
    if (!schema.schema?.version) {
      throw new Error('Schema missing version')
    }
    if (!schema.schema?.name) {
      throw new Error('Schema missing name')
    }
    if (!schema.schema?.documentType) {
      throw new Error('Schema missing documentType')
    }
    if (!schema.detection?.patterns?.length) {
      throw new Error('Schema missing detection patterns')
    }
    if (!schema.fields || Object.keys(schema.fields).length === 0) {
      throw new Error('Schema missing fields')
    }
  }

  /**
   * Get schema by document type
   */
  async getSchema(documentType: DocumentType): Promise<ExtractionSchema | null> {
    await this.loadSchemas()
    return this.schemas.get(documentType) ?? null
  }

  /**
   * Get all loaded schemas
   */
  async getAllSchemas(): Promise<ExtractionSchema[]> {
    await this.loadSchemas()
    return Array.from(this.schemas.values())
  }

  /**
   * Get document types with their detection configs
   */
  async getDetectionConfigs(): Promise<
    Array<{ documentType: DocumentType; schema: ExtractionSchema }>
  > {
    await this.loadSchemas()
    return Array.from(this.schemas.entries()).map(([documentType, schema]) => ({
      documentType,
      schema,
    }))
  }

  /**
   * Convert schema field definition to JSON Schema property
   */
  private fieldDefToJsonSchema(field: SchemaFieldDef): JsonSchemaProperty {
    const property: JsonSchemaProperty = {
      type: this.mapFieldTypeToJsonSchema(field.type),
    }

    if (field.description) {
      property.description = field.description
    }

    if (field.type === 'enum' && field.values) {
      property.enum = field.values
    }

    if (field.type === 'object' && field.properties) {
      property.properties = {}
      const required: string[] = []
      for (const [key, subField] of Object.entries(field.properties)) {
        property.properties[key] = this.fieldDefToJsonSchema(subField)
        if (subField.required) {
          required.push(key)
        }
      }
      if (required.length > 0) {
        property.required = required
      }
    }

    if (field.type === 'array') {
      if (field.itemSchema) {
        property.items = {
          type: 'object',
          properties: {},
        }
        const required: string[] = []
        for (const [key, subField] of Object.entries(field.itemSchema)) {
          property.items.properties![key] = this.fieldDefToJsonSchema(subField)
          if (subField.required) {
            required.push(key)
          }
        }
        if (required.length > 0) {
          property.items.required = required
        }
      } else if (field.itemType) {
        property.items = { type: this.mapFieldTypeToJsonSchema(field.itemType) }
      } else {
        property.items = { type: 'string' }
      }
    }

    return property
  }

  /**
   * Map schema field type to JSON Schema type
   */
  private mapFieldTypeToJsonSchema(type: string): string {
    switch (type) {
      case 'decimal':
        return 'string' // Decimals as strings for precision
      case 'date':
        return 'string' // Dates as ISO strings
      case 'integer':
        return 'integer'
      case 'boolean':
        return 'boolean'
      case 'enum':
        return 'string'
      case 'object':
        return 'object'
      case 'array':
        return 'array'
      default:
        return 'string'
    }
  }

  /**
   * Convert extraction schema to JSON Schema for Mistral structured output
   */
  async toJsonSchema(documentType: DocumentType): Promise<JsonSchema | null> {
    const schema = await this.getSchema(documentType)
    if (!schema) return null

    const properties: Record<string, JsonSchemaProperty> = {}
    const required: string[] = []

    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      properties[fieldName] = this.fieldDefToJsonSchema(fieldDef)
      if (fieldDef.required) {
        required.push(fieldName)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  /**
   * Build extraction prompt from schema
   */
  async buildExtractionPrompt(documentType: DocumentType): Promise<string | null> {
    const schema = await this.getSchema(documentType)
    const jsonSchema = await this.toJsonSchema(documentType)

    if (!schema || !jsonSchema) return null

    const fieldDescriptions = this.buildFieldDescriptions(schema.fields, '')

    return `You are a document data extraction assistant specializing in ${schema.schema.name} documents.
Extract structured data from the document text provided.

Return a JSON object matching this schema:
${JSON.stringify(jsonSchema, null, 2)}

Field descriptions:
${fieldDescriptions}

Important extraction rules:
- Extract all monetary values as decimal strings (e.g., "1234.56")
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- Currency should be 3-letter ISO code (PLN, EUR, USD, etc.)
- VAT/tax rate should be the percentage number only (e.g., "23" not "23%")
- If a field cannot be found, omit it from the response
- Container numbers should follow ISO 6346 format (4 letters + 7 digits)
- B/L numbers typically start with carrier prefix (4 letters) followed by digits
- Extract all visible line items/entries into the appropriate arrays`
  }

  /**
   * Build human-readable field descriptions
   */
  private buildFieldDescriptions(
    fields: Record<string, SchemaFieldDef>,
    prefix: string
  ): string {
    const lines: string[] = []

    for (const [name, field] of Object.entries(fields)) {
      const fullName = prefix ? `${prefix}.${name}` : name
      const req = field.required ? '(required)' : '(optional)'
      lines.push(`- ${fullName}: ${field.description ?? field.type} ${req}`)

      if (field.properties) {
        lines.push(this.buildFieldDescriptions(field.properties, fullName))
      }
      if (field.itemSchema) {
        lines.push(this.buildFieldDescriptions(field.itemSchema, `${fullName}[]`))
      }
    }

    return lines.join('\n')
  }

  /**
   * Get all supported document types
   */
  getSupportedDocumentTypes(): DocumentType[] {
    return ['invoice', 'bill_of_lading', 'delivery_note', 'customs_declaration', 'booking_confirmation', 'packing_list', 'vgm_certificate']
  }
}

/**
 * Singleton instance for schema registry
 */
let registryInstance: SchemaRegistry | null = null

/**
 * Factory function to create or get SchemaRegistry instance
 */
export function createSchemaRegistry(schemasDir?: string): SchemaRegistry {
  if (!registryInstance) {
    registryInstance = new SchemaRegistry(schemasDir)
  }
  return registryInstance
}

/**
 * Get the singleton schema registry instance
 */
export function getSchemaRegistry(): SchemaRegistry {
  return createSchemaRegistry()
}
