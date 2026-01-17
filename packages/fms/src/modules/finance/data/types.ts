/**
 * Invoice party (buyer/seller) information
 */
export interface InvoiceParty {
  name: string | null
  nip: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  bank_account: string | null
}

/**
 * Invoice dates information
 */
export interface InvoiceDates {
  creation_date: string | null
  payment_date: string | null
  service_date: string | null
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  description: string | null
  quantity: number | null
  unit: string | null
  unit_price_netto: number | null
  vat_rate: number | null
  netto: number | null
  vat: number | null
  brutto: number | null
}

/**
 * Invoice totals
 */
export interface InvoiceTotals {
  netto: number | null
  vat: number | null
  brutto: number | null
}

/**
 * Complete invoice data structure
 */
export interface InvoiceData {
  invoice_number: string | null
  seller: InvoiceParty
  buyer: InvoiceParty
  dates: InvoiceDates
  line_items: InvoiceLineItem[]
  totals: InvoiceTotals
  currency: string | null
  payment_method: string | null
  notes: string | null
}

/**
 * Extraction strategy types
 */
export type ExtractionStrategyType = 'anthropic' | 'openai' | 'gemini' | 'pymupdf_pdfplumber'

/**
 * Single strategy extraction result
 */
export interface ExtractionResult {
  strategy: ExtractionStrategyType
  success: boolean
  data: InvoiceData | null
  error: string | null
  processing_time_ms: number
  confidence?: number
}

/**
 * Configuration for which strategies to use
 */
export interface ExtractionStrategies {
  anthropic: boolean
  openai: boolean
  gemini: boolean
  pymupdf_pdfplumber: boolean
}

/**
 * Full extraction API response
 */
export interface ExtractionResponse {
  success: boolean
  results: ExtractionResult[]
  total_processing_time_ms: number
  file_url: string
  page_num: number
}

/**
 * Request payload for extract endpoint
 */
export interface ExtractInvoiceRequest {
  fileUrl: string
  strategies?: Partial<ExtractionStrategies>
  parallel?: boolean
  pageNum?: number
}

/**
 * Normalization configuration options
 */
export interface NormalizationConfig {
  nip?: {
    strip_prefix?: boolean
    digits_only?: boolean
  }
  dates?: {
    format?: string
  }
  bank_account?: {
    remove_spaces?: boolean
  }
  amounts?: {
    decimal_places?: number
  }
}

/**
 * Request payload for normalize endpoint
 */
export interface NormalizeInvoiceRequest {
  data: InvoiceData
  schemaConfig?: NormalizationConfig
}

/**
 * Normalize API response
 */
export interface NormalizeResponse {
  success: boolean
  data: InvoiceData
  changes: Array<{
    field: string
    original: string | number | null
    normalized: string | number | null
  }>
}

/**
 * Validation rules configuration
 */
export interface ValidationRules {
  nip_checksum?: boolean
  totals_math?: boolean
  date_logic?: boolean
  iban_format?: boolean
}

/**
 * Field validation result
 */
export interface FieldValidation {
  field: string
  valid: boolean
  confidence: number
  message?: string
}

/**
 * Full validation result
 */
export interface ValidationResult {
  valid: boolean
  confidence: number
  field_validations: FieldValidation[]
  best_strategy: ExtractionStrategyType | null
  merged_data: InvoiceData | null
}

/**
 * Request payload for validate endpoint
 */
export interface ValidateExtractionRequest {
  extractionResults: ExtractionResult[]
  validationRules?: ValidationRules
}

/**
 * Validate API response
 */
export interface ValidationResponse {
  success: boolean
  result: ValidationResult
}

/**
 * Visualize options
 */
export interface VisualizeOptions {
  scale?: number
  show_legend?: boolean
  format?: 'png' | 'jpeg' | 'webp'
}

/**
 * Request payload for visualize endpoint
 */
export interface VisualizeRequest {
  fileUrl: string
  validationResult: ValidationResult
  options?: VisualizeOptions
  pageNum?: number
}

/**
 * Visualize API response
 */
export interface VisualizeResponse {
  success: boolean
  image_base64: string
  format: string
  legend?: Array<{
    color: string
    label: string
    description: string
  }>
}

/**
 * Error response from the API
 */
export interface FinanceApiError {
  error: string
  details?: string
  code?: string
}
