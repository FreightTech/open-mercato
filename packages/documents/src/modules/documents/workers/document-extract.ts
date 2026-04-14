import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { Document, DocumentPage } from '../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator'
import type { PageImageService } from '../services/page-image.service'
import type { DocumentProcessedPayload } from '../events'
import { applyExtractionResult, normalizeConsensusData } from '../services/extraction-result-mapper'
import { createLogger, getMeter } from '@open-mercato/logger'

export const EXTRACT_QUEUE_NAME = 'document-extract'

const MAX_RETRIES = 3

export const metadata: WorkerMeta = {
  queue: EXTRACT_QUEUE_NAME,
  id: 'documents:document-extract',
  concurrency: 3,
}

export type ExtractPayload = {
  documentId: string
  tenantId: string
  organizationId: string
}

const logger = createLogger('documents')
const meter = getMeter('documents')

const extractionCounter = meter.createCounter('documents.extracted', {
  description: 'Number of documents extracted via worker',
  unit: '1',
})

const extractionDurationHistogram = meter.createHistogram('documents.extraction.duration', {
  description: 'Document extraction duration in milliseconds',
  unit: 'ms',
})

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<ExtractPayload>,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em').fork()
  const { documentId, tenantId, organizationId } = job.payload

  logger.info('documents.document.extraction.worker.started', { documentId, tenantId, organizationId })

  const document = await em.findOne(Document, {
    id: documentId,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  if (!document) {
    logger.warn('documents.document.extraction.worker.not_found', { documentId })
    return
  }

  // Idempotency: skip if already completed
  if (document.processingStatus === 'completed') {
    logger.info('documents.document.extraction.worker.already_completed', { documentId })
    return
  }

  // Max retries guard
  if (document.retryCount >= MAX_RETRIES) {
    document.processingStatus = 'failed'
    document.lastError = `Max retries (${MAX_RETRIES}) exceeded`
    await em.flush()
    logger.warn('documents.document.extraction.worker.max_retries', { documentId, retryCount: document.retryCount })
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
    const orchestrator = ctx.resolve<PipelineOrchestrator>('documentPipelineOrchestrator')
    const pipelineResult = await orchestrator.processDocument(fileBuffer, filename)

    // Apply results to document
    applyExtractionResult(document, pipelineResult)
    await em.flush()

    const durationMs = Date.now() - startTime

    logger.info('documents.document.extraction.worker.completed', {
      documentId,
      documentType: document.documentType,
      durationMs,
      confidence: document.consensusConfidence,
      tenantId,
      organizationId,
    })

    extractionCounter.add(1, {
      category: document.category || 'unknown',
      documentType: document.documentType || 'unknown',
      status: 'success',
      tenantId,
      organizationId,
    })

    extractionDurationHistogram.record(durationMs, {
      category: document.category || 'unknown',
      documentType: document.documentType || 'unknown',
      tenantId,
      organizationId,
    })

    // Extract PDF page images if none exist yet
    const isPdf = attachment.mimeType === 'application/pdf' ||
      (attachment.fileName || '').toLowerCase().endsWith('.pdf')

    if (isPdf) {
      const existingPages = await em.count(DocumentPage, { document: documentId })
      if (existingPages === 0) {
        try {
          const pageImageService = ctx.resolve<PageImageService>('documentPageImageService')
          const pageResults = await pageImageService.extractAndStorePdfPages(
            fileBuffer, documentId, organizationId, tenantId,
          )
          if (pageResults.length > 0) {
            const pageEm = em.fork()
            for (const pageResult of pageResults) {
              pageEm.persist(pageEm.create(DocumentPage, {
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
          logger.warn('documents.document.extraction.worker.page_extraction_failed', {
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

      await eventBus.emitEvent('documents.document.processed', eventPayload, { persistent: true })
    } catch (eventError) {
      logger.warn('documents.document.extraction.worker.event_failed', {
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

    logger.error('documents.document.extraction.worker.failed', {
      documentId,
      error: error.message || 'Unknown error',
      retryCount: document.retryCount,
      durationMs,
      tenantId,
      organizationId,
    })

    extractionCounter.add(1, {
      category: document.category || 'unknown',
      documentType: 'unknown',
      status: 'failure',
      tenantId,
      organizationId,
    })

    // Re-throw so the queue system can retry
    throw error
  }
}
