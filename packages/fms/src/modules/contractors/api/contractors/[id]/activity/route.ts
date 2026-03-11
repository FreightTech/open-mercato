/**
 * Contractors - Activity Feed API
 * Aggregates comments, documents, and project events into a unified feed
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { ContractorComment } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'
import { FmsProject } from '../../../../../fms_projects/data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import type { ActivityEntry, ActivityEntryKind } from '../../../../../../lib/activity/types'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
}

export const metadata = routeMetadata

export const openApi = {
  get: {
    operationId: 'getContractorActivity',
    summary: 'Get contractor activity feed',
    description: 'Returns aggregated activity (comments, documents, linked projects) for a contractor',
    tags: ['Contractors'],
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
    return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })
  }

  const contractorId = paramsResult.data.id
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
    if (filter === 'changes') return kind === 'project_created'
    return true
  }

  if (shouldInclude('comment')) {
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

    for (const comment of comments) {
      const att = comment.attachmentId ? attachmentMap.get(comment.attachmentId) : null
      items.push({
        id: `comment-${comment.id}`,
        kind: 'comment',
        occurredAt: comment.createdAt.toISOString(),
        actor: {
          userId: comment.authorUserId ?? null,
          name: comment.authorName || 'Unknown',
        },
        body: comment.body,
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
      relatedEntityType: 'contractors:contractor',
      relatedEntityId: contractorId,
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

  if (shouldInclude('project_created')) {
    const projects = await em.find(FmsProject, {
      client: contractorId,
      organizationId: orgId,
      tenantId,
      deletedAt: null,
    }, { orderBy: { createdAt: 'DESC' }, limit: 200 })

    for (const project of projects) {
      items.push({
        id: `project-${project.id}`,
        kind: 'project_created',
        occurredAt: project.createdAt.toISOString(),
        actor: {
          userId: null,
          name: 'System',
        },
        projectReference: project.internalReference || project.clientReference || project.id.slice(0, 8),
        projectId: project.id,
      })
    }
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  const capped = items.slice(0, 200)

  return NextResponse.json({
    items: capped,
    total: capped.length,
  })
}
