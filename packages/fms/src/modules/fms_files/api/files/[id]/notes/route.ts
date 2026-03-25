/**
 * FMS Files - File Notes API
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
import { FmsFile, FmsFileNote } from '../../../../data/entities'
import { fmsFileNoteCreateSchema, fmsFileNoteUpdateSchema } from '../../../../data/validators'
import { buildScopeFilters } from '../../../../lib/scope-filters'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
}

export const openApi = {
  GET: { summary: 'List file notes', tags: ['fms_files'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Notes list' } } },
  POST: { summary: 'Create file note', tags: ['fms_files'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Created' } } },
  PUT: { summary: 'Update file note', tags: ['fms_files'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
  DELETE: { summary: 'Delete file note', tags: ['fms_files'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } },
}

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })

  const fileId = paramsResult.data.id
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const notes = await em.find(FmsFileNote, { file: fileId, deletedAt: null, ...scopeFilters }, { orderBy: { createdAt: 'DESC' } })

  const attachmentIds = notes.map((n) => n.attachmentId).filter((id): id is string => typeof id === 'string')
  let attachmentMap = new Map<string, { id: string; fileName: string; fileSize: number; mimeType: string; url: string }>()
  if (attachmentIds.length > 0) {
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    attachmentMap = new Map(attachments.map((a) => [a.id, { id: a.id, fileName: a.fileName, fileSize: a.fileSize, mimeType: a.mimeType, url: a.url }]))
  }

  return NextResponse.json({
    items: notes.map((note) => ({
      id: note.id,
      fileId,
      body: note.body,
      authorUserId: note.authorUserId,
      authorName: note.authorName,
      attachmentId: note.attachmentId ?? null,
      attachment: note.attachmentId ? (attachmentMap.get(note.attachmentId) ?? null) : null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })),
    total: notes.length,
  })
}

export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })

  const fileId = paramsResult.data.id
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)
  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })

  const file = await em.findOne(FmsFile, { id: fileId, deletedAt: null, ...scopeFilters })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const contentType = req.headers.get('content-type') ?? ''
  let noteBody: string
  let uploadedFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    noteBody = (formData.get('body') as string) || ''
    const fileField = formData.get('file')
    if (fileField instanceof File && fileField.size > 0) uploadedFile = fileField
  } else {
    const jsonBody = await req.json()
    const parseResult = fmsFileNoteCreateSchema.safeParse(jsonBody)
    if (!parseResult.success) return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
    noteBody = parseResult.data.body
  }

  if (!noteBody.trim() && !uploadedFile) return NextResponse.json({ error: 'Comment body or file is required' }, { status: 400 })

  let attachmentId: string | null = null
  let attachmentInfo: { id: string; fileName: string; fileSize: number; mimeType: string; url: string } | null = null

  if (uploadedFile) {
    try {
      const arrayBuffer = await uploadedFile.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)
      const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
      const partitionCode = 'fmsFileNotes'

      const stored = await storePartitionFile({ partitionCode, orgId: selectedOrgId, tenantId, fileName: safeName, buffer: fileBuffer })

      const partitionEm = em.fork()
      try {
        const existing = await partitionEm.findOne(AttachmentPartition, { code: partitionCode })
        if (!existing) {
          partitionEm.create(AttachmentPartition, { code: partitionCode, title: 'FMS File Notes', description: 'File attachments for file note comments', storageDriver: 'local', isPublic: false, requiresOcr: false })
          await partitionEm.flush()
        }
      } catch { /* concurrency race — safe to ignore */ }

      attachmentId = randomUUID()
      const forkedEm = em.fork({ clear: true })
      const attachment = forkedEm.create(Attachment, {
        id: attachmentId,
        entityId: 'fms_files:fms_file_note',
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
      await forkedEm.persistAndFlush(attachment)
      attachmentInfo = { id: attachmentId, fileName: safeName, fileSize: uploadedFile.size, mimeType: uploadedFile.type || 'application/octet-stream', url: attachment.url }
    } catch (error) {
      console.error('[fms-files:notes] failed to upload attachment', error)
      return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
    }
  }

  const now = new Date()
  const note = em.create(FmsFileNote, {
    organizationId: selectedOrgId,
    tenantId,
    file: fileId as any,
    body: noteBody.trim() || '(file attachment)',
    authorUserId: auth.userId || auth.sub || null,
    authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || null,
    attachmentId: attachmentId || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(note)
  await em.flush()

  return NextResponse.json({ id: note.id, fileId, body: note.body, authorUserId: note.authorUserId, authorName: note.authorName, attachmentId: note.attachmentId ?? null, attachment: attachmentInfo, createdAt: note.createdAt, updatedAt: note.updatedAt }, { status: 201 })
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const body = await req.json()
  const parseResult = fmsFileNoteUpdateSchema.safeParse(body)
  if (!parseResult.success) return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })

  const data = parseResult.data
  const note = await em.findOne(FmsFileNote, { id: data.id, deletedAt: null, ...scopeFilters })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  if (data.body !== undefined) note.body = data.body
  note.updatedAt = new Date()
  await em.flush()

  return NextResponse.json({ id: note.id, body: note.body, authorUserId: note.authorUserId, authorName: note.authorName, createdAt: note.createdAt, updatedAt: note.updatedAt })
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const url = new URL(req.url)
  const noteId = url.searchParams.get('id')
  if (!noteId) return NextResponse.json({ error: 'Note ID required' }, { status: 400 })

  const note = await em.findOne(FmsFileNote, { id: noteId, deletedAt: null, ...scopeFilters })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  note.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
