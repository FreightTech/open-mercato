import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, FmsDocumentPage } from '../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator'
import type { PageImageService } from '../services/page-image.service'
import type { DocumentProcessedPayload } from '../events'
import { applyExtractionResult, normalizeConsensusData } from '../services/extraction-result-mapper'
import {
  documentsLogger as logger,
  recordDocumentParse,
  withDocumentParseSpan,
} from '../lib/observability'

export const EXTRACT_QUEUE_NAME = 'fms-document-extract'

const MAX_RETRIES = 3

export const metadata: WorkerMeta = {
  queue: EXTRACT_QUEUE_NAME,
  id: 'fms_documents:document-extract',
  concurrency: 3,
}

export type ExtractPayload = {
  documentId: string
  tenantId: string
  organizationId: string
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<ExtractPayload>,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em').fork()
  const { documentId, tenantId, organizationId } = job.payload
  return withDocumentParseSpan(
    { documentId, tenantId, organizationId, source: 'worker' },
    () => handleInner(em, job, ctx),
  )
}

async function handleInner(
  em: EntityManager,
  job: QueuedJob<ExtractPayload>,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  const { documentId, tenantId, organizationId } = job.payload

  logger.info('fms.document.extraction.worker.started', { documentId, tenantId, organizationId })

  const document = await em.findOne(FmsDocument, {
    id: documentId,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  if (!document) {
    logger.warn('fms.document.extraction.worker.not_found', { documentId })
    recordDocumentParse(
      { documentType: 'unknown', category: 'unknown', tenantId, organizationId, source: 'worker' },
      'skipped',
    )
    return
  }

  // Idempotency: skip if already completed
  if (document.processingStatus === 'completed') {
    logger.info('fms.document.extraction.worker.already_completed', { documentId })
    recordDocumentParse(
      {
        documentType: document.documentType || 'unknown',
        category: document.category || 'unknown',
        tenantId,
        organizationId,
        source: 'worker',
      },
      'skipped',
    )
    return
  }

  // Max retries guard
  if (document.retryCount >= MAX_RETRIES) {
    document.processingStatus = 'failed'
    document.lastError = `Max retries (${MAX_RETRIES}) exceeded`
    await em.flush()
    logger.warn('fms.document.extraction.worker.max_retries', { documentId, retryCount: document.retryCount })
    recordDocumentParse(
      {
        documentType: document.documentType || 'unknown',
        category: document.category || 'unknown',
        tenantId,
        organizationId,
        source: 'worker',
      },
      'failure',
    )
    return
  }

  // Set processing status
  document.processingStatus = 'processing'
  await em.flush()

  const startTime = Date.now()

  try {
    // Load attachment file
    const attachment = await em.findOne(Attachment, { id: document.attachmentId })
    if (!attachment?.partitionCode || !attachment?.storagePath) {
      document.processingStatus = 'failed'
      document.lastError = 'Attachment file not found'
      await em.flush()
      return
    }

    const filePath = resolveAttachmentAbsolutePath(
      attachment.partitionCode,
      attachment.storagePath,
      attachment.storageDriver,
    )

    const fs = await import('fs')
    const path = await import('path')
    const fileBuffer = fs.readFileSync(filePath)
    const filename = path.basename(filePath)

    // Run extraction pipeline (with timeouts built into orchestrator)
    const orchestrator = ctx.resolve<PipelineOrchestrator>('fmsPipelineOrchestrator')
    const pipelineResult = await orchestrator.processDocument(fileBuffer, filename)

    // Apply results to document
    applyExtractionResult(document, pipelineResult)
    await em.flush()

    const durationMs = Date.now() - startTime

    logger.info('fms.document.extraction.worker.completed', {
      documentId,
      documentType: document.documentType,
      durationMs,
      confidence: document.consensusConfidence,
      tenantId,
      organizationId,
    })

    recordDocumentParse(
      {
        documentType: document.documentType || 'unknown',
        category: document.category || 'unknown',
        tenantId,
        organizationId,
        source: 'worker',
      },
      'success',
      durationMs,
    )

    // Extract PDF page images if none exist yet
    const isPdf = attachment.mimeType === 'application/pdf' ||
      (attachment.fileName || '').toLowerCase().endsWith('.pdf')

    if (isPdf) {
      const existingPages = await em.count(FmsDocumentPage, { document: documentId })
      if (existingPages === 0) {
        try {
          const pageImageService = ctx.resolve<PageImageService>('fmsDocumentPageImageService')
          const pageResults = await pageImageService.extractAndStorePdfPages(
            fileBuffer, documentId, organizationId, tenantId,
          )
          if (pageResults.length > 0) {
            const pageEm = em.fork()
            for (const pageResult of pageResults) {
              pageEm.persist(pageEm.create(FmsDocumentPage, {
                organizationId,
                tenantId,
                document: documentId,
                pageNumber: pageResult.pageNumber,
                storagePath: pageResult.storagePath,
                storageDriver: pageImageService.getDriverId(),
                width: pageResult.width ?? null,
                height: pageResult.height ?? null,
                fileSize: pageResult.fileSize ?? null,
              }))
            }
            await pageEm.flush()
          }
        } catch (pageErr) {
          logger.warn('fms.document.extraction.worker.page_extraction_failed', {
            documentId,
            error: pageErr instanceof Error ? pageErr.message : 'Unknown error',
          })
        }
      }
    }

    // Emit document processed event
    try {
      const eventBus = ctx.resolve('eventBus') as {
        emitEvent(event: string, payload: DocumentProcessedPayload, options?: { persistent?: boolean }): Promise<void>
      }

      const consensusData = pipelineResult.consensus.consensusData
      const containers = consensusData?.containers as Array<{ number?: string; container_number?: string }> | undefined
      const containerDetails = consensusData?.container_details as Array<{ container_number?: string }> | undefined
      const containerSrcForEvent = containers ?? containerDetails
      const containerNumbersForEvent = containerSrcForEvent
        ?.map((c) => (c as { number?: string; container_number?: string }).number ?? c.container_number)
        .filter((n): n is string => Boolean(n))

      const eventPayload: DocumentProcessedPayload = {
        id: document.id,
        tenantId: document.tenantId,
        organizationId: document.organizationId,
        category: document.category ?? 'unknown',
        bookingNumber: document.bookingNumber ?? undefined,
        blNumber: document.blNumber ?? undefined,
        containerNumbers: containerNumbersForEvent?.length ? containerNumbersForEvent : undefined,
        createdBy: document.createdBy ?? undefined,
      }

      await eventBus.emitEvent('fms_documents.document.processed', eventPayload, { persistent: true })
    } catch (eventError) {
      logger.warn('fms.document.extraction.worker.event_failed', {
        documentId,
        error: eventError instanceof Error ? eventError.message : 'Unknown error',
      })
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime

    document.processingStatus = 'failed'
    document.lastError = error.message || 'Unknown error'
    document.retryCount = (document.retryCount || 0) + 1
    await em.flush()

    logger.error('fms.document.extraction.worker.failed', {
      documentId,
      error: error.message || 'Unknown error',
      retryCount: document.retryCount,
      durationMs,
      tenantId,
      organizationId,
    })

    recordDocumentParse(
      {
        documentType: document.documentType || 'unknown',
        category: document.category || 'unknown',
        tenantId,
        organizationId,
        source: 'worker',
      },
      'failure',
      durationMs,
    )

    // Re-throw so the queue system can retry
    throw error
  }
}
