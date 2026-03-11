/**
 * Contractors Module - Comments API
 * CRUD for contractor activity comments (supports multipart file upload)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { ContractorComment } from '../../data/entities'
import { contractorCommentCreateSchema, contractorCommentUpdateSchema } from '../../data/validators'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  POST: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  PUT: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['contractors.edit'] },
}

export const metadata = routeMetadata

export const openApi = {
  get: {
    operationId: 'listContractorComments',
    summary: 'List contractor comments',
    tags: ['Contractors'],
    parameters: [
      { name: 'contractorId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'List of comments' } },
  },
  post: {
    operationId: 'createContractorComment',
    summary: 'Create contractor comment',
    tags: ['Contractors'],
    responses: { 201: { description: 'Comment created' } },
  },
  put: {
    operationId: 'updateContractorComment',
    summary: 'Update contractor comment',
    tags: ['Contractors'],
    responses: { 200: { description: 'Comment updated' } },
  },
  delete: {
    operationId: 'deleteContractorComment',
    summary: 'Delete contractor comment',
    tags: ['Contractors'],
    responses: { 200: { description: 'Comment deleted' } },
  },
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const contractorId = url.searchParams.get('contractorId')
  if (!contractorId) {
    return NextResponse.json({ error: 'contractorId is required' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const orgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!orgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const comments = await em.find(ContractorComment, {
    contractor: contractorId,
    organizationId: orgId,
    tenantId,
    deletedAt: null,
  }, { orderBy: { createdAt: 'DESC' }, limit: 200 })

  const attachmentIds = comments
    .filter((c) => c.attachmentId)
    .map((c) => c.attachmentId as string)
  let attachmentMap = new Map<string, Attachment>()
  if (attachmentIds.length > 0) {
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    attachmentMap = new Map(attachments.map((a) => [a.id, a]))
  }

  return NextResponse.json({
    items: comments.map((comment) => {
      const att = comment.attachmentId ? attachmentMap.get(comment.attachmentId) : null
      return {
        id: comment.id,
        contractorId,
        body: comment.body,
        authorUserId: comment.authorUserId,
        authorName: comment.authorName,
        attachmentId: comment.attachmentId ?? null,
        attachment: att ? {
          id: att.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          url: att.url,
        } : null,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      }
    }),
    total: comments.length,
  })
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const orgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!orgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const contentType = req.headers.get('content-type') || ''
  let bodyText: string
  let contractorId: string
  let uploadedFile: File | null = null
  let attachmentId: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    bodyText = (formData.get('body') as string) || ''
    contractorId = (formData.get('contractorId') as string) || ''
    const fileField = formData.get('file')
    if (fileField && fileField instanceof File && fileField.size > 0) {
      uploadedFile = fileField
    }
  } else {
    const json = await req.json()
    bodyText = json.body || ''
    contractorId = json.contractorId || ''
  }

  if (!contractorId) {
    return NextResponse.json({ error: 'contractorId is required' }, { status: 400 })
  }

  const parseResult = contractorCommentCreateSchema.safeParse({ body: bodyText })
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  if (uploadedFile) {
    const arrayBuffer = await uploadedFile.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)
    const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

    const partitionCode = 'contractorCommentAttachments'
    try {
      const stored = await storePartitionFile({
        partitionCode,
        orgId,
        tenantId,
        fileName: safeName,
        buffer: fileBuffer,
      })

      const partitionEm = em.fork()
      try {
        const existing = await partitionEm.findOne(AttachmentPartition, { code: partitionCode })
        if (!existing) {
          partitionEm.create(AttachmentPartition, {
            code: partitionCode,
            title: 'Contractor Comment Attachments',
            description: 'File attachments for contractor comments',
            storageDriver: 'local',
            isPublic: false,
            requiresOcr: false,
          })
          await partitionEm.flush()
        }
      } catch {
        // Partition was created concurrently
      }

      attachmentId = randomUUID()
      const forkedEm = em.fork({ clear: true })
      forkedEm.create(Attachment, {
        id: attachmentId,
        entityId: 'contractors:contractor_comment',
        recordId: attachmentId,
        tenantId,
        organizationId: orgId,
        fileName: safeName,
        mimeType: uploadedFile.type || 'application/octet-stream',
        fileSize: uploadedFile.size,
        partitionCode,
        storageDriver: 'local',
        storagePath: stored.storagePath,
        url: buildAttachmentFileUrl(attachmentId),
        storageMetadata: { originalName: uploadedFile.name },
      })
      await forkedEm.flush()
    } catch (error) {
      console.error('[contractors:comments] file upload failed', error)
    }
  }

  const now = new Date()
  const comment = em.create(ContractorComment, {
    organizationId: orgId,
    tenantId,
    contractor: contractorId as any,
    body: parseResult.data.body,
    authorUserId: auth.userId || null,
    authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || null,
    attachmentId: attachmentId || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(comment)
  await em.flush()

  return NextResponse.json({
    id: comment.id,
    contractorId,
    body: comment.body,
    authorUserId: comment.authorUserId,
    authorName: comment.authorName,
    attachmentId: comment.attachmentId ?? null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }, { status: 201 })
}

export async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const orgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!orgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const body = await req.json()
  const parseResult = contractorCommentUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data

  const comment = await em.findOne(ContractorComment, {
    id: data.id,
    organizationId: orgId,
    tenantId,
    deletedAt: null,
  })

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  if (data.body !== undefined) comment.body = data.body
  comment.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: comment.id,
    body: comment.body,
    authorUserId: comment.authorUserId,
    authorName: comment.authorName,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  })
}

export async function DELETE(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const orgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!orgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const url = new URL(req.url)
  const commentId = url.searchParams.get('id')
  if (!commentId) {
    return NextResponse.json({ error: 'Comment ID required' }, { status: 400 })
  }

  const comment = await em.findOne(ContractorComment, {
    id: commentId,
    organizationId: orgId,
    tenantId,
    deletedAt: null,
  })

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  comment.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
