import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { Document, DocumentPage, DocumentCategory } from '../../data/entities'
import { uploadDocumentSchema } from '../../data/validators'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { randomUUID } from 'crypto'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PageImageService } from '../../services/page-image.service'
import { EXTRACT_QUEUE_NAME, type ExtractPayload } from '../../workers/document-extract'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger, getMeter } from '@open-mercato/logger'

const logger = createLogger('documents')
const meter = getMeter('documents')

// Create counter once at module scope
const documentCounter = meter.createCounter('documents.created', {
  description: 'Number of documents created',
  unit: '1',
})

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['documents.upload'],
  },
}

export async function POST(request: NextRequest) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Store validated auth values for type safety
    const orgId = auth.orgId
    const tenantId = auth.tenantId
    const userId = typeof auth.userId === 'string' ? auth.userId : null

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const enableExtraction = formData.get('enableExtraction') === 'true'

    // Parse and validate metadata
    const metadata = {
      name: formData.get('name'),
      category: formData.get('category'),
      description: formData.get('description'),
      relatedEntityId: formData.get('relatedEntityId'),
      relatedEntityType: formData.get('relatedEntityType'),
    }

    const validatedMetadata = uploadDocumentSchema.parse(metadata)

    // Store file first (filesystem operation, before transaction)
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)
    const safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

    const partitionCode = 'documents'
    let stored
    try {
      stored = await storePartitionFile({
        partitionCode: partitionCode,
        orgId: orgId,
        tenantId: tenantId,
        fileName: safeName,
        buffer: fileBuffer,
      })
    } catch (error) {
      console.error('[documents] failed to persist file', error)
      return NextResponse.json({ error: 'Failed to persist attachment' }, { status: 500 })
    }

    // Ensure partition exists (idempotent, outside transaction to avoid duplicate key errors)
    const partitionEm = em.fork()
    try {
      const existing = await partitionEm.findOne(AttachmentPartition, { code: partitionCode })
      if (!existing) {
        partitionEm.create(AttachmentPartition, {
          code: partitionCode,
          title: 'Documents',
          description: 'Documents (offers, invoices, customs, BOL)',
          storageDriver: 'local',
          isPublic: false,
          requiresOcr: false,
        })
        await partitionEm.flush()
      }
    } catch {
      // Partition was created concurrently — safe to ignore
    }

    // Wrap all database operations in a transaction
    const result = await em.transactional(async (em) => {
      // Generate IDs upfront to handle circular reference between document and attachment
      const documentId = randomUUID()
      const attachmentId = randomUUID()

      // Create Document record
      const document = em.create(Document, {
        id: documentId,
        organizationId: orgId,
        tenantId: tenantId,
        name: validatedMetadata.name,
        category: validatedMetadata.category as DocumentCategory,
        description: validatedMetadata.description || null,
        attachmentId: attachmentId,
        relatedEntityId: validatedMetadata.relatedEntityId || null,
        relatedEntityType: validatedMetadata.relatedEntityType || null,
        createdBy: userId,
        updatedBy: userId,
      })

      // Create attachment record
      const attachment = em.create(Attachment, {
        id: attachmentId,
        entityId: 'documents:document',
        recordId: documentId,
        tenantId: tenantId,
        organizationId: orgId,
        fileName: safeName,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        partitionCode: partitionCode,
        storageDriver: 'local',
        storagePath: stored.storagePath,
        url: buildAttachmentFileUrl(attachmentId),
        storageMetadata: {
          originalName: file.name,
        },
      })

      // Persist both entities (transaction will auto-commit on success)
      await em.persist([document, attachment])

      return { document, attachment }
    })

    const { document, attachment } = result

    // Track document creation
    logger.info(`Document created: ${document.name}`, {
      event: 'documents.document.created',
      documentId: document.id,
      category: document.category,
      filename: document.name,
      fileSize: attachment.fileSize,
      tenantId: document.tenantId,
      organizationId: document.organizationId,
    })

    documentCounter.add(1, {
      category: document.category,
      tenantId: document.tenantId ?? 'unknown',
      organizationId: document.organizationId ?? 'unknown',
    })

    // Extract and store page images for PDF files
    let pageCount = 0
    const isPdf = (file.type === 'application/pdf') || safeName.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      try {
        const pageImageService = container.resolve<PageImageService>('documentPageImageService')
        const pageResults = await pageImageService.extractAndStorePdfPages(
          fileBuffer,
          document.id,
          orgId,
          tenantId
        )

        if (pageResults.length > 0) {
          const pageEm = em.fork()
          for (const pageResult of pageResults) {
            pageEm.persist(pageEm.create(DocumentPage, {
              organizationId: orgId,
              tenantId: tenantId,
              document: document.id,
              pageNumber: pageResult.pageNumber,
              storagePath: pageResult.storagePath,
              storageDriver: pageImageService.getDriverId(),
              width: pageResult.width ?? null,
              height: pageResult.height ?? null,
              fileSize: pageResult.fileSize ?? null,
            }))
          }
          await pageEm.flush()
          pageCount = pageResults.length
        }
      } catch (pageErr) {
        console.error('[documents] Page extraction failed:', pageErr)
      }
    }

    // Auto-enqueue extraction if requested
    let processingStatus: string = 'pending'
    if (enableExtraction) {
      try {
        const extractEm = em.fork()
        const doc = await extractEm.findOneOrFail(Document, { id: document.id })
        doc.processingStatus = 'queued'
        await extractEm.flush()

        const { createQueue } = await import('@open-mercato/queue')
        const strategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
        const queue = createQueue<ExtractPayload>(EXTRACT_QUEUE_NAME, strategy)
        await queue.enqueue({
          documentId: document.id,
          tenantId: tenantId,
          organizationId: orgId,
        })
        processingStatus = 'queued'

        logger.info('documents.document.extraction.queued_on_upload', {
          documentId: document.id,
          tenantId,
          organizationId: orgId,
        })
      } catch (enqueueErr) {
        logger.warn('documents.document.extraction.enqueue_on_upload_failed', {
          documentId: document.id,
          error: enqueueErr instanceof Error ? enqueueErr.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: document.id,
        name: document.name,
        category: document.category,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        attachmentId: attachment.id,
        url: attachment.url,
        createdAt: document.createdAt,
        pageCount,
        processingStatus,
      },
    })
  } catch (error: any) {
    console.error('[documents] upload error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

const uploadBodySchema = uploadDocumentSchema.extend({
  file: z.string().min(1).describe('Binary file payload; supplied as multipart form-data'),
})

const uploadResponseSchema = z.object({
  ok: z.literal(true),
  item: z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    fileName: z.string(),
    fileSize: z.number().int().nonnegative(),
    attachmentId: z.string(),
    url: z.string(),
    createdAt: z.string(),
    pageCount: z.number().int().nonnegative(),
  }),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  summary: 'Upload document',
  description: 'Upload a new document using multipart form-data.',
  methods: {
    POST: {
      summary: 'Upload document',
      description:
        'Upload a new document with metadata. The file is stored as an attachment and PDF pages are extracted automatically.',
      tags: ['Documents'],
      requestBody: {
        contentType: 'multipart/form-data',
        schema: uploadBodySchema,
      },
      responses: [
        { status: 200, description: 'Document uploaded successfully', schema: uploadResponseSchema },
      ],
      errors: [
        { status: 400, description: 'No file provided or validation error', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
