/**
 * Document Extraction Service
 * Integrates with Finance File Extractor for AI-powered document data extraction
 * Supports multiple document types: invoice, bill_of_lading, booking_confirmation, etc.
 */

import type { EntityManager } from '@mikro-orm/core'
import type { FmsDocument } from '../data/entities'
import { DocumentCategory } from '../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import { signJwt } from '@open-mercato/shared/lib/auth/jwt'

// ============================================================================
// Types for Finance File Extractor API
// ============================================================================

export type ExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface ExtractionResult {
  success: boolean
  document_type: string
  confidence: ExtractionConfidence
  data: Record<string, unknown>
  raw_text?: string
  processing_time_ms: number
}

// Invoice-specific extraction data
export interface InvoiceExtractionData {
  document_name?: string
  buyer?: {
    name?: string
    nip?: string
    address?: string
    city?: string
    postal_code?: string
    bank_account?: string
  }
  seller?: {
    name?: string
    nip?: string
    address?: string
    city?: string
    postal_code?: string
    bank_account?: string
  }
  dates?: {
    creation_date?: string
    payment_date?: string
    service_date?: string
  }
  payment_method?: string
  totals?: {
    netto?: number
    vat?: number
    brutto?: number
  }
  line_items?: Array<{
    description: string
    quantity: number
    unit: string
    unit_price_netto: number
    vat_rate: number
    row_total_netto: number
    row_vat: number
    row_total_brutto: number
  }>
}

// Bill of Lading extraction data
export interface BillOfLadingExtractionData {
  bl_number?: string
  booking_number?: string
  shipper?: {
    name?: string
    address?: string
  }
  consignee?: {
    name?: string
    address?: string
  }
  notify_party?: {
    name?: string
    address?: string
  }
  vessel_name?: string
  voyage_number?: string
  port_of_loading?: string
  port_of_discharge?: string
  place_of_receipt?: string
  place_of_delivery?: string
  containers?: Array<{
    container_number?: string
    seal_number?: string
    container_type?: string
    gross_weight?: number
    tare_weight?: number
  }>
  cargo?: {
    description?: string
    package_count?: number
    package_type?: string
    gross_weight?: number
    volume?: number
  }
  freight_terms?: string
  date_of_issue?: string
}

// Booking Confirmation extraction data
export interface BookingConfirmationExtractionData {
  booking_number?: string
  carrier_name?: string
  vessel_name?: string
  voyage_number?: string
  port_of_loading?: string
  port_of_discharge?: string
  estimated_departure?: string
  estimated_arrival?: string
  containers?: Array<{
    container_type?: string
    quantity?: number
  }>
  shipper?: {
    name?: string
    address?: string
  }
  commodity_description?: string
  special_instructions?: string
}

// Packing List extraction data
export interface PackingListExtractionData {
  packing_list_number?: string
  date?: string
  shipper?: {
    name?: string
    address?: string
  }
  consignee?: {
    name?: string
    address?: string
  }
  items?: Array<{
    description?: string
    quantity?: number
    package_type?: string
    gross_weight?: number
    net_weight?: number
    dimensions?: {
      length?: number
      width?: number
      height?: number
    }
  }>
  totals?: {
    total_packages?: number
    total_gross_weight?: number
    total_net_weight?: number
    total_volume?: number
  }
}

// Customs Declaration extraction data
export interface CustomsDeclarationExtractionData {
  declaration_number?: string
  declaration_type?: string
  date?: string
  importer?: {
    name?: string
    address?: string
    tax_id?: string
  }
  exporter?: {
    name?: string
    address?: string
  }
  items?: Array<{
    hs_code?: string
    description?: string
    quantity?: number
    unit?: string
    value?: number
    currency?: string
    origin_country?: string
  }>
  totals?: {
    total_value?: number
    currency?: string
    duty_amount?: number
    vat_amount?: number
  }
}

// Document category to API type mapping
const CATEGORY_TO_API_TYPE: Record<DocumentCategory, string> = {
  [DocumentCategory.INVOICE]: 'invoice',
  [DocumentCategory.BILL_OF_LADING]: 'bill_of_lading',
  [DocumentCategory.CUSTOMS]: 'customs_declaration',
  [DocumentCategory.OFFER]: 'invoice', // Treat offers as invoice-like
  [DocumentCategory.OTHER]: 'invoice', // Default to invoice
}

// ============================================================================
// Service Configuration
// ============================================================================

export interface ExtractionServiceConfig {
  baseUrl: string
  timeout?: number
  jwtSecret?: string
}

function getConfig(): ExtractionServiceConfig {
  return {
    baseUrl: process.env.FINANCE_EXTRACTOR_URL || process.env.EXTRACTOR_API_URL || process.env.INVOICE_EXTRACTOR_URL || 'http://localhost:8000',
    timeout: parseInt(process.env.EXTRACTOR_TIMEOUT || '60000', 10),
    jwtSecret: process.env.INVOICE_EXTRACTOR_JWT_SECRET,
  }
}

// ============================================================================
// Main Service Class
// ============================================================================

export class ExtractionService {
  private config: ExtractionServiceConfig

  constructor(config?: Partial<ExtractionServiceConfig>) {
    this.config = { ...getConfig(), ...config }
  }

  /**
   * Check if the extraction service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Extract data from a document file buffer
   */
  async extractDocument(
    fileBuffer: Buffer,
    filename: string,
    category: DocumentCategory
  ): Promise<ExtractionResult> {
    // The API expects a file_url, so we need to use the URL-based extraction
    // For now, we'll need to upload the file first or use a different approach
    // This is a placeholder - the actual implementation depends on how files are served
    throw new Error('Direct buffer extraction not yet implemented - use extractFromFile or extractFromUrl')
  }

  /**
   * Extract data by uploading file to Finance File Extractor API
   * Uses POST /api/v1/extract/upload with multipart/form-data
   */
  async extractFromFilePath(filePath: string, category: DocumentCategory): Promise<ExtractionResult> {
    const fs = await import('fs')
    const path = await import('path')

    const fileBuffer = fs.readFileSync(filePath)
    const fileName = path.basename(filePath)

    const formData = new FormData()
    const blob = new Blob([fileBuffer], { type: this.getMimeType(fileName) })
    formData.append('file', blob, fileName)

    // Form parameters for extraction
    formData.append('auto_detect', 'true')
    formData.append('use_anthropic', 'true')
    formData.append('use_openai', 'false')
    formData.append('use_gemini', 'false')
    formData.append('use_pymupdf', 'false')
    formData.append('parallel', 'true')

    const headers: Record<string, string> = {}
    if (this.config.jwtSecret) {
      const token = signJwt({ iss: 'open-mercato', service: 'fms-documents' }, this.config.jwtSecret, 3600)
      headers['Authorization'] = `Bearer ${token}`
    }

    const documentType = CATEGORY_TO_API_TYPE[category] || 'invoice'

    console.log('[extraction] Config:', {
      baseUrl: this.config.baseUrl,
      hasJwtSecret: !!this.config.jwtSecret,
    })
    console.log('[extraction] Uploading file to extractor:', {
      url: `${this.config.baseUrl}/api/v1/extract/upload`,
      fileName,
      fileSize: fileBuffer.length,
      documentType,
    })

    const response = await fetch(`${this.config.baseUrl}/api/v1/extract/upload`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[extraction] API error:', response.status, error)
      throw new Error(`Extraction failed: ${response.status} - ${error}`)
    }

    const apiResponse = await response.json()
    console.log('[extraction] API response:', JSON.stringify(apiResponse, null, 2))

    // Map API response to our ExtractionResult format
    return this.mapApiResponse(apiResponse, documentType)
  }

  /**
   * Extract data from a file URL using the Finance File Extractor API
   */
  async extractFromFileUrl(fileUrl: string, category: DocumentCategory): Promise<ExtractionResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.config.jwtSecret) {
      const token = signJwt({ iss: 'open-mercato', service: 'fms-documents' }, this.config.jwtSecret, 3600)
      headers['Authorization'] = `Bearer ${token}`
    }

    const documentType = CATEGORY_TO_API_TYPE[category] || 'invoice'

    const response = await fetch(`${this.config.baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        file_url: fileUrl,
        document_type: documentType,
        auto_detect: true,
        strategies: {
          anthropic: true,
          openai: true,
          gemini: true,
          pymupdf_pdfplumber: true,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Extraction failed: ${response.status} - ${error}`)
    }

    const apiResponse = await response.json()

    // Map API response to our ExtractionResult format
    return this.mapApiResponse(apiResponse, documentType)
  }

  /**
   * Map the Finance File Extractor API response to our ExtractionResult format
   * Response format: { document_type, detection: { confidence, confidence_level }, results: [{ invoice_data }] }
   */
  private mapApiResponse(apiResponse: any, documentType: string): ExtractionResult {
    // Get results array - each result has invoice_data
    const results = apiResponse.results || []
    const firstResult = results[0]

    // Extract data from results[0].invoice_data
    const data = firstResult?.invoice_data || firstResult?.data || apiResponse.consensus || {}

    // Get confidence from detection.confidence_level (string: HIGH/MEDIUM/LOW)
    // or detection.confidence (number: 0-1)
    let confidence: ExtractionConfidence = 'LOW'
    const confidenceLevel = apiResponse.detection?.confidence_level?.toUpperCase()
    const confidenceScore = apiResponse.detection?.confidence

    if (confidenceLevel === 'HIGH' || (typeof confidenceScore === 'number' && confidenceScore >= 0.8)) {
      confidence = 'HIGH'
    } else if (confidenceLevel === 'MEDIUM' || (typeof confidenceScore === 'number' && confidenceScore >= 0.5)) {
      confidence = 'MEDIUM'
    }

    const hasData = Object.keys(data).length > 0

    return {
      success: hasData,
      document_type: apiResponse.document_type || documentType,
      confidence,
      data,
      processing_time_ms: apiResponse.summary?.total_time_ms || 0,
    }
  }

  /**
   * Extract data from a document file path by uploading the file
   */
  async extractFromFile(filePath: string, category: DocumentCategory): Promise<ExtractionResult> {
    return this.extractFromFilePath(filePath, category)
  }

  /**
   * Extract data from a URL
   */
  async extractFromUrl(fileUrl: string, category: DocumentCategory): Promise<ExtractionResult> {
    return this.extractFromFileUrl(fileUrl, category)
  }

  /**
   * Process a document entity and store extracted data
   */
  async processDocument(params: {
    em: EntityManager
    document: FmsDocument
    organizationId: string
    tenantId: string
  }): Promise<{ document: FmsDocument; extraction: ExtractionResult }> {
    const { em, document, organizationId, tenantId } = params

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

    // Extract document data
    const extraction = await this.extractFromFile(filePath, document.category)

    // Store extracted data on document
    document.extractedData = extraction as any
    document.processedAt = new Date()

    return { document, extraction }
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
}

// ============================================================================
// Singleton instance
// ============================================================================

let serviceInstance: ExtractionService | null = null

export function getExtractionService(): ExtractionService {
  if (!serviceInstance) {
    serviceInstance = new ExtractionService()
  }
  return serviceInstance
}

export default ExtractionService
