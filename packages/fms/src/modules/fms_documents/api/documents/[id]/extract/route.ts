/**
 * FMS Documents - Document Extraction API
 * Triggers AI-powered extraction on uploaded documents (invoices, B/L, customs, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../../../../data/entities'
import { getExtractionService } from '../../../../lib/extraction.service'
import { getInvoiceExtractionService } from '../../../../lib/invoice-extraction.service'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_documents.manage'],
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Parse optional projectId from request body
    let projectId: string | null = null
    try {
      const body = await request.json()
      projectId = body.projectId || null
    } catch {
      // No body or invalid JSON - that's OK, projectId is optional
    }

    // Find the document
    const document = await em.findOne(FmsDocument, {
      id: documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // If no projectId provided, try to get it from the document's relatedEntityId
    if (!projectId && document.relatedEntityId && document.relatedEntityType === 'fms_projects:fms_project') {
      projectId = document.relatedEntityId
    }

    // Get the extraction service
    const extractionService = getExtractionService()

    // Check if service is available
    const isAvailable = await extractionService.isAvailable()
    if (!isAvailable) {
      return NextResponse.json(
        { error: 'Document extraction service is not available' },
        { status: 503 }
      )
    }

    // For invoices with a project, use the legacy invoice extraction service
    // to also create invoice records
    if (document.category === DocumentCategory.INVOICE && projectId) {
      const invoiceExtractionService = getInvoiceExtractionService()
      const invoiceAvailable = await invoiceExtractionService.isAvailable()

      if (invoiceAvailable) {
        const result = await em.transactional(async (txEm) => {
          return await invoiceExtractionService.processDocument({
            em: txEm,
            document,
            projectId: projectId!,
            organizationId: auth.orgId!,
            tenantId: auth.tenantId!,
          })
        })

        return NextResponse.json({
          ok: true,
          documentId: document.id,
          documentType: document.category,
          invoice: {
            id: result.invoice.id,
            invoiceNumber: result.invoice.invoiceNumber,
            sellerName: result.invoice.sellerName,
            grossAmount: result.invoice.grossAmount,
            confidence: result.invoice.confidence,
            status: result.invoice.status,
            lineItems: result.invoice.lineItems,
          },
          extraction: {
            success: true,
            document_type: 'invoice',
            confidence: result.extraction.overall_confidence || 'MEDIUM',
            data: result.extraction.consensus || result.extraction.results?.[0]?.data || {},
            processing_time_ms: result.extraction.processing_time_ms || 0,
          },
        })
      }
    }

    // Process the document with the general extraction service
    const result = await em.transactional(async (txEm) => {
      return await extractionService.processDocument({
        em: txEm,
        document,
        organizationId: auth.orgId!,
        tenantId: auth.tenantId!,
      })
    })

    return NextResponse.json({
      ok: true,
      documentId: document.id,
      documentType: document.category,
      extraction: result.extraction,
    })
  } catch (error: any) {
    console.error('[fms-documents] extraction error:', error)

    return NextResponse.json(
      {
        error: 'Extraction failed',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check extraction status for a document
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Find the document
    const document = await em.findOne(FmsDocument, {
      id: documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if there's an invoice linked to this document
    const { FmsProjectInvoice } = await import('../../../../../fms_projects/data/entities')
    const invoice = await em.findOne(FmsProjectInvoice, {
      documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!invoice) {
      return NextResponse.json({
        extracted: false,
        processedAt: document.processedAt,
      })
    }

    return NextResponse.json({
      extracted: true,
      processedAt: document.processedAt,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        sellerName: invoice.sellerName,
        grossAmount: invoice.grossAmount,
        confidence: invoice.confidence,
        status: invoice.status,
      },
    })
  } catch (error: any) {
    console.error('[fms-documents] extraction status error:', error)

    return NextResponse.json(
      {
        error: 'Failed to get extraction status',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
