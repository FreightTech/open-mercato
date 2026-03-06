import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { FmsDocument, DocumentCategory } from '../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator'
import { ensureTenantScope, ensureOrganizationScope } from './shared'
import type { DocumentProcessedPayload } from '../events'

const processDocumentSchema = z.object({
  id: z.string().uuid(),
})

type ProcessDocumentInput = z.infer<typeof processDocumentSchema>

interface ProcessDocumentResult {
  id: string
  processingStatus: string
  documentType: string
  consensusRecommendation: string | null
  consensusConfidence: number
}

const processDocumentCommand: CommandHandler<ProcessDocumentInput, ProcessDocumentResult> = {
  id: 'fms_documents.documents.process',
  async execute(rawInput, ctx) {
    const input = processDocumentSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const document = await em.findOne(FmsDocument, { id: input.id, deletedAt: null })
    if (!document) throw new Error('Document not found')

    ensureTenantScope(ctx, document.tenantId)
    ensureOrganizationScope(ctx, document.organizationId)

    // Get the attachment file
    const attachment = await em.findOne(Attachment, { id: document.attachmentId })
    if (!attachment?.partitionCode || !attachment?.storagePath) {
      throw new Error('Attachment file not found')
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

    // Update status
    document.processingStatus = 'processing'
    await em.flush()

    try {
      const orchestrator = ctx.container.resolve('fmsPipelineOrchestrator') as PipelineOrchestrator
      const result = await orchestrator.processDocument(fileBuffer, filename)

      // Store results
      document.processingStatus = 'completed'
      document.processingResult = result as unknown as Record<string, unknown>
      document.consensusConfidence = result.consensus.overallConfidence.toFixed(2)
      document.consensusRecommendation = result.consensus.recommendation
      document.documentType = result.documentType
      document.documentTypeConfidence = result.documentTypeConfidence
      document.extractedData = result.consensus.consensusData
      document.processedAt = new Date()

      if (result.documentType && result.documentType !== 'unknown') {
        document.category = result.documentType as DocumentCategory
      }
      await em.flush()

      // Emit document processed event for downstream subscribers
      await emitDocumentProcessedEvent(ctx, document, result.consensus.consensusData)

      return {
        id: document.id,
        processingStatus: 'completed',
        documentType: result.documentType,
        consensusRecommendation: result.consensus.recommendation,
        consensusConfidence: result.consensus.overallConfidence,
      }
    } catch (error) {
      document.processingStatus = 'failed'
      await em.flush()
      throw error
    }
  },
}

registerCommand(processDocumentCommand)

/**
 * Emit document processed event for downstream subscribers
 */
async function emitDocumentProcessedEvent(
  ctx: CommandRuntimeContext,
  document: FmsDocument,
  extractedData: Record<string, unknown> | null
): Promise<void> {
  let bus: { emitEvent(event: string, payload: DocumentProcessedPayload, options?: { persistent?: boolean }): Promise<void> } | null = null
  try {
    bus = ctx.container.resolve('eventBus')
  } catch {
    bus = null
  }
  if (!bus) return

  // Extract container numbers from extracted data
  const containers = extractedData?.containers as Array<{ number?: string }> | undefined
  const containerNumbers = containers?.map((c) => c.number).filter((n): n is string => Boolean(n))

  const payload: DocumentProcessedPayload = {
    id: document.id,
    tenantId: document.tenantId,
    organizationId: document.organizationId,
    category: document.category ?? 'unknown',
    bookingNumber: (extractedData?.booking_number as string) || undefined,
    blNumber: (extractedData?.bl_number as string) || undefined,
    containerNumbers: containerNumbers?.length ? containerNumbers : undefined,
    createdBy: document.createdBy ?? undefined,
  }

  try {
    await bus.emitEvent('fms_documents.document.processed', payload, { persistent: true })
  } catch (error) {
    // Log but don't fail the command
    console.warn('[fms_documents:process] Failed to emit document processed event:', error)
  }
}

export { processDocumentCommand }
