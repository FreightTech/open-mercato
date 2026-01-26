/**
 * Document types supported by the extraction system
 */
export type DocumentType =
  | 'invoice'
  | 'bill_of_lading'
  | 'delivery_note'
  | 'customs_declaration'
  | 'unknown'

/**
 * Detection pattern for document type classification
 */
export interface DetectionPattern {
  regex: string
  weight: number
}

/**
 * Configuration for document type detection
 */
export interface DetectionConfig {
  patterns: DetectionPattern[]
  requiredPatterns?: string[]
  minScore: number
}

/**
 * Field types supported in extraction schemas
 */
export type SchemaFieldType =
  | 'string'
  | 'decimal'
  | 'date'
  | 'enum'
  | 'object'
  | 'array'
  | 'boolean'
  | 'integer'

/**
 * Schema field definition for extraction
 */
export interface SchemaFieldDef {
  type: SchemaFieldType
  required?: boolean
  patterns?: string[]
  description?: string
  properties?: Record<string, SchemaFieldDef>
  itemSchema?: Record<string, SchemaFieldDef>
  itemType?: 'string' | 'decimal' | 'integer'
  values?: string[]
}

/**
 * Normalization transform types
 */
export type NormalizationTransform =
  | 'decimal_2dp'
  | 'decimal_4dp'
  | 'iso_date'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'strip_whitespace'
  | 'normalize_container'

/**
 * Normalization rule for post-processing extracted data
 */
export interface NormalizationRule {
  path: string
  transform: NormalizationTransform
}

/**
 * Normalization configuration
 */
export interface NormalizationConfig {
  rules: NormalizationRule[]
}

/**
 * Schema metadata
 */
export interface SchemaMetadata {
  version: string
  name: string
  documentType: DocumentType
}

/**
 * Complete extraction schema loaded from YAML
 */
export interface ExtractionSchema {
  schema: SchemaMetadata
  detection: DetectionConfig
  fields: Record<string, SchemaFieldDef>
  normalization?: NormalizationConfig
}

/**
 * Transportation metadata extracted from documents
 */
export interface TransportationMetadata {
  blNumber?: string | null
  containerNumbers?: string[]
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  portOfLoading?: string | null
  portOfDischarge?: string | null
  etd?: string | null
  eta?: string | null
  bookingNumber?: string | null
  carrierName?: string | null
  carrierScac?: string | null
}

/**
 * Document detection result
 */
export interface DocumentDetectionResult {
  documentType: DocumentType
  confidence: number
  matchedPatterns: string[]
  allScores: Record<DocumentType, number>
}

/**
 * Schema-based extraction result
 */
export interface SchemaExtractionResult {
  success: boolean
  documentType: DocumentType
  documentTypeConfidence: number
  data: Record<string, unknown>
  transportationMetadata: TransportationMetadata
  rawText: string
  errors?: string[]
}

/**
 * JSON Schema type for Mistral API
 */
export interface JsonSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * JSON Schema for Mistral structured output
 */
export interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * Container number validation result
 */
export interface ContainerValidation {
  number: string
  valid: boolean
  owner?: string
  checkDigit?: string
}

/**
 * Known carrier SCAC codes and BL prefixes
 */
export const CARRIER_PREFIXES: Record<string, string> = {
  COSU: 'COSCO',
  MAEU: 'Maersk',
  CMDU: 'CMA CGM',
  HLCU: 'Hapag-Lloyd',
  EGLV: 'Evergreen',
  MSCU: 'MSC',
  OOLU: 'OOCL',
  YMLU: 'Yang Ming',
  ZIMU: 'ZIM',
  HDMU: 'Hyundai',
  SEAU: 'SEALAND',
  NYKU: 'NYK',
  APLU: 'APL',
  KKLU: 'K Line',
  PCPL: 'PCTC',
  POEU: 'P&O',
  SUDU: 'Hamburg Sud',
  ARKU: 'Arkas',
  FSCU: 'Feedertech',
  GDYF: 'Gdynia Terminal',
}

/**
 * ISO 6346 container types
 */
export const CONTAINER_TYPES: Record<string, string> = {
  GP: 'General Purpose',
  HC: 'High Cube',
  RF: 'Reefer',
  OT: 'Open Top',
  FR: 'Flat Rack',
  TK: 'Tank',
  BU: 'Bulk',
  VH: 'Ventilated',
}
