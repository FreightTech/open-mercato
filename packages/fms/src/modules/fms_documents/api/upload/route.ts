import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, FmsDocumentPage, DocumentCategory } from '../../data/entities'
import { uploadDocumentSchema } from '../../data/validators'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { randomUUID } from 'crypto'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PageImageService } from '../../services/page-image.service'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_documents.upload'],
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

    const partitionCode = 'fmsDocuments'
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
      console.error('[fms-documents] failed to persist file', error)
      return NextResponse.json({ error: 'Failed to persist attachment' }, { status: 500 })
    }

    // Ensure partition exists (idempotent, outside transaction to avoid duplicate key errors)
    const partitionEm = em.fork()
    try {
      const existing = await partitionEm.findOne(AttachmentPartition, { code: partitionCode })
      if (!existing) {
        partitionEm.create(AttachmentPartition, {
          code: partitionCode,
          title: 'FMS Documents',
          description: 'Documents for freight management (offers, invoices, customs, BOL)',
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

      // Create FmsDocument record
      const document = em.create(FmsDocument, {
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
        entityId: 'fms_documents:fms_document',
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

    // Extract and store page images for PDF files
    let pageCount = 0
    const isPdf = (file.type === 'application/pdf') || safeName.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      try {
        const pageImageService = container.resolve<PageImageService>('fmsDocumentPageImageService')
        const pageResults = await pageImageService.extractAndStorePdfPages(
          fileBuffer,
          document.id,
          orgId,
          tenantId
        )

        if (pageResults.length > 0) {
          const pageEm = em.fork()
          for (const pageResult of pageResults) {
            pageEm.persist(pageEm.create(FmsDocumentPage, {
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
        console.error('[fms_documents] Page extraction failed:', pageErr)
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
      },
    })
  } catch (error: any) {
    console.error('[fms-documents] upload error:', error)

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
  summary: 'Upload FMS document',
  description: 'Upload a new FMS document using multipart form-data.',
  methods: {
    POST: {
      summary: 'Upload document',
      description:
        'Upload a new FMS document with metadata. The file is stored as an attachment and PDF pages are extracted automatically.',
      tags: ['FMS Documents'],
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
