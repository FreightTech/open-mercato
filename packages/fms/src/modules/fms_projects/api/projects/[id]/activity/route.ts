/**
 * FMS Projects - Activity Feed API
 * Aggregates notes, documents, and tracking events into a unified feed
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProjectNote, FmsSeaContainer } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import type { ActivityEntry, ActivityEntryKind } from '../../../../../../lib/activity/types'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.view'] },
}

export const metadata = routeMetadata

export const openApi = {
  get: {
    operationId: 'getProjectActivity',
    summary: 'Get project activity feed',
    description: 'Returns aggregated activity (comments, documents, tracking events) for a project',
    tags: ['FMS Projects'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'filter', in: 'query', required: false, schema: { type: 'string', enum: ['all', 'comments', 'documents', 'changes'] } },
    ],
    responses: {
      200: { description: 'Activity feed' },
    },
  },
}

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const projectId = paramsResult.data.id
  const url = new URL(req.url)
  const filter = url.searchParams.get('filter') || 'all'

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const orgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!orgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const items: ActivityEntry[] = []

  const shouldInclude = (kind: ActivityEntryKind) => {
    if (filter === 'all') return true
    if (filter === 'comments') return kind === 'comment'
    if (filter === 'documents') return kind === 'document'
    if (filter === 'changes') return ['tracking', 'customs', 'field_change', 'project_created'].includes(kind)
    return true
  }

  if (shouldInclude('comment')) {
    const notes = await em.find(FmsProjectNote, {
      project: projectId,
      organizationId: orgId,
      tenantId,
      deletedAt: null,
    }, { orderBy: { createdAt: 'DESC' }, limit: 200 })

    const attachmentIds = notes
      .filter((n) => n.attachmentId)
      .map((n) => n.attachmentId as string)
    let attachmentMap = new Map<string, Attachment>()
    if (attachmentIds.length > 0) {
      const attachments = await em.find(Attachment, { id: { $in: attachmentIds } })
      attachmentMap = new Map(attachments.map((a) => [a.id, a]))
    }

    for (const note of notes) {
      const att = note.attachmentId ? attachmentMap.get(note.attachmentId) : null
      items.push({
        id: `note-${note.id}`,
        kind: 'comment',
        occurredAt: note.createdAt.toISOString(),
        actor: {
          userId: note.authorUserId ?? null,
          name: note.authorName || 'Unknown',
        },
        body: note.body,
        attachment: att ? {
          id: att.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          url: att.url,
        } : null,
      })
    }
  }

  if (shouldInclude('document')) {
    const documents = await em.find(FmsDocument, {
      relatedEntityId: projectId,
      relatedEntityType: { $like: '%fms_projects%' },
      organizationId: orgId,
      tenantId,
      deletedAt: null,
    }, { orderBy: { createdAt: 'DESC' }, limit: 200 })

    const docAttachmentIds = documents.map((d) => d.attachmentId)
    let docAttachmentMap = new Map<string, Attachment>()
    if (docAttachmentIds.length > 0) {
      const attachments = await em.find(Attachment, { id: { $in: docAttachmentIds } })
      docAttachmentMap = new Map(attachments.map((a) => [a.id, a]))
    }

    for (const doc of documents) {
      const att = docAttachmentMap.get(doc.attachmentId)
      items.push({
        id: `doc-${doc.id}`,
        kind: 'document',
        occurredAt: doc.createdAt.toISOString(),
        actor: {
          userId: doc.createdBy ?? null,
          name: doc.createdBy || 'System',
        },
        fileName: att?.fileName || doc.name,
        fileSize: att?.fileSize ?? null,
        fileCategory: doc.category,
      })
    }
  }

  if (shouldInclude('tracking') || shouldInclude('customs')) {
    const containers = await em.find(FmsSeaContainer, {
      project: projectId,
      organizationId: orgId,
      tenantId,
    })

    for (const container of containers) {
      const events = container.cargoEvents
      if (!Array.isArray(events)) continue

      for (const event of events.slice(0, 200)) {
        const eventType = String(event.eventType || '').toLowerCase()
        const kind: ActivityEntryKind = eventType.includes('customs') ? 'customs' : 'tracking'
        if (!shouldInclude(kind)) continue

        items.push({
          id: `event-${event.id}`,
          kind,
          occurredAt: event.eventDateTime || new Date().toISOString(),
          actor: {
            userId: null,
            name: container.carrierCode || 'Carrier',
          },
          eventType: event.eventCode || event.eventType,
          eventDescription: event.description ?? null,
          locationName: event.locationName ?? null,
        })
      }
    }
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  const capped = items.slice(0, 200)

  return NextResponse.json({
    items: capped,
    total: capped.length,
  })
}
