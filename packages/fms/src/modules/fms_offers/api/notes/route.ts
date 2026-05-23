/**
 * FMS Notes API — CRUD for activity comments on RFQ and Offer entities.
 * Supports JSON or multipart/form-data (with file attachment).
 */

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createMentionNotifications } from '../../../../lib/activity/mention-notifications'
import { FmsNote } from '../../data/entities'
import { fmsNoteCreateSchema, fmsNoteUpdateSchema } from '../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_offers.edit'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_offers.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_offers.edit'] },
}

export const metadata = routeMetadata

export const openApi = {
  GET: {
    summary: 'List notes for an entity',
    tags: ['fms_offers'],
    parameters: [
      { name: 'relatedEntityType', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'relatedEntityId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'List of notes' } },
  },
  POST: {
    summary: 'Create a note',
    tags: ['fms_offers'],
    responses: { 201: { description: 'Note created' } },
  },
  PUT: {
    summary: 'Update a note',
    tags: ['fms_offers'],
    responses: { 200: { description: 'Note updated' } },
  },
  DELETE: {
    summary: 'Delete a note',
    tags: ['fms_offers'],
    responses: { 200: { description: 'Note deleted' } },
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

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const relatedEntityType = url.searchParams.get('relatedEntityType')
  const relatedEntityId = url.searchParams.get('relatedEntityId')
  if (!relatedEntityType || !relatedEntityId) {
    return NextResponse.json({ error: 'relatedEntityType and relatedEntityId query params required' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const notes = await em.find(FmsNote, {
    relatedEntityType,
    relatedEntityId,
    deletedAt: null,
    ...scopeFilters,
  }, { orderBy: { createdAt: 'DESC' } })

  const attachmentIds = notes
    .map((n) => n.attachmentId)
    .filter((id): id is string => typeof id === 'string')

  let attachmentMap = new Map<string, { id: string; fileName: string; fileSize: number; mimeType: string; url: string }>()
  if (attachmentIds.length > 0) {
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    attachmentMap = new Map(
      attachments.map((a) => [a.id, { id: a.id, fileName: a.fileName, fileSize: a.fileSize, mimeType: a.mimeType, url: a.url }])
    )
  }

  return NextResponse.json({
    items: notes.map((note) => ({
      id: note.id,
      relatedEntityType: note.relatedEntityType,
      relatedEntityId: note.relatedEntityId,
      body: note.body,
      authorUserId: note.authorUserId,
      authorName: note.authorName,
      attachmentId: note.attachmentId ?? null,
      attachment: note.attachmentId ? attachmentMap.get(note.attachmentId) ?? null : null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })),
    total: notes.length,
  })
}

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
  let noteBody: string
  let relatedEntityType: string
  let relatedEntityId: string
  let mentionedUserIds: string[] = []
  let uploadedFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    noteBody = (formData.get('body') as string) || ''
    relatedEntityType = (formData.get('relatedEntityType') as string) || ''
    relatedEntityId = (formData.get('relatedEntityId') as string) || ''
    const fileField = formData.get('file')
    if (fileField instanceof File && fileField.size > 0) {
      uploadedFile = fileField
    }
    const mentionedRaw = formData.get('mentionedUserIds')
    if (typeof mentionedRaw === 'string') {
      try {
        const parsed = JSON.parse(mentionedRaw)
        if (Array.isArray(parsed)) mentionedUserIds = parsed.filter((id): id is string => typeof id === 'string')
      } catch { /* ignore parse errors */ }
    }
  } else {
    const jsonBody = await req.json()
    const parseResult = fmsNoteCreateSchema.safeParse(jsonBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
    }
    noteBody = parseResult.data.body
    relatedEntityType = parseResult.data.relatedEntityType
    relatedEntityId = parseResult.data.relatedEntityId
    mentionedUserIds = parseResult.data.mentionedUserIds ?? []
  }

  if (!relatedEntityType || !relatedEntityId) {
    return NextResponse.json({ error: 'relatedEntityType and relatedEntityId are required' }, { status: 400 })
  }

  if (!noteBody.trim() && !uploadedFile) {
    return NextResponse.json({ error: 'Note body or file is required' }, { status: 400 })
  }

  let attachmentId: string | null = null
  let attachmentInfo: { id: string; fileName: string; fileSize: number; mimeType: string; url: string } | null = null

  if (uploadedFile) {
    try {
      const arrayBuffer = await uploadedFile.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)
      const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

      const partitionCode = 'fmsNotes'
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
            title: 'FMS Notes',
            description: 'File attachments for FMS activity notes',
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
        entityId: 'fms_offers:fms_note',
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
      console.error('[fms_offers:notes] failed to upload attachment', error)
      return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
    }
  }

  const now = new Date()
  const note = em.create(FmsNote, {
    organizationId: selectedOrgId,
    tenantId,
    relatedEntityType,
    relatedEntityId,
    body: noteBody.trim() || '(file attachment)',
    authorUserId: auth.userId || auth.sub || null,
    authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || null,
    attachmentId: attachmentId || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(note)
  await em.flush()

  // Create mention notifications
  if (mentionedUserIds.length > 0) {
    const linkPath = relatedEntityType === 'fms_rfq'
      ? `/backend/tasks-board?rfqId=${relatedEntityId}`
      : '/backend/fms-offers'
    await createMentionNotifications({
      mentionedUserIds,
      actorUserId: auth.userId || auth.sub || null,
      authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || 'Someone',
      sourceEntityType: relatedEntityType,
      sourceEntityId: relatedEntityId,
      linkHref: linkPath,
      tenantId,
      organizationId: selectedOrgId,
      container,
    })
  }

  return NextResponse.json({
    id: note.id,
    relatedEntityType: note.relatedEntityType,
    relatedEntityId: note.relatedEntityId,
    body: note.body,
    authorUserId: note.authorUserId,
    authorName: note.authorName,
    attachmentId: note.attachmentId ?? null,
    attachment: attachmentInfo,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }, { status: 201 })
}

export async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = fmsNoteUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  const scopeFilters = buildScopeFilters(auth, scope)

  const note = await em.findOne(FmsNote, {
    id: data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  if (data.body !== undefined) note.body = data.body
  note.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: note.id,
    body: note.body,
    authorUserId: note.authorUserId,
    authorName: note.authorName,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  })
}

export async function DELETE(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const url = new URL(req.url)
  const noteId = url.searchParams.get('id')
  if (!noteId) {
    return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const note = await em.findOne(FmsNote, {
    id: noteId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  note.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
