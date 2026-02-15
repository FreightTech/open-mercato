/**
 * FMS Documents - Document Extraction API
 * Triggers AI-powered extraction on uploaded documents (invoices, B/L, customs, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, FmsDocumentPage, DocumentCategory } from '../../../../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import { getExtractionService } from '../../../../lib/extraction.service'
import { getInvoiceExtractionService } from '../../../../lib/invoice-extraction.service'
import type { PipelineOrchestrator } from '../../../../services/pipeline/orchestrator'
import type { PageImageService } from '../../../../services/page-image.service'

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

    let responsePayload: Record<string, unknown> | null = null

    // Try pipeline first if enabled
    const pipelineEnabled = process.env.DOCUMENT_PROCESSING_ENABLED === 'true'

    if (pipelineEnabled) {
      try {
        const orchestrator = container.resolve<PipelineOrchestrator>('fmsPipelineOrchestrator')

        // Get attachment file buffer
        const attachment = await em.findOne(Attachment, { id: document.attachmentId })
        if (!attachment?.partitionCode || !attachment?.storagePath) {
          return NextResponse.json({ error: 'Attachment file not found' }, { status: 404 })
        }

        const filePath = resolveAttachmentAbsolutePath(
          attachment.partitionCode,
          attachment.storagePath,
          attachment.storageDriver
        )

        const fs = await import('fs')
        const path = await import('path')
        const fileBuffer = fs.readFileSync(filePath)
        const filename = path.basename(filePath)

        // Update status to processing
        document.processingStatus = 'processing'
        await em.flush()

        // Run the pipeline
        const pipelineResult = await orchestrator.processDocument(fileBuffer, filename)

        // Store results on document
        document.processingStatus = 'completed'
        document.processingResult = pipelineResult as unknown as Record<string, unknown>
        document.consensusConfidence = pipelineResult.consensus.overallConfidence.toFixed(2)
        document.consensusRecommendation = pipelineResult.consensus.recommendation
        document.documentType = pipelineResult.documentType
        document.documentTypeConfidence = pipelineResult.documentTypeConfidence
        document.extractedData = pipelineResult.consensus.consensusData
        document.processedAt = new Date()
        await em.flush()

        responsePayload = {
          ok: true,
          documentId: document.id,
          documentType: pipelineResult.documentType,
          documentTypeConfidence: pipelineResult.documentTypeConfidence,
          consensus: {
            recommendation: pipelineResult.consensus.recommendation,
            overallConfidence: pipelineResult.consensus.overallConfidence,
            data: pipelineResult.consensus.consensusData,
            disagreements: pipelineResult.consensus.disagreements,
            providerCount: pipelineResult.consensus.providerResults.length,
          },
          processingTimeMs: pipelineResult.processingTimeMs,
        }
      } catch (pipelineError) {
        console.error('[fms-documents] Pipeline extraction failed, falling back:', pipelineError)
        document.processingStatus = 'failed'
        await em.flush()
        // Fall through to legacy extraction
      }
    }

    // Legacy extraction paths (only if pipeline didn't succeed)
    if (!responsePayload) {
      const extractionService = getExtractionService()

      const isAvailable = await extractionService.isAvailable()
      if (!isAvailable) {
        return NextResponse.json(
          { error: 'Document extraction service is not available' },
          { status: 503 }
        )
      }

      // For invoices with a project, use the legacy invoice extraction service
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

          responsePayload = {
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
          }
        }
      }

      // General extraction fallback
      if (!responsePayload) {
        const result = await em.transactional(async (txEm) => {
          return await extractionService.processDocument({
            em: txEm,
            document,
            organizationId: auth.orgId!,
            tenantId: auth.tenantId!,
          })
        })

        responsePayload = {
          ok: true,
          documentId: document.id,
          documentType: document.category,
          extraction: result.extraction,
        }
      }
    }

    // Always extract page images for PDF files if none exist yet
    const pageAttachment = await em.findOne(Attachment, { id: document.attachmentId })
    if (pageAttachment) {
      const isPdf = pageAttachment.mimeType === 'application/pdf' ||
        (pageAttachment.fileName || '').toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const existingPages = await em.count(FmsDocumentPage, { document: documentId })
        if (existingPages === 0) {
          try {
            const filePath = resolveAttachmentAbsolutePath(
              pageAttachment.partitionCode, pageAttachment.storagePath, pageAttachment.storageDriver
            )
            const fs = await import('fs')
            const fileBuffer = fs.readFileSync(filePath)
            const pageImageService = container.resolve<PageImageService>('fmsDocumentPageImageService')
            const pageResults = await pageImageService.extractAndStorePdfPages(
              fileBuffer, documentId, auth.orgId!, auth.tenantId!
            )
            if (pageResults.length > 0) {
              const pageEm = em.fork()
              for (const pageResult of pageResults) {
                pageEm.persist(pageEm.create(FmsDocumentPage, {
                  organizationId: auth.orgId!, tenantId: auth.tenantId!,
                  document: documentId, pageNumber: pageResult.pageNumber,
                  storagePath: pageResult.storagePath,
                  storageDriver: pageImageService.getDriverId(),
                  width: pageResult.width ?? null, height: pageResult.height ?? null,
                  fileSize: pageResult.fileSize ?? null,
                }))
              }
              await pageEm.flush()
            }
          } catch (pageErr) {
            console.error('[fms_documents] Page extraction failed:', pageErr)
          }
        }
      }
    }

    return NextResponse.json(responsePayload)
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

    // Return pipeline status if available
    if (document.processingStatus !== 'pending') {
      return NextResponse.json({
        extracted: document.processingStatus === 'completed',
        processingStatus: document.processingStatus,
        processedAt: document.processedAt,
        documentType: document.documentType,
        documentTypeConfidence: document.documentTypeConfidence,
        consensusConfidence: document.consensusConfidence,
        consensusRecommendation: document.consensusRecommendation,
        extractedData: document.extractedData,
      })
    }

    // Check if there's an invoice linked to this document (legacy)
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
