/**
 * FMS Projects Module - Project Notes API
 * Manage notes for a project (supports multipart upload for file attachments)
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
import { FmsProjectNote } from '../../../../data/entities'
import { fmsProjectNoteCreateSchema, fmsProjectNoteUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.edit'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.edit'] },
}

export const metadata = routeMetadata

const paramsSchema = z.object({
  id: z.string().uuid(),
})

// Helper to build scope-aware filters
function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const orgIdsSet = new Set<string>()
  const filterIds = scope?.filterIds
  const allowedIds = scope?.allowedIds
  const fallbackOrgId = scope?.selectedId ?? auth.orgId ?? null

  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) {
    filters.organizationId = { $in: [...orgIdsSet] }
  }

  return filters
}

/**
 * GET - List notes for a specific project
 */
export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const projectId = paramsResult.data.id

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Find notes for this specific project
  const notes = await em.find(FmsProjectNote, {
    project: projectId,
    deletedAt: null,
    ...scopeFilters,
  }, { orderBy: { createdAt: 'DESC' } })

  // Load attachment info for notes that have attachmentId
  const attachmentIds = notes
    .map((n) => n.attachmentId)
    .filter((id): id is string => typeof id === 'string')

  let attachmentMap = new Map<string, { id: string; fileName: string; fileSize: number; mimeType: string; url: string }>()
  if (attachmentIds.length > 0) {
    const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
    attachmentMap = new Map(
      attachments.map((a) => [
        a.id,
        {
          id: a.id,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          url: a.url,
        },
      ])
    )
  }

  return NextResponse.json({
    items: notes.map((note) => {
      const attachment = note.attachmentId ? attachmentMap.get(note.attachmentId) ?? null : null
      return {
        id: note.id,
        projectId: (note.project as any)?.id || projectId,
        body: note.body,
        authorUserId: note.authorUserId,
        authorName: note.authorName,
        attachmentId: note.attachmentId ?? null,
        attachment,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      }
    }),
    total: notes.length,
  })
}

/**
 * POST - Create a new note (supports JSON or multipart/form-data with file)
 */
export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const projectId = paramsResult.data.id

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  // Determine content type
  const contentType = req.headers.get('content-type') ?? ''
  let noteBody: string
  let uploadedFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    noteBody = (formData.get('body') as string) || ''
    const fileField = formData.get('file')
    if (fileField instanceof File && fileField.size > 0) {
      uploadedFile = fileField
    }
  } else {
    const jsonBody = await req.json()
    const parseResult = fmsProjectNoteCreateSchema.safeParse(jsonBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
    }
    noteBody = parseResult.data.body
  }

  if (!noteBody.trim() && !uploadedFile) {
    return NextResponse.json({ error: 'Comment body or file is required' }, { status: 400 })
  }

  let attachmentId: string | null = null
  let attachmentInfo: { id: string; fileName: string; fileSize: number; mimeType: string; url: string } | null = null

  // Handle file upload if present
  if (uploadedFile) {
    try {
      const arrayBuffer = await uploadedFile.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)
      const safeName = String(uploadedFile.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')

      const partitionCode = 'fmsProjectNotes'
      const stored = await storePartitionFile({
        partitionCode,
        orgId: selectedOrgId,
        tenantId,
        fileName: safeName,
        buffer: fileBuffer,
      })

      // Ensure partition exists
      const partitionEm = em.fork()
      try {
        const existing = await partitionEm.findOne(AttachmentPartition, { code: partitionCode })
        if (!existing) {
          partitionEm.create(AttachmentPartition, {
            code: partitionCode,
            title: 'FMS Project Notes',
            description: 'File attachments for project note comments',
            storageDriver: 'local',
            isPublic: false,
            requiresOcr: false,
          })
          await partitionEm.flush()
        }
      } catch {
        // Partition was created concurrently — safe to ignore
      }

      attachmentId = randomUUID()
      const forkedEm = em.fork({ clear: true })
      const attachment = forkedEm.create(Attachment, {
        id: attachmentId,
        entityId: 'fms_projects:fms_project_note',
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

      attachmentInfo = {
        id: attachmentId,
        fileName: safeName,
        fileSize: uploadedFile.size,
        mimeType: uploadedFile.type || 'application/octet-stream',
        url: attachment.url,
      }
    } catch (error) {
      console.error('[fms-projects:notes] failed to upload attachment', error)
      return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
    }
  }

  const now = new Date()
  const note = em.create(FmsProjectNote, {
    organizationId: selectedOrgId,
    tenantId,
    project: projectId as any,
    body: noteBody.trim() || '(file attachment)',
    authorUserId: auth.userId || null,
    authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || null,
    attachmentId: attachmentId || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(note)
  await em.flush()

  return NextResponse.json({
    id: note.id,
    projectId,
    body: note.body,
    authorUserId: note.authorUserId,
    authorName: note.authorName,
    attachmentId: note.attachmentId ?? null,
    attachment: attachmentInfo,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }, { status: 201 })
}

/**
 * PUT - Update a note
 */
export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = fmsProjectNoteUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  if (!data.id) {
    return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const note = await em.findOne(FmsProjectNote, {
    id: data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  // Update fields
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

/**
 * DELETE - Soft delete a note
 */
export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
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

  const note = await em.findOne(FmsProjectNote, {
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
