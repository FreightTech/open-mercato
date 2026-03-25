/**
 * FMS Files - Single Document API
 * DELETE /api/fms_files/files/:id/documents/:docId — soft-delete a document
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile } from '../../../../../data/entities'
import { FmsDocument } from '../../../../../../fms_documents/data/entities'

export const metadata = {
  DELETE: {
    requireAuth: true,
    requireFeatures: ['fms_files.files.manage'],
  },
}

export const openApi = {
  DELETE: {
    summary: 'Delete a document from a file',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'docId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'Deleted' }, 401: { description: 'Unauthorized' }, 404: { description: 'Not found' } },
  },
}

interface RouteContext {
  params: Promise<{ id: string; docId: string }>
}

const paramsSchema = z.object({
  id: z.string().uuid(),
  docId: z.string().uuid(),
})

const RELATED_ENTITY_TYPE = 'fms_files:fms_file'

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawParams = await context.params
    const parse = paramsSchema.safeParse(rawParams)
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const { id: fileId, docId } = parse.data

    // Verify file exists and user has access
    const file = await em.findOne(FmsFile, {
      id: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Find the document, ensuring it belongs to this file
    const document = await em.findOne(FmsDocument, {
      id: docId,
      relatedEntityId: fileId,
      relatedEntityType: RELATED_ENTITY_TYPE,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    document.deletedAt = new Date()
    await em.flush()

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fms-files:documents] delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete document', message },
      { status: 500 }
    )
  }
}
