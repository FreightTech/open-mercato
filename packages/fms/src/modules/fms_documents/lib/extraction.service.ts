/**
 * Document Extraction Service
 * Uses Mistral OCR service for AI-powered document data extraction
 * Supports multiple document types: invoice, bill_of_lading, customs_declaration, etc.
 */

import type { EntityManager } from '@mikro-orm/core'
import type { FmsDocument } from '../data/entities'
import { DocumentCategory } from '../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import { MistralOcrService } from '../services/mistral-ocr.service'
import type { SchemaExtractionResult } from '../data/schema-types'

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

// ============================================================================
// Main Service Class
// ============================================================================

export class ExtractionService {
  private mistralService: MistralOcrService | null = null

  constructor() {
    // Lazy initialization - only create when needed and API key is available
  }

  /**
   * Get or create the Mistral OCR service instance
   * Throws if MISTRAL_API_KEY is not set
   */
  private getMistralService(): MistralOcrService {
    if (!this.mistralService) {
      this.mistralService = new MistralOcrService()
    }
    return this.mistralService
  }

  /**
   * Check if the extraction service is available
   * Returns true if MISTRAL_API_KEY is configured
   */
  async isAvailable(): Promise<boolean> {
    return !!process.env.MISTRAL_API_KEY
  }

  /**
   * Extract data from a document file buffer using Mistral OCR
   */
  async extractDocument(
    fileBuffer: Buffer,
    filename: string,
    _category: DocumentCategory
  ): Promise<ExtractionResult> {
    const mistral = this.getMistralService()
    const result = await mistral.extractDocument(fileBuffer, filename)
    return this.mapMistralResult(result)
  }

  /**
   * Extract data from a file path using Mistral OCR
   */
  async extractFromFilePath(filePath: string, category: DocumentCategory): Promise<ExtractionResult> {
    const fs = await import('fs')
    const path = await import('path')

    const fileBuffer = fs.readFileSync(filePath)
    const fileName = path.basename(filePath)

    console.log('[extraction] Using Mistral OCR for extraction:', {
      fileName,
      fileSize: fileBuffer.length,
      category,
    })

    return this.extractDocument(fileBuffer, fileName, category)
  }

  /**
   * Map SchemaExtractionResult from Mistral OCR to our ExtractionResult format
   */
  private mapMistralResult(result: SchemaExtractionResult): ExtractionResult {
    // Map document type from Mistral format to our format
    const documentType = this.mapDocumentType(result.documentType)

    // Map confidence from 0-100 to HIGH/MEDIUM/LOW
    const confidence = this.mapConfidence(result.documentTypeConfidence)

    // Merge transportation metadata into data if available
    const data: Record<string, unknown> = { ...result.data }
    if (result.transportationMetadata && Object.keys(result.transportationMetadata).length > 0) {
      data.transportation = result.transportationMetadata
    }

    return {
      success: result.success,
      document_type: documentType,
      confidence,
      data,
      raw_text: result.rawText,
      processing_time_ms: 0, // Not tracked in Mistral service
    }
  }

  /**
   * Map Mistral document type to our document type string
   */
  private mapDocumentType(type: string): string {
    // Mistral types: 'invoice', 'bill_of_lading', 'delivery_note', 'customs_declaration', 'unknown'
    // Our types match mostly, just return as-is
    return type
  }

  /**
   * Map confidence score (0-100) to ExtractionConfidence (HIGH/MEDIUM/LOW)
   */
  private mapConfidence(confidence: number): ExtractionConfidence {
    if (confidence >= 80) return 'HIGH'
    if (confidence >= 50) return 'MEDIUM'
    return 'LOW'
  }

  /**
   * Extract data from a document file path (alias for extractFromFilePath)
   */
  async extractFromFile(filePath: string, category: DocumentCategory): Promise<ExtractionResult> {
    return this.extractFromFilePath(filePath, category)
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
    const { em, document } = params

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

    // Extract document data using Mistral OCR
    const extraction = await this.extractFromFile(filePath, document.category)

    // Store extracted data on document
    document.extractedData = extraction.data
    document.documentType = extraction.document_type as typeof document.documentType
    document.documentTypeConfidence = extraction.confidence === 'HIGH' ? 90 : extraction.confidence === 'MEDIUM' ? 60 : 30
    document.processingStatus = 'completed'
    document.processedAt = new Date()

    return { document, extraction }
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
