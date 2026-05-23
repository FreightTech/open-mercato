/**
 * Contractors Module - Comments API
 * CRUD for contractor activity timeline comments (supports multipart upload)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createMentionNotifications } from '../../../../lib/activity/mention-notifications'
import { ContractorComment } from '../../data/entities'
import { contractorCommentCreateSchema, contractorCommentUpdateSchema } from '../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  POST: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  PUT: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['contractors.edit'] },
}

export const metadata = routeMetadata

export const openApi = {
  GET: {
    summary: 'List contractor comments',
    tags: ['contractors'],
    parameters: [
      { name: 'contractorId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'List of comments' } },
  },
  POST: {
    summary: 'Create contractor comment',
    tags: ['contractors'],
    responses: { 201: { description: 'Comment created' } },
  },
  PUT: {
    summary: 'Update contractor comment',
    tags: ['contractors'],
    responses: { 200: { description: 'Comment updated' } },
  },
  DELETE: {
    summary: 'Delete contractor comment',
    tags: ['contractors'],
    responses: { 200: { description: 'Comment deleted' } },
  },
}

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}
  if (typeof auth.tenantId === 'string') filters.tenantId = auth.tenantId

  const orgIdsSet = new Set<string>()
  const filterIds = scope?.filterIds
  const allowedIds = scope?.allowedIds
  const fallbackOrgId = scope?.selectedId ?? auth.orgId ?? null

  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => { if (typeof id === 'string') orgIdsSet.add(id) })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => { if (typeof id === 'string') orgIdsSet.add(id) })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) filters.organizationId = { $in: [...orgIdsSet] }
  return filters
}

/**
 * GET - List comments for a contractor
 */
export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const contractorId = url.searchParams.get('contractorId')
  if (!contractorId) {
    return NextResponse.json({ error: 'contractorId query param required' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const comments = await em.find(ContractorComment, {
    contractor: contractorId,
    deletedAt: null,
    ...scopeFilters,
  }, { orderBy: { createdAt: 'DESC' } })

  // Load attachment info
  const attachmentIds = comments
    .map((c) => c.attachmentId)
    .filter((id): id is string => typeof id === 'string')

  let attachmentMap = new Map<string, { id: string; fileName: string; fileSize: number; mimeType: string; url: string }>()
  if (attachmentIds.length > 0) {
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    attachmentMap = new Map(
      attachments.map((a) => [a.id, { id: a.id, fileName: a.fileName, fileSize: a.fileSize, mimeType: a.mimeType, url: a.url }])
    )
  }

  return NextResponse.json({
    items: comments.map((comment) => ({
      id: comment.id,
      contractorId: (comment.contractor as any)?.id || contractorId,
      body: comment.body,
      authorUserId: comment.authorUserId,
      authorName: comment.authorName,
      attachmentId: comment.attachmentId ?? null,
      attachment: comment.attachmentId ? attachmentMap.get(comment.attachmentId) ?? null : null,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
    total: comments.length,
  })
}

/**
 * POST - Create a contractor comment (supports JSON or multipart/form-data)
 */
export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let commentBody: string
  let contractorId: string
  let mentionedUserIds: string[] = []
  let uploadedFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    commentBody = (formData.get('body') as string) || ''
    contractorId = (formData.get('contractorId') as string) || ''
    const fileField = formData.get('file')
    if (fileField instanceof File && fileField.size > 0) {
      uploadedFile = fileField
    }
    const mentionedRaw = formData.get('mentionedUserIds')
    if (typeof mentionedRaw === 'string') {
      try {
        const parsed = JSON.parse(mentionedRaw)
        if (Array.isArray(parsed)) mentionedUserIds = parsed.filter((id): id is string => typeof id === 'string')
      } catch { /* ignore */ }
    }
  } else {
    const jsonBody = await req.json()
    contractorId = jsonBody.contractorId || ''
    const parseResult = contractorCommentCreateSchema.safeParse(jsonBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
    }
    commentBody = parseResult.data.body
    mentionedUserIds = jsonBody.mentionedUserIds ?? []
  }

  if (!contractorId) {
    return NextResponse.json({ error: 'contractorId is required' }, { status: 400 })
  }

  if (!commentBody.trim() && !uploadedFile) {
    return NextResponse.json({ error: 'Comment body or file is required' }, { status: 400 })
  }

  let attachmentId: string | null = null
  let attachmentInfo: { id: string; fileName: string; fileSize: number; mimeType: string; url: string } | null = null

  if (uploadedFile) {
    try {
      const arrayBuffer = await uploadedFile.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)
      const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

      const partitionCode = 'contractorComments'
      const stored = await storePartitionFile({
        partitionCode,
        orgId: selectedOrgId,
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
            title: 'Contractor Comments',
            description: 'File attachments for contractor activity comments',
            storageDriver: 'local',
            isPublic: false,
            requiresOcr: false,
          })
          await partitionEm.flush()
        }
      } catch {
        // Partition created concurrently
      }

      attachmentId = randomUUID()
      const forkedEm = em.fork({ clear: true })
      const attachment = forkedEm.create(Attachment, {
        id: attachmentId,
        entityId: 'contractors:contractor_comment',
        recordId: attachmentId,
        tenantId,
        organizationId: selectedOrgId,
        fileName: safeName,
        mimeType: uploadedFile.type || 'application/octet-stream',
        fileSize: uploadedFile.size,
        partitionCode,
        storageDriver: 'local',
        storagePath: stored.storagePath,
        url: buildAttachmentFileUrl(attachmentId),
        storageMetadata: { originalName: uploadedFile.name },
      })
      await forkedEm.persist(attachment).flush()

      attachmentInfo = {
        id: attachmentId,
        fileName: safeName,
        fileSize: uploadedFile.size,
        mimeType: uploadedFile.type || 'application/octet-stream',
        url: attachment.url,
      }
    } catch (error) {
      console.error('[contractors:comments] failed to upload attachment', error)
      return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
    }
  }

  const now = new Date()
  const comment = em.create(ContractorComment, {
    organizationId: selectedOrgId,
    tenantId,
    contractor: contractorId as any,
    body: commentBody.trim() || '(file attachment)',
    authorUserId: auth.userId || auth.sub || null,
    authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || null,
    attachmentId: attachmentId || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(comment)
  await em.flush()

  if (mentionedUserIds.length > 0) {
    await createMentionNotifications({
      mentionedUserIds,
      actorUserId: auth.userId || auth.sub || null,
      authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || 'Someone',
      sourceEntityType: 'contractor',
      sourceEntityId: contractorId,
      linkHref: `/backend/contractors/${contractorId}`,
      tenantId,
      organizationId: selectedOrgId,
      container,
    })
  }

  return NextResponse.json({
    id: comment.id,
    contractorId,
    body: comment.body,
    authorUserId: comment.authorUserId,
    authorName: comment.authorName,
    attachmentId: comment.attachmentId ?? null,
    attachment: attachmentInfo,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }, { status: 201 })
}

/**
 * PUT - Update a contractor comment
 */
export async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = contractorCommentUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  const scopeFilters = buildScopeFilters(auth, scope)

  const comment = await em.findOne(ContractorComment, {
    id: data.id,
    deletedAt: null,
    ...scopeFilters,
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

/**
 * DELETE - Soft delete a contractor comment
 */
export async function DELETE(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const url = new URL(req.url)
  const commentId = url.searchParams.get('id')
  if (!commentId) {
    return NextResponse.json({ error: 'Comment ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const comment = await em.findOne(ContractorComment, {
    id: commentId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  comment.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
