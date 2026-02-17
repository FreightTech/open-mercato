import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { FmsDocument } from '../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator'
import { ensureTenantScope, ensureOrganizationScope } from './shared'

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
        document.category = result.documentType
      }
      await em.flush()

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

export { processDocumentCommand }
