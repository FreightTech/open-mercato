/**
 * Invoice processing status
 * - pending_review: Invoice uploaded and extracted, awaiting user review
 * - approved: Invoice verified and approved by user
 * - rejected: Invoice rejected by user (with notes)
 * - matched: All line items matched to charge codes
 */
export type InvoiceStatus = 'pending_review' | 'approved' | 'rejected' | 'matched'

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
 * Charge code match result
 */
export interface ChargeCodeMatch {
  chargeCodeId: string
  code: string
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
