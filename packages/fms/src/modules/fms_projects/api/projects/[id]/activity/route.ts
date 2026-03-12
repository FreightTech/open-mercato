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
import { FmsProjectNote, FmsSeaContainer } from '../../../../data/entities'
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
  const allowedKinds = FILTER_TO_KINDS[filter] ?? null

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

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

  // Sort all entries by occurredAt DESC
  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  return NextResponse.json({
    items: entries,
    total: entries.length,
  })
}
