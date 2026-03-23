import { NextRequest, NextResponse } from 'next/server'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { MistralOcrService } from '../../../services/mistral-ocr.service'
import type { PageImageService } from '../../../services/page-image.service'
import { FmsInvoicePage } from '../../../data/entities'
import type { TransportationMetadata } from '../../../data/schema-types'
// Import to register commands
import '../../../commands'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger } from '@open-mercato/logger'
import { getMeter } from '@open-mercato/logger'

const logger = createLogger('fms_documents')
const meter = getMeter('fms_documents')

// Create counter once at module scope
const invoicesCreatedCounter = meter.createCounter('fms.invoices.created', {
  description: 'Number of invoices created',
  unit: '1',
})

/**
 * Normalize a numeric string for validation.
 * Handles values like "23%", "1,234.56", spaces, etc.
 * Returns a string matching /^\d+(\.\d{1,2})?$/ or the default value.
 */
function normalizeNumericString(value: string | null | undefined, defaultValue: string = '0'): string {
  if (!value || typeof value !== 'string') {
    return defaultValue
  }

  // Remove percentage signs, spaces, and currency symbols
  let cleaned = value.trim().replace(/[%\s$€£¥zł]/gi, '')

  // Handle European number format (1.234,56 -> 1234.56)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // If comma comes after dot, treat comma as decimal separator
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // Otherwise, remove commas (thousand separators)
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    // Single comma - determine if decimal or thousand separator
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely a decimal separator
      cleaned = cleaned.replace(',', '.')
    } else {
      // Likely thousand separators
      cleaned = cleaned.replace(/,/g, '')
    }
  }

  // Parse and format to ensure valid number
  const num = parseFloat(cleaned)
  if (isNaN(num) || num < 0) {
    return defaultValue
  }

  // Format to 2 decimal places max
  return num.toFixed(2).replace(/\.?0+$/, '') || '0'
}

/**
 * Normalize a quantity string (allows up to 4 decimal places)
 */
function normalizeQuantityString(value: string | null | undefined, defaultValue: string = '1'): string {
  if (!value || typeof value !== 'string') {
    return defaultValue
  }

  // Remove spaces and handle comma as decimal
  let cleaned = value.trim().replace(/\s/g, '')
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = cleaned.replace(',', '.')
  } else {
    cleaned = cleaned.replace(/,/g, '')
  }

  const num = parseFloat(cleaned)
  if (isNaN(num) || num < 0) {
    return defaultValue
  }

  // Format to 4 decimal places max
  return num.toFixed(4).replace(/\.?0+$/, '') || '1'
}

const routeMetadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.upload'] },
}

export const metadata = routeMetadata

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: PDF, PNG, JPEG, TIFF, WebP' },
      { status: 400 }
    )
  }

  // Validate file size (max 20MB)
  const maxSize = 20 * 1024 * 1024
  if (file.size > maxSize) {
    return NextResponse.json({ error: 'File too large. Maximum size: 20MB' }, { status: 400 })
  }

  try {
    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract document data using enhanced schema-based extraction (with timeout)
    const ocrService = new MistralOcrService()
    const ocrTimeoutMs = parseInt(process.env.FMS_OCR_TIMEOUT_MS || '120000', 10)
    const extractionResult = await Promise.race([
      ocrService.extractDocument(buffer, file.name),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`OCR extraction timed out after ${ocrTimeoutMs}ms`)), ocrTimeoutMs),
      ),
    ])

    if (!extractionResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to extract document data',
          details: extractionResult.errors,
        },
        { status: 422 }
      )
    }

    // Get structured data and transportation metadata
    const structuredData = extractionResult.data
    const transportationMetadata = extractionResult.transportationMetadata

    // Build invoice data from extracted structure
    // Handle both invoice schema and other document types
    const invoiceData = {
      invoiceNumber: (structuredData.invoice_number as string) ?? null,
      invoiceDate: structuredData.invoice_date
        ? new Date(structuredData.invoice_date as string)
        : null,
      dueDate: structuredData.due_date ? new Date(structuredData.due_date as string) : null,
      serviceDate: structuredData.service_date
        ? new Date(structuredData.service_date as string)
        : null,
      seller: structuredData.seller as { name?: string; tax_id?: string; address?: string } | undefined,
      buyer: structuredData.buyer as { name?: string; tax_id?: string; address?: string } | undefined,
      totals: structuredData.totals as { net_amount?: string; vat_amount?: string; gross_amount?: string } | undefined,
      currency: (structuredData.currency as string) ?? 'PLN',
      lineItems: structuredData.line_items as Array<{
        line_number?: number
        description?: string
        quantity?: string
        unit?: string
        unit_price_net?: string
        vat_rate?: string
        net_amount?: string
        vat_amount?: string
        gross_amount?: string
      }> | undefined,
    }

    // Build line items from extraction with normalization
    const lineItems = (invoiceData.lineItems ?? []).map((li, index) => ({
      lineNumber: li.line_number ?? index + 1,
      description: li.description ?? 'Unknown item',
      quantity: normalizeQuantityString(li.quantity, '1'),
      unit: li.unit ?? null,
      unitPriceNet: normalizeQuantityString(li.unit_price_net, '0'),
      vatRate: normalizeNumericString(li.vat_rate, '0'),
      netAmount: normalizeNumericString(li.net_amount, '0'),
      vatAmount: normalizeNumericString(li.vat_amount, '0'),
      grossAmount: normalizeNumericString(li.gross_amount, '0'),
      rawDescription: li.description ?? null,
    }))

    // Create the invoice via command
    const ctx: CommandRuntimeContext = {
      container,
      auth,
      organizationScope: scope,
      selectedOrganizationId: organizationId as string,
      organizationIds: scope?.filterIds ?? null,
      request,
    }

    const bus = new CommandBus()

    const { result } = await bus.execute('fms_documents.invoices.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        dueDate: invoiceData.dueDate,
        serviceDate: invoiceData.serviceDate,
        sellerName: invoiceData.seller?.name ?? null,
        sellerTaxId: invoiceData.seller?.tax_id ?? null,
        sellerAddress: invoiceData.seller?.address ?? null,
        buyerName: invoiceData.buyer?.name ?? null,
        buyerTaxId: invoiceData.buyer?.tax_id ?? null,
        buyerAddress: invoiceData.buyer?.address ?? null,
        netAmount: normalizeNumericString(invoiceData.totals?.net_amount, '0'),
        vatAmount: normalizeNumericString(invoiceData.totals?.vat_amount, '0'),
        grossAmount: normalizeNumericString(invoiceData.totals?.gross_amount, '0'),
        currencyCode: invoiceData.currency,
        originalFilename: file.name,
        extractedData: structuredData,
        extractionConfidence: extractionResult.documentTypeConfidence >= 70 ? 'HIGH' :
          extractionResult.documentTypeConfidence >= 40 ? 'MEDIUM' : 'LOW',
        processedAt: new Date(),
        // Document type detection
        documentType: extractionResult.documentType,
        documentTypeConfidence: extractionResult.documentTypeConfidence,
        // Transportation metadata
        transportationMetadata: transportationMetadata as TransportationMetadata,
        blNumber: transportationMetadata.blNumber ?? null,
        containerNumbers: transportationMetadata.containerNumbers ?? null,
        vesselName: transportationMetadata.vesselName ?? null,
        voyageNumber: transportationMetadata.voyageNumber ?? null,
        status: 'pending_review',
        lineItems,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    const invoice = result as { id: string }

    // Log invoice creation
    const brandId = request.headers.get('x-brand-id') || undefined
    logger.info('fms.invoice.created', {
      invoiceId: invoice.id,
      invoiceNumber: invoiceData.invoiceNumber,
      documentType: extractionResult.documentType,
      confidence: extractionResult.documentTypeConfidence,
      lineItemsCount: lineItems.length,
      tenantId: tenantId as string,
      organizationId: organizationId as string,
      brandId,
    })

    // Emit metrics
    invoicesCreatedCounter.add(1, {
      documentType: extractionResult.documentType || 'unknown',
      tenantId: tenantId as string,
      organizationId: organizationId as string,
      brandId: brandId || 'unknown',
    })

    // Extract and store page images for PDF files
    let pageCount = 0
    if (file.type === 'application/pdf') {
      try {
        const pageImageService = container.resolve<PageImageService>('fmsPageImageService')
        const pageResults = await pageImageService.extractAndStorePdfPages(
          buffer,
          invoice.id,
          organizationId as string,
          tenantId as string
        )

        // Store page records in database
        if (pageResults.length > 0) {
          const em = (container.resolve('em') as EntityManager).fork()

          for (const pageResult of pageResults) {
            const page = em.create(FmsInvoicePage, {
              organizationId: organizationId as string,
              tenantId: tenantId as string,
              invoice: invoice.id,
              pageNumber: pageResult.pageNumber,
              storagePath: pageResult.storagePath,
              storageDriver: pageImageService.getDriverId(),
              width: pageResult.width ?? null,
              height: pageResult.height ?? null,
              fileSize: pageResult.fileSize ?? null,
            })
            em.persist(page)
          }

          await em.flush()
          pageCount = pageResults.length
        }
      } catch (pageErr) {
        // Log but don't fail the upload if page extraction fails
        console.error('[fms_documents] Page extraction failed:', pageErr)
      }
    }

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      documentType: extractionResult.documentType,
      documentTypeConfidence: extractionResult.documentTypeConfidence,
      extractionConfidence: extractionResult.documentTypeConfidence >= 70 ? 'HIGH' :
        extractionResult.documentTypeConfidence >= 40 ? 'MEDIUM' : 'LOW',
      extractedData: structuredData,
      transportationMetadata,
      lineItemsCount: lineItems.length,
      pageCount,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process document'
    console.error('Invoice upload error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const invoiceUploadBodySchema = z.object({
  file: z.string().min(1).describe('Binary file payload (PDF, PNG, JPEG, TIFF, or WebP); supplied as multipart form-data'),
})

const invoiceUploadResponseSchema = z.object({
  success: z.literal(true),
  invoiceId: z.string(),
  documentType: z.string(),
  documentTypeConfidence: z.number(),
  extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  extractedData: z.record(z.string(), z.unknown()),
  transportationMetadata: z.record(z.string(), z.unknown()),
  lineItemsCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  summary: 'Upload and OCR-extract FMS invoice',
  description: 'Upload a document for automated OCR extraction and invoice creation.',
  methods: {
    POST: {
      summary: 'Upload invoice document',
      description:
        'Upload a PDF or image file. The document is processed with OCR to extract invoice data, line items, and transportation metadata. A new FMS invoice record is created automatically.',
      tags: ['FMS Documents'],
      requestBody: {
        contentType: 'multipart/form-data',
        schema: invoiceUploadBodySchema,
      },
      responses: [
        { status: 200, description: 'Invoice extracted and created successfully', schema: invoiceUploadResponseSchema },
      ],
      errors: [
        { status: 400, description: 'No file provided, invalid file type, or file too large', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 422, description: 'OCR extraction failed', schema: errorSchema },
      ],
    },
  },
}
