/**
 * FMS Projects - Activity Aggregation API
 * Aggregates comments, documents, and tracking events into a unified timeline
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
import { FmsProject, FmsProjectNote, FmsProjectLine, FmsSeaContainer, FmsAirUnit, FmsRoadUnit, FmsProjectLeg, FmsProjectCargo, FmsProjectInvoice } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'
import type { ActivityEntry, ActivityFilter } from '../../../../../../lib/activity/types'
import { FILTER_TO_KINDS } from '../../../../../../lib/activity/types'
import type { CargoEventEntry } from '../../../../data/tracking-types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.view'] },
}

export const openApi = {
  GET: {
    summary: 'Get project activity timeline',
    description: 'Aggregates comments, documents, and tracking events into a chronological activity feed.',
    tags: ['fms_projects'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'filter', in: 'query', required: false, schema: { type: 'string', enum: ['all', 'comments', 'documents', 'changes'] } },
    ],
    responses: {
      200: { description: 'Activity entries' },
      401: { description: 'Unauthorized' },
    },
  },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

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

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const projectId = paramsResult.data.id
  const url = new URL(req.url)
  const filter = (url.searchParams.get('filter') || 'all') as ActivityFilter
  const cursor = url.searchParams.get('cursor') || null // ISO date cursor for pagination
  const pageSize = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
  const allowedKinds = FILTER_TO_KINDS[filter] ?? null

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // Load project to verify it exists
  const project = await em.findOne(FmsProject, { id: projectId, deletedAt: null, ...scopeFilters })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Load child entity IDs for ActionLog and Annotation queries
  const [seaContainerIds, roadUnitIds, airUnitIds, legIds, cargoIds, invoiceIds, documentIds, projectLineIds] = await Promise.all([
    em.find(FmsSeaContainer, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsRoadUnit, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsAirUnit, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsProjectLeg, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsProjectCargo, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsProjectInvoice, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsDocument, { relatedEntityId: projectId, relatedEntityType: 'fms_projects:fms_project', deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
    em.find(FmsProjectLine, { project: projectId, deletedAt: null, ...scopeFilters }, { fields: ['id'] }).then((r) => r.map((e) => e.id)),
  ])

  const entries: ActivityEntry[] = []

  // --- Comments ---
  if (!allowedKinds || allowedKinds.includes('comment')) {
    const notes = await em.find(FmsProjectNote, {
      project: projectId,
      deletedAt: null,
      ...scopeFilters,
    }, { orderBy: { createdAt: 'DESC' } })

    // Load attachments for notes
    const noteAttachmentIds = notes
      .map((n) => n.attachmentId)
      .filter((id): id is string => typeof id === 'string')

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
        actor: {
          userId: note.authorUserId ?? null,
          name: note.authorName || 'Unknown',
        },
        attachment: attachment
          ? {
              id: attachment.id,
              filename: attachment.fileName,
              mimeType: attachment.mimeType,
              size: attachment.fileSize,
              url: attachment.url,
            }
          : null,
      })
    }
  }

  // --- Documents ---
  if (!allowedKinds || allowedKinds.includes('document')) {
    const documents = await em.find(FmsDocument, {
      relatedEntityId: projectId,
      relatedEntityType: 'fms_projects:fms_project',
      deletedAt: null,
      ...scopeFilters,
    }, { orderBy: { createdAt: 'DESC' } })

    // Load attachments for documents
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
        actor: {
          userId: doc.createdBy ?? null,
          name: 'System',
        },
        metadata: {
          fileName: attachment?.fileName ?? doc.name,
          fileSize: attachment?.fileSize ?? null,
          documentCategory: doc.category,
        },
      })
    }
  }

  // --- Tracking / Customs from SeaContainer cargoEvents ---
  if (!allowedKinds || allowedKinds.includes('tracking') || allowedKinds.includes('customs')) {
    const containers = await em.find(FmsSeaContainer, {
      project: projectId,
      deletedAt: null,
      ...scopeFilters,
    })

    let eventCount = 0
    const maxEvents = 200

    for (const container of containers) {
      const cargoEvents = (container.cargoEvents as CargoEventEntry[] | null) ?? []
      for (const event of cargoEvents) {
        if (eventCount >= maxEvents) break

        const isCustoms = event.eventCode === 'CUST' ||
          event.eventType === 'CUSTOMS' ||
          (event.description ?? '').toLowerCase().includes('customs')

        const kind = isCustoms ? 'customs' : 'tracking'
        if (allowedKinds && !allowedKinds.includes(kind)) continue

        entries.push({
          id: `tracking:${container.id}:${event.id}`,
          kind,
          occurredAt: event.eventDateTime,
          title: event.description || (isCustoms ? 'Customs Event' : 'Tracking Event'),
          body: null,
          actor: {
            userId: null,
            name: 'System',
          },
          metadata: {
            containerNumber: container.containerNumber ?? null,
            eventType: event.eventType,
            eventCode: event.eventCode,
            locationName: event.locationName ?? null,
          },
        })
        eventCount++
      }
    }
  }

  // --- Field Changes from ActionLog ---
  if (!allowedKinds || allowedKinds.includes('field_change')) {
    const orConditions: Array<Record<string, unknown>> = [
      { resourceKind: 'fms_projects.project', resourceId: projectId },
    ]
    const childKindMap: Array<[string, string[]]> = [
      ['fms_projects.sea_container', seaContainerIds],
      ['fms_projects.road_unit', roadUnitIds],
      ['fms_projects.air_unit', airUnitIds],
      ['fms_projects.project_leg', legIds],
      ['fms_projects.project_cargo', cargoIds],
      ['fms_projects.project_invoice', invoiceIds],
    ]
    for (const [kind, ids] of childKindMap) {
      if (ids.length > 0) {
        orConditions.push({ resourceKind: kind, resourceId: { $in: ids } })
      }
    }

    const actionLogs = await em.find(ActionLog, {
      $or: orConditions,
      executionState: 'done',
      deletedAt: null,
      ...(scopeFilters.tenantId ? { tenantId: scopeFilters.tenantId } : {}),
    }, { orderBy: { createdAt: 'DESC' }, limit: 200 })

    // Batch resolve user names for action logs
    const logUserIds = new Set<string>()
    for (const log of actionLogs) {
      if (log.actorUserId) logUserIds.add(log.actorUserId)
    }

    let logUserMap = new Map<string, string>()
    if (logUserIds.size > 0) {
      const users = await em.find(User, { id: { $in: [...logUserIds] } })
      logUserMap = new Map(users.map((u) => [u.id, u.name || u.email || 'Unknown']))
    }

    for (const log of actionLogs) {
      const changesRecord = log.changesJson as Record<string, { from: unknown; to: unknown }> | null
      const changes = changesRecord
        ? Object.entries(changesRecord).map(([field, diff]) => ({
            field,
            from: diff?.from ?? null,
            to: diff?.to ?? null,
          }))
        : []

      // Skip update entries with no actual changes (stale records from before auto-derive fix)
      if (changes.length === 0 && log.commandId?.includes('.update')) continue

      entries.push({
        id: `change:${log.id}`,
        kind: 'field_change',
        occurredAt: log.createdAt.toISOString(),
        title: log.actionLabel || 'Field change',
        body: null,
        actor: {
          userId: log.actorUserId ?? null,
          name: log.actorUserId ? (logUserMap.get(log.actorUserId) ?? 'Unknown') : 'System',
        },
        metadata: {
          changes,
          resourceKind: log.resourceKind,
          commandId: log.commandId,
        },
      })
    }
  }

  // --- Annotations (cell comments) ---
  if (!allowedKinds || allowedKinds.includes('annotation')) {
    const annotationOrConditions: Array<Record<string, unknown>> = [
      { entityType: 'fms_project', rowId: projectId },
      { entityType: 'fms_project_party', rowId: 'parties' },
    ]
    if (seaContainerIds.length > 0) {
      annotationOrConditions.push({ entityType: 'fms_sea_container', rowId: { $in: seaContainerIds } })
    }
    if (roadUnitIds.length > 0) {
      annotationOrConditions.push({ entityType: 'fms_road_unit', rowId: { $in: roadUnitIds } })
    }
    if (cargoIds.length > 0) {
      annotationOrConditions.push({ entityType: 'fms_project_cargo', rowId: { $in: cargoIds } })
    }
    if (documentIds.length > 0) {
      annotationOrConditions.push({ entityType: 'fms_document', rowId: { $in: documentIds } })
    }
    if (projectLineIds.length > 0) {
      annotationOrConditions.push({ entityType: 'ProjectLine', rowId: { $in: projectLineIds } })
    }

    const annotations = await em.find(CellAnnotation, {
      $or: annotationOrConditions,
      deletedAt: null,
      ...(scopeFilters.tenantId ? { tenantId: scopeFilters.tenantId } : {}),
      ...(scopeFilters.organizationId ? { organizationId: scopeFilters.organizationId } : {}),
    }, { populate: ['comments'] })

    // Batch resolve user names for annotation comments
    const annotationUserIds = new Set<string>()
    for (const annotation of annotations) {
      for (const comment of annotation.comments) {
        if (comment.deletedAt == null && comment.userId) {
          annotationUserIds.add(comment.userId)
        }
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
          actor: {
            userId: comment.userId ?? null,
            name: comment.userId ? (annotationUserMap.get(comment.userId) ?? 'Unknown') : 'Unknown',
          },
          metadata: {
            columnKey: annotation.columnKey,
            color: annotation.color,
            entityType: annotation.entityType,
            tableId: annotation.tableId ?? annotation.entityType,
            rowId: annotation.rowId,
          },
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
  const nextCursor = page.length === pageSize && paginatedEntries.length > pageSize
    ? page[page.length - 1].occurredAt
    : null

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
