import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsInvoice } from '../../../../data/entities'
import { MistralOcrService } from '../../../../services/mistral-ocr.service'

const routeMetadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const metadata = routeMetadata

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Re-extract invoice data from the attached file using Mistral OCR
 * This endpoint allows re-running extraction if the initial extraction was poor
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  // Find the invoice
  const invoice = await em.findOne(
    FmsInvoice,
    {
      id,
      tenantId,
      organizationId: { $in: allowedOrgIds },
      deletedAt: null,
    }
  )

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (!invoice.attachmentId) {
    return NextResponse.json(
      { error: 'No attachment found for this invoice. Upload a file first.' },
      { status: 400 }
    )
  }

  try {
    // Get attachment service and fetch the file
    // For now, we'll return an error indicating this feature needs attachment integration
    return NextResponse.json(
      {
        error: 'Re-extraction requires attachment service integration',
        message: 'Please upload a new invoice file to re-extract data',
      },
      { status: 501 }
    )

    // TODO: When attachment service is integrated:
    // const attachmentService = container.resolve('attachmentService')
    // const attachment = await attachmentService.getAttachment(invoice.attachmentId)
    // const fileBuffer = await attachmentService.downloadFile(attachment)
    //
    // const ocrService = new MistralOcrService()
    // const extractionResult = await ocrService.reExtract(fileBuffer, invoice.originalFilename ?? 'invoice.pdf')
    //
    // if (!extractionResult.success) {
    //   return NextResponse.json({ error: 'Extraction failed', details: extractionResult.errors }, { status: 422 })
    // }
    //
    // // Update invoice with new extraction data
    // invoice.extractedData = extractionResult.data as Record<string, unknown>
    // invoice.extractionConfidence = extractionResult.confidence
    // invoice.processedAt = new Date()
    // invoice.status = 'pending_review'
    //
    // await em.flush()
    //
    // return NextResponse.json({
    //   success: true,
    //   extractionConfidence: extractionResult.confidence,
    //   extractedData: extractionResult.data,
    // })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to re-extract invoice'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
