import { Mistral } from '@mistralai/mistralai'
import type {
  InvoiceExtractionResult,
  ExtractedInvoiceData,
  ExtractedLineItem,
  ExtractionConfidence,
} from '../data/invoice-types'
import type {
  DocumentType,
  SchemaExtractionResult,
  TransportationMetadata,
  NormalizationTransform,
} from '../data/schema-types'
import { INVOICE_EXTRACTION_SCHEMA, type MistralExtractedInvoice } from '../data/extraction-schema'
import { SchemaRegistry, getSchemaRegistry } from './schema-registry.service'
import { DocumentDetector, createDocumentDetector } from './document-detector.service'
import {
  TransportationMetadataExtractor,
  createTransportationExtractor,
} from './transportation-extractor.service'

/**
 * MistralOcrService - Handles document PDF extraction using Mistral OCR API
 *
 * Supports:
 * - Invoice extraction (legacy mode)
 * - Schema-based extraction with document type detection
 * - Transportation metadata extraction from any document
 */
export class MistralOcrService {
  private client: Mistral
  private schemaRegistry: SchemaRegistry
  private documentDetector: DocumentDetector
  private transportationExtractor: TransportationMetadataExtractor

  constructor(
    schemaRegistry?: SchemaRegistry,
    documentDetector?: DocumentDetector,
    transportationExtractor?: TransportationMetadataExtractor
  ) {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is not set')
    }

    this.client = new Mistral({ apiKey })
    this.schemaRegistry = schemaRegistry ?? getSchemaRegistry()
    this.documentDetector =
      documentDetector ?? createDocumentDetector(this.schemaRegistry)
    this.transportationExtractor = transportationExtractor ?? createTransportationExtractor()
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop()
    switch (ext) {
      case 'pdf':
        return 'application/pdf'
      case 'png':
        return 'image/png'
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'tiff':
      case 'tif':
        return 'image/tiff'
      case 'webp':
        return 'image/webp'
      default:
        return 'application/pdf'
    }
  }

  /**
   * Extract raw text from PDF using Mistral OCR
   */
  async extractText(fileBuffer: Buffer, filename: string): Promise<{ text: string; raw: unknown }> {
    const base64 = fileBuffer.toString('base64')
    const mimeType = this.getMimeType(filename)

    try {
      const response = await this.client.ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          documentUrl: `data:${mimeType};base64,${base64}`,
        },
        includeImageBase64: false,
      })

      const fullText = response.pages?.map((page) => page.markdown).join('\n\n') ?? ''

      return { text: fullText, raw: response }
    } catch (error: unknown) {
      throw error
    }
  }

  /**
   * Extract document using schema-based extraction with auto document type detection
   *
   * @param fileBuffer - The file content as a Buffer
   * @param filename - Original filename
   * @returns Schema-based extraction result with document type and transportation metadata
   */
  async extractDocument(fileBuffer: Buffer, filename: string): Promise<SchemaExtractionResult> {
    try {
      // Step 1: OCR extraction
      const { text: fullText, raw: rawResponse } = await this.extractText(fileBuffer, filename)

      // Step 2: Document type detection
      const detection = await this.documentDetector.detect(fullText)

      // Step 3: Transportation metadata extraction (parallel, from raw text)
      const transportationMetadata = this.transportationExtractor.extract(fullText)

      // Step 4: Schema-based structured extraction
      let structuredData: Record<string, unknown> = {}

      if (detection.documentType !== 'unknown') {
        const prompt = await this.schemaRegistry.buildExtractionPrompt(detection.documentType)
        const jsonSchema = await this.schemaRegistry.toJsonSchema(detection.documentType)

        if (prompt && jsonSchema) {
          structuredData = (await this.extractWithSchema(fullText, prompt, jsonSchema)) ?? {}
        }
      }

      // Fall back to invoice extraction if unknown or failed
      if (
        Object.keys(structuredData).length === 0 ||
        detection.documentType === 'unknown'
      ) {
        const invoiceData = await this.extractStructuredData(fullText)
        if (invoiceData) {
          structuredData = invoiceData as unknown as Record<string, unknown>
        }
      }

      // Step 5: Normalization
      if (detection.documentType !== 'unknown') {
        const schema = await this.schemaRegistry.getSchema(detection.documentType)
        if (schema?.normalization?.rules) {
          structuredData = this.applyNormalization(structuredData, schema.normalization.rules)
        }
      }

      // Merge transportation data from both extraction and regex patterns
      const mergedTransportation = this.mergeTransportationData(
        transportationMetadata,
        structuredData
      )

      return {
        success: true,
        documentType: detection.documentType,
        documentTypeConfidence: detection.confidence,
        data: structuredData,
        transportationMetadata: mergedTransportation,
        rawText: fullText,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown extraction error'
      return {
        success: false,
        documentType: 'unknown',
        documentTypeConfidence: 0,
        data: {},
        transportationMetadata: {},
        rawText: '',
        errors: [message],
      }
    }
  }

  /**
   * Extract using custom schema and prompt
   */
  private async extractWithSchema(
    ocrText: string,
    systemPrompt: string,
    _jsonSchema: unknown
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.client.chat.complete({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract data from this document:\n\n${ocrText}` },
        ],
        responseFormat: { type: 'json_object' },
      })

      const content = response.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        return null
      }

      return JSON.parse(content)
    } catch {
      return null
    }
  }

  /**
   * Apply normalization rules to extracted data
   */
  private applyNormalization(
    data: Record<string, unknown>,
    rules: Array<{ path: string; transform: NormalizationTransform }>
  ): Record<string, unknown> {
    const result = { ...data }

    for (const rule of rules) {
      this.applyTransformAtPath(result, rule.path.split('.'), rule.transform)
    }

    return result
  }

  /**
   * Apply a transform at a specific path in the data
   */
  private applyTransformAtPath(
    obj: Record<string, unknown>,
    pathParts: string[],
    transform: NormalizationTransform
  ): void {
    if (pathParts.length === 0) return

    const [current, ...rest] = pathParts

    if (current === '*' && Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          this.applyTransformAtPath(item as Record<string, unknown>, rest, transform)
        }
      }
      return
    }

    if (rest.length === 0) {
      // Apply transform
      const value = obj[current]
      if (value !== undefined && value !== null) {
        obj[current] = this.applyTransform(value, transform)
      }
    } else {
      const next = obj[current]
      if (Array.isArray(next) && rest[0] === '*') {
        for (const item of next) {
          if (typeof item === 'object' && item !== null) {
            this.applyTransformAtPath(item as Record<string, unknown>, rest.slice(1), transform)
          }
        }
      } else if (typeof next === 'object' && next !== null) {
        this.applyTransformAtPath(next as Record<string, unknown>, rest, transform)
      }
    }
  }

  /**
   * Apply a single transform to a value
   */
  private applyTransform(value: unknown, transform: NormalizationTransform): unknown {
    if (value === null || value === undefined) return value

    const strValue = String(value)

    switch (transform) {
      case 'decimal_2dp':
        return this.normalizeDecimal(strValue, 2)
      case 'decimal_4dp':
        return this.normalizeDecimal(strValue, 4)
      case 'iso_date':
        return this.normalizeDate(strValue)
      case 'uppercase':
        return strValue.toUpperCase()
      case 'lowercase':
        return strValue.toLowerCase()
      case 'trim':
        return strValue.trim()
      case 'strip_whitespace':
        return strValue.replace(/\s/g, '')
      case 'normalize_container':
        return this.normalizeContainer(strValue)
      default:
        return value
    }
  }

  /**
   * Normalize decimal to specified precision
   */
  private normalizeDecimal(value: string, decimals: number): string {
    const cleaned = value.replace(/[^\d.,\-]/g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    if (isNaN(num)) return value
    return num.toFixed(decimals)
  }

  /**
   * Normalize date to ISO format
   */
  private normalizeDate(value: string): string {
    // Try common date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY or MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
    ]

    for (const format of formats) {
      const match = value.match(format)
      if (match) {
        let year: number, month: number, day: number

        if (match[1].length === 4) {
          // YYYY-MM-DD
          year = parseInt(match[1], 10)
          month = parseInt(match[2], 10)
          day = parseInt(match[3], 10)
        } else {
          // DD.MM.YYYY or similar
          day = parseInt(match[1], 10)
          month = parseInt(match[2], 10)
          year = parseInt(match[3], 10)
        }

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
      }
    }

    return value
  }

  /**
   * Normalize container number
   */
  private normalizeContainer(value: string): string {
    return value.toUpperCase().replace(/\s/g, '')
  }

  /**
   * Merge transportation data from regex extraction and structured extraction
   */
  private mergeTransportationData(
    regexData: TransportationMetadata,
    structuredData: Record<string, unknown>
  ): TransportationMetadata {
    const result: TransportationMetadata = { ...regexData }

    // Try to get transportation from structured data
    const transportation = structuredData.transportation as Record<string, unknown> | undefined
    const routing = structuredData.routing as Record<string, unknown> | undefined
    const vessel = structuredData.vessel as Record<string, unknown> | undefined
    const dates = structuredData.dates as Record<string, unknown> | undefined
    const carrier = structuredData.carrier as Record<string, unknown> | undefined
    const references = structuredData.references as Record<string, unknown> | undefined

    // Merge B/L number
    if (!result.blNumber && transportation?.bl_number) {
      result.blNumber = String(transportation.bl_number)
    }
    if (!result.blNumber && structuredData.bl_number) {
      result.blNumber = String(structuredData.bl_number)
    }
    if (!result.blNumber && references?.bl_number) {
      result.blNumber = String(references.bl_number)
    }

    // Merge container numbers
    const structContainers =
      transportation?.container_numbers ?? structuredData.container_numbers ?? references?.container_number
    if (structContainers) {
      const containers = Array.isArray(structContainers) ? structContainers : [structContainers]
      const existing = result.containerNumbers ?? []
      result.containerNumbers = [...new Set([...existing, ...containers.map(String)])]
    }

    // Merge vessel info
    if (!result.vesselName && vessel?.name) {
      result.vesselName = String(vessel.name)
    }
    if (!result.vesselName && transportation?.vessel_name) {
      result.vesselName = String(transportation.vessel_name)
    }

    if (!result.vesselImo && vessel?.imo_number) {
      result.vesselImo = String(vessel.imo_number)
    }

    if (!result.voyageNumber && vessel?.voyage_number) {
      result.voyageNumber = String(vessel.voyage_number)
    }
    if (!result.voyageNumber && transportation?.voyage_number) {
      result.voyageNumber = String(transportation.voyage_number)
    }

    // Merge routing
    if (!result.portOfLoading && routing?.port_of_loading) {
      result.portOfLoading = String(routing.port_of_loading)
    }
    if (!result.portOfDischarge && routing?.port_of_discharge) {
      result.portOfDischarge = String(routing.port_of_discharge)
    }

    // Merge dates
    if (!result.etd && dates?.etd) {
      result.etd = String(dates.etd)
    }
    if (!result.eta && dates?.eta) {
      result.eta = String(dates.eta)
    }

    // Merge carrier
    if (!result.carrierName && carrier?.name) {
      result.carrierName = String(carrier.name)
    }
    if (!result.carrierScac && carrier?.scac_code) {
      result.carrierScac = String(carrier.scac_code)
    }

    // Merge booking number
    if (!result.bookingNumber && structuredData.booking_number) {
      result.bookingNumber = String(structuredData.booking_number)
    }
    if (!result.bookingNumber && transportation?.booking_number) {
      result.bookingNumber = String(transportation.booking_number)
    }

    return result
  }

  /**
   * Extract invoice data from a file buffer (legacy method for backward compatibility)
   *
   * @param fileBuffer - The file content as a Buffer
   * @param filename - Original filename (used for MIME type detection)
   * @returns Extracted invoice data with confidence score
   */
  async extractInvoice(fileBuffer: Buffer, filename: string): Promise<InvoiceExtractionResult> {
    try {
      const { text: fullText, raw: rawResponse } = await this.extractText(fileBuffer, filename)

      // Use chat completion with the schema to extract structured data
      const structuredData = await this.extractStructuredData(fullText)

      // Calculate confidence based on extraction quality
      const confidence = this.calculateConfidence(structuredData)

      // Transform to our internal format
      const extractedData = this.transformToInternalFormat(structuredData)

      return {
        success: true,
        data: extractedData,
        rawResponse: rawResponse as unknown as undefined,
        confidence,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown extraction error'
      return {
        success: false,
        confidence: 'LOW',
        errors: [message],
      }
    }
  }

  /**
   * Use Mistral chat completion to extract structured data from OCR text
   */
  private async extractStructuredData(ocrText: string): Promise<MistralExtractedInvoice | null> {
    try {
      const systemPrompt = `You are an invoice data extraction assistant. Extract structured data from the invoice text provided.
Return a JSON object matching this schema:
${JSON.stringify(INVOICE_EXTRACTION_SCHEMA, null, 2)}

Important rules:
- Extract all monetary values as decimal strings (e.g., "1234.56")
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- Currency should be 3-letter ISO code (PLN, EUR, USD, etc.)
- VAT rate should be the percentage number only (e.g., "23" not "23%")
- If a field cannot be found, omit it from the response
- Line items array is required - extract all visible line items`

      const response = await this.client.chat.complete({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract invoice data from this text:\n\n${ocrText}` },
        ],
        responseFormat: { type: 'json_object' },
      })

      const content = response.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        return null
      }

      return JSON.parse(content) as MistralExtractedInvoice
    } catch {
      return null
    }
  }

  /**
   * Calculate extraction confidence based on data completeness
   */
  private calculateConfidence(data: MistralExtractedInvoice | null): ExtractionConfidence {
    if (!data) return 'LOW'

    let score = 0
    const maxScore = 10

    // Core fields
    if (data.invoice_number) score += 2
    if (data.invoice_date) score += 1
    if (data.seller?.name) score += 2
    if (data.buyer?.name) score += 1
    if (data.currency) score += 1

    // Line items quality
    if (data.line_items && data.line_items.length > 0) {
      score += 2
      const hasAmounts = data.line_items.some(
        (li) => li.net_amount || li.gross_amount || li.unit_price_net
      )
      if (hasAmounts) score += 1
    }

    // Determine confidence level
    const percentage = (score / maxScore) * 100
    if (percentage >= 80) return 'HIGH'
    if (percentage >= 50) return 'MEDIUM'
    return 'LOW'
  }

  /**
   * Transform Mistral extraction format to our internal format
   */
  private transformToInternalFormat(data: MistralExtractedInvoice | null): ExtractedInvoiceData {
    if (!data) {
      return {
        lineItems: [],
      }
    }

    const lineItems: ExtractedLineItem[] = (data.line_items || []).map((li, index) => ({
      lineNumber: li.line_number ?? index + 1,
      description: li.description,
      quantity: li.quantity ?? null,
      unit: li.unit ?? null,
      unitPriceNet: li.unit_price_net ?? null,
      vatRate: li.vat_rate ?? null,
      netAmount: li.net_amount ?? null,
      vatAmount: li.vat_amount ?? null,
      grossAmount: li.gross_amount ?? null,
    }))

    return {
      invoiceNumber: data.invoice_number ?? null,
      invoiceDate: data.invoice_date ?? null,
      dueDate: data.due_date ?? null,
      serviceDate: data.service_date ?? null,
      seller: data.seller
        ? {
            name: data.seller.name ?? null,
            taxId: data.seller.tax_id ?? null,
            address: data.seller.address ?? null,
          }
        : undefined,
      buyer: data.buyer
        ? {
            name: data.buyer.name ?? null,
            taxId: data.buyer.tax_id ?? null,
            address: data.buyer.address ?? null,
          }
        : undefined,
      lineItems,
      totals: data.totals
        ? {
            netAmount: data.totals.net_amount ?? null,
            vatAmount: data.totals.vat_amount ?? null,
            grossAmount: data.totals.gross_amount ?? null,
          }
        : undefined,
      currency: data.currency ?? null,
      paymentTerms: data.payment_terms ?? null,
      bankAccount: data.bank_account ?? null,
    }
  }

  /**
   * Re-extract invoice from existing attachment
   */
  async reExtract(attachmentBuffer: Buffer, filename: string): Promise<InvoiceExtractionResult> {
    return this.extractInvoice(attachmentBuffer, filename)
  }
}

/**
 * Factory function to create MistralOcrService instance
 * Useful for DI registration
 */
export function createMistralOcrService(
  schemaRegistry?: SchemaRegistry,
  documentDetector?: DocumentDetector,
  transportationExtractor?: TransportationMetadataExtractor
): MistralOcrService {
  return new MistralOcrService(schemaRegistry, documentDetector, transportationExtractor)
}
