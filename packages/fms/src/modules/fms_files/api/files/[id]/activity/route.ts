/**
 * FMS Files - Activity Aggregation API
 * Aggregates comments, documents, and field changes into a unified timeline
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import { CellAnnotation } from '@open-mercato/annotations/modules/annotations/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { FmsFile, FmsFileNote, FmsFileUnit, FmsFileLeg, FmsFileUnitLeg } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'
import type { ActivityEntry, ActivityFilter } from '../../../../../../lib/activity/types'
import { FILTER_TO_KINDS } from '../../../../../../lib/activity/types'
import { buildScopeFilters } from '../../../../lib/scope-filters'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
}

export const openApi = {
  GET: {
    summary: 'Get file activity timeline',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'filter', in: 'query', required: false, schema: { type: 'string', enum: ['all', 'comments', 'documents', 'changes'] } },
    ],
    responses: { 200: { description: 'Activity entries' }, 401: { description: 'Unauthorized' } },
  },
}

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })

  const fileId = paramsResult.data.id
  const url = new URL(req.url)
  const filter = (url.searchParams.get('filter') || 'all') as ActivityFilter
  const cursor = url.searchParams.get('cursor') || null
  const pageSize = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
  const allowedKinds = FILTER_TO_KINDS[filter] ?? null

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const file = await em.findOne(FmsFile, { id: fileId, deletedAt: null, ...scopeFilters })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Load child entity IDs for ActionLog and Annotation queries
  const [unitIds, legIds, unitLegIds, documentIds] = await Promise.all([
    em.find(FmsFileUnit, { file: fileId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsFileLeg, { file: fileId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsFileUnitLeg, { unit: { file: fileId }, deletedAt: null, ...(scopeFilters.tenantId ? { tenantId: scopeFilters.tenantId } : {}), ...(scopeFilters.organizationId ? { organizationId: scopeFilters.organizationId } : {}) }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsDocument, { relatedEntityId: fileId, relatedEntityType: 'fms_files:fms_file', deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
  ])

  const entries: ActivityEntry[] = []

  // --- Comments ---
  if (!allowedKinds || allowedKinds.includes('comment')) {
    const notes = await em.find(FmsFileNote, { file: fileId, deletedAt: null, ...scopeFilters }, { orderBy: { createdAt: 'DESC' } })

    const noteAttachmentIds = notes.map((n) => n.attachmentId).filter((id): id is string => typeof id === 'string')
    let noteAttachmentMap = new Map<string, Attachment>()
    if (noteAttachmentIds.length > 0) {
      const attachments = await em.find(Attachment, { id: { $in: noteAttachmentIds } })
      noteAttachmentMap = new Map(attachments.map((a) => [a.id, a]))
    }

    for (const note of notes) {
      const attachment = note.attachmentId ? noteAttachmentMap.get(note.attachmentId) : undefined
      entries.push({
        id: `comment:${note.id}`,
        kind: 'comment',
        occurredAt: note.createdAt.toISOString(),
        title: 'Comment',
        body: note.body,
        actor: { userId: note.authorUserId ?? null, name: note.authorName || 'Unknown' },
        attachment: attachment ? { id: attachment.id, filename: attachment.fileName, mimeType: attachment.mimeType, size: attachment.fileSize, url: attachment.url } : null,
      })
    }
  }

  // --- Documents ---
  if (!allowedKinds || allowedKinds.includes('document')) {
    const documents = await em.find(FmsDocument, { relatedEntityId: fileId, relatedEntityType: 'fms_files:fms_file', deletedAt: null, ...scopeFilters }, { orderBy: { createdAt: 'DESC' } })

    const docAttachmentIds = documents.map((d) => d.attachmentId)
    let docAttachmentMap = new Map<string, Attachment>()
    if (docAttachmentIds.length > 0) {
      const attachments = await em.find(Attachment, { id: { $in: docAttachmentIds } })
      docAttachmentMap = new Map(attachments.map((a) => [a.id, a]))
    }

    for (const doc of documents) {
      const attachment = docAttachmentMap.get(doc.attachmentId)
      entries.push({
        id: `document:${doc.id}`,
        kind: 'document',
        occurredAt: doc.createdAt.toISOString(),
        title: `${doc.category || 'Document'} uploaded`,
        body: doc.name,
        actor: { userId: doc.createdBy ?? null, name: 'System' },
        metadata: { fileName: attachment?.fileName ?? doc.name, fileSize: attachment?.fileSize ?? null, documentCategory: doc.category },
      })
    }
  }

  // --- Field Changes from ActionLog ---
  if (!allowedKinds || allowedKinds.includes('field_change')) {
    const orConditions: Array<Record<string, unknown>> = [
      { resourceKind: 'fms_files.file', resourceId: fileId },
    ]
    const childKindMap: Array<[string, string[]]> = [
      ['fms_files.file_unit', unitIds],
      ['fms_files.file_leg', legIds],
      ['fms_files.file_unit_leg', unitLegIds],
    ]
    for (const [kind, ids] of childKindMap) {
      if (ids.length > 0) orConditions.push({ resourceKind: kind, resourceId: { $in: ids } })
    }

    const actionLogs = await em.find(ActionLog, {
      $or: orConditions,
      executionState: 'done',
      deletedAt: null,
      ...(scopeFilters.tenantId ? { tenantId: scopeFilters.tenantId } : {}),
    }, { orderBy: { createdAt: 'DESC' }, limit: 200 })

    const logUserIds = new Set<string>()
    for (const log of actionLogs) { if (log.actorUserId) logUserIds.add(log.actorUserId) }

    let logUserMap = new Map<string, string>()
    if (logUserIds.size > 0) {
      const users = await em.find(User, { id: { $in: [...logUserIds] } })
      logUserMap = new Map(users.map((u) => [u.id, u.name || u.email || 'Unknown']))
    }

    for (const log of actionLogs) {
      const changesRecord = log.changesJson as Record<string, { from: unknown; to: unknown }> | null
      const changes = changesRecord
        ? Object.entries(changesRecord).map(([field, diff]) => ({ field, from: diff?.from ?? null, to: diff?.to ?? null }))
        : []

      if (changes.length === 0 && log.commandId?.includes('.update')) continue

      entries.push({
        id: `change:${log.id}`,
        kind: 'field_change',
        occurredAt: log.createdAt.toISOString(),
        title: log.actionLabel || 'Field change',
        body: null,
        actor: { userId: log.actorUserId ?? null, name: log.actorUserId ? (logUserMap.get(log.actorUserId) ?? 'Unknown') : 'System' },
        metadata: { changes, resourceKind: log.resourceKind, commandId: log.commandId },
      })
    }
  }

  // --- Annotations (cell comments) ---
  if (!allowedKinds || allowedKinds.includes('annotation')) {
    // Use the same org/tenant resolution as the annotations API to avoid $or + $in quirks
    const annotationOrgId = scope?.selectedId ?? auth.orgId ?? null
    const annotationTenantId = typeof auth.tenantId === 'string' ? auth.tenantId : null

    const annotationQueryGroups: Array<{ entityType: string; rowIds: string[] }> = [
      { entityType: 'fms_file', rowIds: [fileId] },
    ]
    if (unitIds.length > 0) annotationQueryGroups.push({ entityType: 'fms_file_unit', rowIds: unitIds })
    if (legIds.length > 0) annotationQueryGroups.push({ entityType: 'fms_file_leg', rowIds: legIds })
    if (unitLegIds.length > 0) annotationQueryGroups.push({ entityType: 'fms_file_unit_leg', rowIds: unitLegIds })
    if (documentIds.length > 0) annotationQueryGroups.push({ entityType: 'fms_document', rowIds: documentIds })

    const baseAnnotationFilter = {
      deletedAt: null,
      ...(annotationTenantId ? { tenantId: annotationTenantId } : {}),
      ...(annotationOrgId ? { organizationId: annotationOrgId } : {}),
    }

    const annotationResults = await Promise.all(
      annotationQueryGroups.map(({ entityType, rowIds }) =>
        em.find(CellAnnotation, { ...baseAnnotationFilter, entityType, rowId: { $in: rowIds } }, { populate: ['comments'] })
      )
    )
    const annotations = annotationResults.flat()

    const annotationUserIds = new Set<string>()
    for (const annotation of annotations) {
      for (const comment of annotation.comments) {
        if (comment.deletedAt == null && comment.userId) annotationUserIds.add(comment.userId)
      }
    }

    let annotationUserMap = new Map<string, string>()
    if (annotationUserIds.size > 0) {
      const users = await em.find(User, { id: { $in: [...annotationUserIds] } })
      annotationUserMap = new Map(users.map((u) => [u.id, u.name || u.email || 'Unknown']))
    }

    for (const annotation of annotations) {
      for (const comment of annotation.comments) {
        if (comment.deletedAt != null) continue
        entries.push({
          id: `annotation:${comment.id}`,
          kind: 'annotation',
          occurredAt: comment.createdAt.toISOString(),
          title: 'Cell annotation',
          body: comment.content,
          actor: { userId: comment.userId ?? null, name: comment.userId ? (annotationUserMap.get(comment.userId) ?? 'Unknown') : 'Unknown' },
          metadata: { columnKey: annotation.columnKey, color: annotation.color, entityType: annotation.entityType, tableId: annotation.tableId ?? annotation.entityType, rowId: annotation.rowId },
        })
      }
    }
  }

  // Sort all entries by occurredAt DESC
  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  // Apply cursor-based pagination
  let paginatedEntries = entries
  if (cursor) {
    const cursorTime = new Date(cursor).getTime()
    const cursorIndex = entries.findIndex((e) => new Date(e.occurredAt).getTime() < cursorTime)
    paginatedEntries = cursorIndex === -1 ? [] : entries.slice(cursorIndex)
  }

  const page = paginatedEntries.slice(0, pageSize)
  const nextCursor = page.length === pageSize && paginatedEntries.length > pageSize ? page[page.length - 1].occurredAt : null

  return NextResponse.json({
    items: page,
    total: entries.length,
    nextCursor,
    currentUser: {
      userId: auth.userId ?? auth.sub ?? null,
      name: (typeof auth.name === 'string' ? auth.name : null) || auth.email || 'You',
    },
  })
}
