/**
 * Invoice processing status
 * - pending_review: Invoice uploaded and extracted, awaiting user review
 * - confirmed: Invoice verified in step 1, ready for cost allocation
 * - approved: Invoice verified and approved by user
 * - rejected: Invoice rejected by user (with notes)
 * - matched: All line items matched to charge codes
 */
export type InvoiceStatus = 'pending_review' | 'confirmed' | 'approved' | 'rejected' | 'matched'

/**
 * Invoice type classification (step 1 of verification)
 * - project_cost: Invoice is a cost against a project (freight, customs, etc.)
 * - company_expense: Invoice is a general company expense (telecom, insurance, etc.)
 */
export type InvoiceType = 'project_cost' | 'company_expense'

/**
 * Cost allocation status
 * - pending: Allocation assigned but not yet saved
 * - saved: Allocation confirmed and saved
 */
export type CostAllocationStatus = 'pending' | 'saved'

/**
 * OCR extraction confidence level
 * - HIGH: All fields extracted with high confidence
 * - MEDIUM: Most fields extracted, some may need review
 * - LOW: Significant extraction issues, manual review required
 */
export type ExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Extracted invoice data from Mistral OCR
 */
export interface ExtractedInvoiceData {
  invoiceNumber?: string | null
  invoiceDate?: string | null
  dueDate?: string | null
  serviceDate?: string | null

  seller?: {
    name?: string | null
    taxId?: string | null
    address?: string | null
  }

  buyer?: {
    name?: string | null
    taxId?: string | null
    address?: string | null
  }

  lineItems?: ExtractedLineItem[]

  totals?: {
    netAmount?: string | null
    vatAmount?: string | null
    grossAmount?: string | null
  }

  currency?: string | null
  paymentTerms?: string | null
  bankAccount?: string | null
}

/**
 * Extracted line item from OCR
 */
export interface ExtractedLineItem {
  lineNumber?: number
  description?: string | null
  quantity?: string | null
  unit?: string | null
  unitPriceNet?: string | null
  vatRate?: string | null
  netAmount?: string | null
  vatAmount?: string | null
  grossAmount?: string | null
}

/**
 * Mistral OCR API response structure
 */
export interface MistralOcrResponse {
  pages: MistralOcrPage[]
  model: string
  usage?: {
    pages_processed: number
  }
}

export interface MistralOcrPage {
  index: number
  markdown: string
  images?: unknown[]
  dimensions?: {
    dpi: number
    height: number
    width: number
  }
}

/**
 * Invoice extraction result from Mistral OCR service
 */
export interface InvoiceExtractionResult {
  success: boolean
  data?: ExtractedInvoiceData
  rawResponse?: MistralOcrResponse
  confidence: ExtractionConfidence
  errors?: string[]
}

/**
 * Product match result
 */
export interface ChargeCodeMatch {
  productId: string
  chargeCode: string | null
  name: string | null
  confidence: number // 0-100
  matchReason: string
}

/**
 * Line item match result
 */
export interface LineItemMatchResult {
  lineItemId: string
  matches: ChargeCodeMatch[]
  bestMatch: ChargeCodeMatch | null
}
