/**
 * Invoice Extraction Service
 * Integrates with Finance File Extractor for AI-powered invoice data extraction
 */

import type { EntityManager } from '@mikro-orm/core'
import type { FmsDocument } from '../data/entities'
import type { FmsProjectInvoice, InvoiceLineItem, InvoiceParty } from '../../fms_projects/data/entities'
import type { InvoiceConfidenceLevel } from '../../fms_projects/data/types'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'

// ============================================================================
// Types for Finance Extractor API
// ============================================================================

interface ExtractorParty {
  name?: string
  nip?: string
  address?: string
  city?: string
  postal_code?: string
  bank_account?: string
}

interface ExtractorDates {
  creation_date?: string
  payment_date?: string
  service_date?: string
}

interface ExtractorTotals {
  netto?: number
  vat?: number
  brutto?: number
}

interface ExtractorLineItem {
  description: string
  quantity: number
  unit: string
  unit_price_netto: number
  vat_rate: number
  row_total_netto: number
  row_vat: number
  row_total_brutto: number
}

interface ExtractorInvoiceData {
  document_name?: string
  buyer?: ExtractorParty
  seller?: ExtractorParty
  dates?: ExtractorDates
  payment_method?: string
  totals?: ExtractorTotals
  line_items?: ExtractorLineItem[]
}

interface ExtractorResult {
  strategy: string
  data: ExtractorInvoiceData
  confidence?: number
}

interface ExtractionResponse {
  results: ExtractorResult[]
  consensus?: ExtractorInvoiceData
  overall_confidence?: InvoiceConfidenceLevel
  processing_time_ms?: number
}

interface ValidationResponse {
  is_valid: boolean
  confidence: InvoiceConfidenceLevel
  errors?: string[]
  warnings?: string[]
}

// ============================================================================
// Service Configuration
// ============================================================================

export interface InvoiceExtractionConfig {
  extractorBaseUrl: string
  jwtSecret?: string
  timeout?: number
  strategies?: {
    anthropic?: boolean
    openai?: boolean
    gemini?: boolean
    pymupdf_pdfplumber?: boolean
  }
}

function getConfig(): InvoiceExtractionConfig {
  return {
    extractorBaseUrl: process.env.INVOICE_EXTRACTOR_URL || 'http://localhost:8000',
    jwtSecret: process.env.INVOICE_EXTRACTOR_JWT_SECRET,
    timeout: parseInt(process.env.INVOICE_EXTRACTOR_TIMEOUT || '60000', 10),
    strategies: {
      anthropic: process.env.INVOICE_EXTRACTOR_ANTHROPIC !== 'false',
      openai: process.env.INVOICE_EXTRACTOR_OPENAI !== 'false',
      gemini: process.env.INVOICE_EXTRACTOR_GEMINI !== 'false',
      pymupdf_pdfplumber: process.env.INVOICE_EXTRACTOR_PYMUPDF !== 'false',
    },
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapParty(party: ExtractorParty | undefined): InvoiceParty | null {
  if (!party || !party.name) return null
  return {
    name: party.name,
    nip: party.nip,
    address: party.address,
    city: party.city,
    postalCode: party.postal_code,
    bankAccount: party.bank_account,
  }
}

function mapLineItems(items: ExtractorLineItem[] | undefined): InvoiceLineItem[] | null {
  if (!items || items.length === 0) return null
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceNetto: item.unit_price_netto,
    vatRate: item.vat_rate,
    rowTotalNetto: item.row_total_netto,
    rowVat: item.row_vat,
    rowTotalBrutto: item.row_total_brutto,
  }))
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

// ============================================================================
// Main Service Class
// ============================================================================

export class InvoiceExtractionService {
  private config: InvoiceExtractionConfig

  constructor(config?: Partial<InvoiceExtractionConfig>) {
    this.config = { ...getConfig(), ...config }
  }

  /**
   * Check if the extraction service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.extractorBaseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Extract invoice data from a file
   */
  async extractFromFile(filePath: string): Promise<ExtractionResponse> {
    const formData = new FormData()

    // Read file and add to form data
    const fs = await import('fs')
    const path = await import('path')
    const fileBuffer = fs.readFileSync(filePath)
    const fileName = path.basename(filePath)
    const blob = new Blob([fileBuffer], { type: this.getMimeType(fileName) })
    formData.append('file', blob, fileName)

    // Add strategy configuration
    const strategies: string[] = []
    if (this.config.strategies?.anthropic) strategies.push('anthropic')
    if (this.config.strategies?.openai) strategies.push('openai')
    if (this.config.strategies?.gemini) strategies.push('gemini')
    if (this.config.strategies?.pymupdf_pdfplumber) strategies.push('pymupdf_pdfplumber')

    if (strategies.length > 0) {
      formData.append('strategies', strategies.join(','))
    }

    const headers: Record<string, string> = {}
    if (this.config.jwtSecret) {
      // Generate a simple JWT for authentication
      headers['Authorization'] = `Bearer ${this.generateToken()}`
    }

    const response = await fetch(`${this.config.extractorBaseUrl}/api/v1/extract`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Extraction failed: ${response.status} - ${error}`)
    }

    return response.json() as Promise<ExtractionResponse>
  }

  /**
   * Extract invoice data from a URL
   */
  async extractFromUrl(fileUrl: string): Promise<ExtractionResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.jwtSecret) {
      headers['Authorization'] = `Bearer ${this.generateToken()}`
    }

    const strategies: string[] = []
    if (this.config.strategies?.anthropic) strategies.push('anthropic')
    if (this.config.strategies?.openai) strategies.push('openai')
    if (this.config.strategies?.gemini) strategies.push('gemini')
    if (this.config.strategies?.pymupdf_pdfplumber) strategies.push('pymupdf_pdfplumber')

    const response = await fetch(`${this.config.extractorBaseUrl}/api/v1/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: fileUrl,
        strategies,
      }),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Extraction failed: ${response.status} - ${error}`)
    }

    return response.json() as Promise<ExtractionResponse>
  }

  /**
   * Validate extraction results using Claude as judge
   */
  async validateExtraction(results: ExtractorResult[]): Promise<ValidationResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.jwtSecret) {
      headers['Authorization'] = `Bearer ${this.generateToken()}`
    }

    const response = await fetch(`${this.config.extractorBaseUrl}/api/v1/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ results }),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Validation failed: ${response.status} - ${error}`)
    }

    return response.json() as Promise<ValidationResponse>
  }

  /**
   * Process a document and create an FmsProjectInvoice record
   */
  async processDocument(params: {
    em: EntityManager
    document: FmsDocument
    projectId: string
    organizationId: string
    tenantId: string
  }): Promise<{ invoice: FmsProjectInvoice; extraction: ExtractionResponse }> {
    const { em, document, projectId, organizationId, tenantId } = params

    // Get the attachment to find the file
    const attachment = await em.findOne(Attachment, { id: document.attachmentId })
    if (!attachment) {
      throw new Error('Document attachment not found')
    }

    // Get the local file path
    if (!attachment.partitionCode || !attachment.storagePath) {
      throw new Error('Attachment missing partitionCode or storagePath')
    }
    const filePath = resolveAttachmentAbsolutePath(
      attachment.partitionCode,
      attachment.storagePath,
      attachment.storageDriver
    )

    // Extract invoice data
    const extraction = await this.extractFromFile(filePath)

    // Use consensus data or first result
    const data = extraction.consensus || extraction.results?.[0]?.data
    if (!data) {
      throw new Error('No extraction data available')
    }

    // Create the invoice record
    const { FmsProjectInvoice } = await import('../../fms_projects/data/entities')
    const now = new Date()
    const invoice = em.create(FmsProjectInvoice, {
      organizationId,
      tenantId,
      project: projectId,
      documentId: document.id,
      invoiceNumber: data.document_name || null,
      sellerName: data.seller?.name || null,
      sellerNip: data.seller?.nip || null,
      sellerDetails: mapParty(data.seller),
      buyerName: data.buyer?.name || null,
      buyerNip: data.buyer?.nip || null,
      buyerDetails: mapParty(data.buyer),
      netAmount: data.totals?.netto?.toString() || null,
      vatAmount: data.totals?.vat?.toString() || null,
      grossAmount: data.totals?.brutto?.toString() || null,
      currencyCode: 'PLN', // Default, can be enhanced to detect currency
      invoiceDate: parseDate(data.dates?.creation_date),
      paymentDueDate: parseDate(data.dates?.payment_date),
      serviceDate: parseDate(data.dates?.service_date),
      paymentMethod: data.payment_method || null,
      lineItems: mapLineItems(data.line_items),
      confidence: extraction.overall_confidence || 'REVIEW',
      extractionStrategies: extraction.results?.map((r) => r.strategy) || null,
      rawExtractionData: extraction as any,
      status: extraction.overall_confidence === 'HIGH' ? 'approved' : 'pending_review',
      createdAt: now,
      updatedAt: now,
    })

    await em.persist(invoice)

    // Update document with extraction info
    document.extractedData = extraction as any
    document.processedAt = new Date()

    return { invoice, extraction }
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop()
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      tiff: 'image/tiff',
      tif: 'image/tiff',
    }
    return mimeTypes[ext || ''] || 'application/octet-stream'
  }

  /**
   * Generate a simple JWT for authentication
   */
  private generateToken(): string {
    if (!this.config.jwtSecret) {
      return ''
    }
    // Simple token generation - in production, use a proper JWT library
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'open-mercato',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url')
    // Note: This is a simplified implementation. For production, use jsonwebtoken or similar
    return `${header}.${payload}.signature`
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let serviceInstance: InvoiceExtractionService | null = null

export function getInvoiceExtractionService(): InvoiceExtractionService {
  if (!serviceInstance) {
    serviceInstance = new InvoiceExtractionService()
  }
  return serviceInstance
}

export default InvoiceExtractionService
