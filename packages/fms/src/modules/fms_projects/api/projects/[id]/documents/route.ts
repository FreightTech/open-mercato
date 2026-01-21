/**
 * FMS Projects - Nested Documents API
 * Manage documents attached to a specific project
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject } from '../../../../data/entities'
import { FmsDocument, DocumentCategory } from '../../../../../fms_documents/data/entities'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import { randomUUID } from 'crypto'
import { z } from 'zod'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_projects.projects.view', 'fms_documents.view'],
  },
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_projects.projects.manage', 'fms_documents.upload'],
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

const RELATED_ENTITY_TYPE = 'fms_projects:fms_project'

/**
 * GET - List documents for a specific project
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
    const projectId = params.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify project exists and user has access
    const project = await em.findOne(FmsProject, {
      id: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as DocumentCategory | null
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

    // Build filters
    const filters: Record<string, any> = {
      relatedEntityId: projectId,
      relatedEntityType: RELATED_ENTITY_TYPE,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    }

    if (category) {
      filters.category = category
    }

    // Query documents
    const [documents, total] = await em.findAndCount(FmsDocument, filters, {
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })

    // Get attachment info for each document
    const attachmentIds = documents.map((d) => d.attachmentId)
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    const attachmentMap = new Map(attachments.map((a) => [a.id, a]))

    // Get invoice info for invoice documents
    const { FmsProjectInvoice } = await import('../../../../data/entities')
    const documentIds = documents.filter((d) => d.category === 'invoice').map((d) => d.id)
    const invoices = documentIds.length > 0
      ? await em.find(FmsProjectInvoice, {
          documentId: { $in: documentIds },
          organizationId: auth.orgId,
          tenantId: auth.tenantId,
          deletedAt: null,
        })
      : []
    const invoiceMap = new Map(invoices.map((i) => [i.documentId, i]))

    // Transform response
    const items = documents.map((doc) => {
      const attachment = attachmentMap.get(doc.attachmentId)
      const invoice = invoiceMap.get(doc.id)

      return {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        description: doc.description,
        createdAt: doc.createdAt,
        processedAt: doc.processedAt,
        attachment: attachment
          ? {
              id: attachment.id,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              url: attachment.url,
            }
          : null,
        invoice: invoice
          ? {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              sellerName: invoice.sellerName,
              grossAmount: invoice.grossAmount,
              confidence: invoice.confidence,
              status: invoice.status,
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
  } catch (error: any) {
    console.error('[fms-projects:documents] list error:', error)
    return NextResponse.json(
      { error: 'Failed to list documents', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST - Upload a document to a specific project
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
    const projectId = params.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify project exists and user has access
    const project = await em.findOne(FmsProject, {
      id: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Parse form data
    const formData = await request.formData()
    const uploadedFile = formData.get('file') as File

    if (!uploadedFile) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate metadata
    const uploadSchema = z.object({
      name: z.string().min(1).max(255),
      category: z
        .enum(['offer', 'invoice', 'customs', 'bill_of_lading', 'other'])
        .default('other'),
      description: z.string().max(1000).optional().nullable(),
    })

    const metadata = uploadSchema.parse({
      name: formData.get('name') || uploadedFile.name,
      category: formData.get('category') || 'other',
      description: formData.get('description') || null,
    })

    const orgId = auth.orgId
    const tenantId = auth.tenantId
    const userId = auth.sub ?? auth.email ?? null

    // Store file
    const arrayBuffer = await uploadedFile.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)
    const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

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
      console.error('[fms-projects:documents] failed to persist file', error)
      return NextResponse.json({ error: 'Failed to persist attachment' }, { status: 500 })
    }

    // Wrap database operations in a transaction
    const result = await em.transactional(async (txEm) => {
      // Get or create fmsDocuments partition
      let partition = await txEm.findOne(AttachmentPartition, { code: partitionCode })

      if (!partition) {
        partition = txEm.create(AttachmentPartition, {
          code: partitionCode,
          title: 'FMS Documents',
          description: 'Documents for freight management (offers, invoices, customs, BOL)',
          storageDriver: 'local',
          isPublic: false,
          requiresOcr: false,
        })
        await txEm.persist(partition)
      }

      // Generate IDs
      const documentId = randomUUID()
      const attachmentId = randomUUID()

      // Create FmsDocument record with auto-linked entity
      const document = txEm.create(FmsDocument, {
        id: documentId,
        organizationId: orgId,
        tenantId: tenantId,
        name: metadata.name,
        category: metadata.category as DocumentCategory,
        description: metadata.description || null,
        attachmentId: attachmentId,
        relatedEntityId: projectId,
        relatedEntityType: RELATED_ENTITY_TYPE,
        createdBy: userId,
        updatedBy: userId,
      })

      // Create attachment record
      const attachment = txEm.create(Attachment, {
        id: attachmentId,
        entityId: 'fms_documents:fms_document',
        recordId: documentId,
        tenantId: tenantId,
        organizationId: orgId,
        fileName: safeName,
        mimeType: uploadedFile.type || 'application/octet-stream',
        fileSize: uploadedFile.size,
        partitionCode: partition.code,
        storageDriver: partition.storageDriver || 'local',
        storagePath: stored.storagePath,
        url: buildAttachmentFileUrl(attachmentId),
        storageMetadata: {
          originalName: uploadedFile.name,
        },
      })

      await txEm.persist([document, attachment])

      return { document, attachment }
    })

    const { document, attachment } = result

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
  } catch (error: any) {
    console.error('[fms-projects:documents] upload error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Upload failed', message: error.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
