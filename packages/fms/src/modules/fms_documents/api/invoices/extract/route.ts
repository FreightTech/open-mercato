import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { MistralOcrService } from '../../../services/mistral-ocr.service'

const routeMetadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.upload'] },
}

export const metadata = routeMetadata

/**
 * POST /api/fms_documents/invoices/extract
 * Extract document data WITHOUT saving to database
 * Used for preview before user confirms saving
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

    // Extract document data using enhanced schema-based extraction
    const ocrService = new MistralOcrService()
    const extractionResult = await ocrService.extractDocument(buffer, file.name)

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

    // Build preview data from extracted structure
    const previewData = {
      invoiceNumber: (structuredData.invoice_number as string) ?? null,
      invoiceDate: (structuredData.invoice_date as string) ?? null,
      dueDate: (structuredData.due_date as string) ?? null,
      serviceDate: (structuredData.service_date as string) ?? null,
      seller: structuredData.seller as { name?: string; tax_id?: string; address?: string } | undefined,
      buyer: structuredData.buyer as { name?: string; tax_id?: string; address?: string } | undefined,
      totals: structuredData.totals as { net_amount?: string; vat_amount?: string; gross_amount?: string } | undefined,
      currency: (structuredData.currency as string) ?? 'PLN',
      lineItems: (structuredData.line_items as Array<{
        line_number?: number
        description?: string
        quantity?: string
        unit?: string
        unit_price_net?: string
        vat_rate?: string
        net_amount?: string
        vat_amount?: string
        gross_amount?: string
      }>) ?? [],
    }

    // Return extraction result for preview (NOT saved yet)
    return NextResponse.json({
      success: true,
      // Document type detection
      documentType: extractionResult.documentType,
      documentTypeConfidence: extractionResult.documentTypeConfidence,
      extractionConfidence: extractionResult.documentTypeConfidence >= 70 ? 'HIGH' :
        extractionResult.documentTypeConfidence >= 40 ? 'MEDIUM' : 'LOW',
      // Extracted data for preview
      extractedData: structuredData,
      previewData,
      transportationMetadata,
      lineItemsCount: previewData.lineItems.length,
      // File info for later saving
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process document'
    console.error('[fms_documents] Invoice extraction error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
