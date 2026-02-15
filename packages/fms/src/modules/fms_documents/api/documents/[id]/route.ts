import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument } from '../../../data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const updateDocumentSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  category: z.enum(['offer', 'invoice', 'customs', 'bill_of_lading', 'other']).optional(),
  description: z.string().max(2000).optional().nullable(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  relatedEntityType: z.string().max(100).optional().nullable(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_documents.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_documents.delete'] },
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parse = paramsSchema.safeParse({ id: params.id })
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 })
  }

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')

    const tenantId = auth.actorTenantId || auth.tenantId
    const organizationId = auth.actorOrgId || auth.orgId

    const document = await em.findOne(FmsDocument, {
      id: parse.data.id,
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: document.id,
      name: document.name,
      category: document.category,
      description: document.description,
      attachmentId: document.attachmentId,
      relatedEntityId: document.relatedEntityId,
      relatedEntityType: document.relatedEntityType,
      extractedData: document.extractedData,
      documentType: document.documentType,
      documentTypeConfidence: document.documentTypeConfidence,
      processingStatus: document.processingStatus,
      processedAt: document.processedAt,
      createdBy: document.createdBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    })
  } catch (error: any) {
    console.error('[fms-documents] get error:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parseParams = paramsSchema.safeParse({ id: params.id })
  if (!parseParams.success) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 })
  }

  const body = await request.json()
  const parse = updateDocumentSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const organizationId = auth.actorOrgId || auth.orgId

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute<
      Record<string, unknown>,
      { id: string }
    >('fms_documents.documents.update', {
      input: {
        id: parseParams.data.id,
        ...parse.data,
      },
      ctx,
    })

    // Fetch updated document
    const em = container.resolve<EntityManager>('em')
    const document = await em.findOne(FmsDocument, { id: result.id })

    return NextResponse.json({
      ok: true,
      item: document ? {
        id: document.id,
        name: document.name,
        category: document.category,
        updatedAt: document.updatedAt,
      } : { id: result.id },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update document'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parse = paramsSchema.safeParse({ id: params.id })
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const organizationId = auth.actorOrgId || auth.orgId

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    await bus.execute<{ id: string }, { id: string }>('fms_documents.documents.delete', {
      input: { id: parse.data.id },
      ctx,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete document'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
