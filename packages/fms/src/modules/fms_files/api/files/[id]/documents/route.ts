/**
 * FMS Files - Nested Documents API
 * GET  /api/fms_files/files/:id/documents — list documents linked to this file
 * POST /api/fms_files/files/:id/documents — upload a document linked to this file
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile } from '../../../../data/entities'
import { FmsDocument, DocumentCategory } from '../../../../../fms_documents/data/entities'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { documentCategorySchema } from '../../../../../fms_documents/data/validators'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_files.files.view'],
  },
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_files.files.manage'],
  },
}

export const openApi = {
  GET: {
    summary: 'List documents for a file',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'Document list' }, 401: { description: 'Unauthorized' } },
  },
  POST: {
    summary: 'Upload a document to a file',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'Uploaded document' }, 401: { description: 'Unauthorized' } },
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

const RELATED_ENTITY_TYPE = 'fms_files:fms_file'
const PARTITION_CODE = 'fmsDocuments'

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  category: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? 'other' : val),
      documentCategorySchema
    )
    .default('other'),
  description: z.string().max(1000).optional().nullable(),
})

/**
 * GET - List documents for a specific file
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
    const fileId = params.id
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 })
    }

    const file = await em.findOne(FmsFile, {
      id: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as DocumentCategory | null
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

    const filters: Record<string, unknown> = {
      relatedEntityId: fileId,
      relatedEntityType: RELATED_ENTITY_TYPE,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    }

    if (category) {
      filters.category = category
    }

    const [documents, total] = await em.findAndCount(FmsDocument, filters, {
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })

    const attachmentIds = documents.map((d) => d.attachmentId)
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    const attachmentMap = new Map(attachments.map((a) => [a.id, a]))

    const items = documents.map((doc) => {
      const attachment = attachmentMap.get(doc.attachmentId)
      return {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        description: doc.description,
        processingStatus: doc.processingStatus,
        createdAt: doc.createdAt,
        processedAt: doc.processedAt,
        extractedData: doc.extractedData,
        consensusConfidence: doc.consensusConfidence,
        attachment: attachment
          ? {
              id: attachment.id,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              url: attachment.url,
            }
          : null,
      }
    })

    return NextResponse.json({
      ok: true,
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fms-files:documents] list error:', error)
    return NextResponse.json(
      { error: 'Failed to list documents', message },
      { status: 500 }
    )
  }
}

/**
 * POST - Upload a document linked to a specific file
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const fileId = params.id
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 })
    }

    const file = await em.findOne(FmsFile, {
      id: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const uploadedFile = formData.get('file') as File

    if (!uploadedFile) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const parsed = uploadSchema.parse({
      name: formData.get('name') || uploadedFile.name,
      category: formData.get('category') || 'other',
      description: formData.get('description') || null,
    })

    const orgId = auth.orgId
    const tenantId = auth.tenantId
    const userId = auth.sub ?? auth.email ?? null

    const arrayBuffer = await uploadedFile.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)
    const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

    let stored
    try {
      stored = await storePartitionFile({
        partitionCode: PARTITION_CODE,
        orgId,
        tenantId,
        fileName: safeName,
        buffer: fileBuffer,
      })
    } catch (error) {
      console.error('[fms-files:documents] failed to persist file', error)
      return NextResponse.json({ error: 'Failed to persist attachment' }, { status: 500 })
    }

    // Ensure partition exists (idempotent, outside transaction)
    const partitionEm = em.fork()
    try {
      const existing = await partitionEm.findOne(AttachmentPartition, { code: PARTITION_CODE })
      if (!existing) {
        partitionEm.create(AttachmentPartition, {
          code: PARTITION_CODE,
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

    const forkedEm = em.fork({ clear: true })

    const documentId = randomUUID()
    const attachmentId = randomUUID()

    const document = forkedEm.create(FmsDocument, {
      id: documentId,
      organizationId: orgId,
      tenantId,
      name: parsed.name,
      category: parsed.category as DocumentCategory,
      description: parsed.description || null,
      attachmentId,
      relatedEntityId: fileId,
      relatedEntityType: RELATED_ENTITY_TYPE,
      createdBy: userId,
      updatedBy: userId,
    })

    const attachment = forkedEm.create(Attachment, {
      id: attachmentId,
      entityId: 'fms_documents:fms_document',
      recordId: documentId,
      tenantId,
      organizationId: orgId,
      fileName: safeName,
      mimeType: uploadedFile.type || 'application/octet-stream',
      fileSize: uploadedFile.size,
      partitionCode: PARTITION_CODE,
      storageDriver: 'local',
      storagePath: stored.storagePath,
      url: buildAttachmentFileUrl(attachmentId),
      storageMetadata: {
        originalName: uploadedFile.name,
      },
    })

    await forkedEm.persistAndFlush([document, attachment])

    return NextResponse.json({
      ok: true,
      item: {
        id: document.id,
        name: document.name,
        category: document.category,
        description: document.description,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        attachmentId: attachment.id,
        url: attachment.url,
        relatedEntityId: document.relatedEntityId,
        relatedEntityType: document.relatedEntityType,
        createdAt: document.createdAt,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fms-files:documents] upload error:', error)

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: (error as any).errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Upload failed', message },
      { status: 500 }
    )
  }
}
