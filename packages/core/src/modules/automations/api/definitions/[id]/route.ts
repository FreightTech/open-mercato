import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationDefinition } from '../../../data/entities'
import { updateAutomationSchema } from '../../../data/validators'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.view'],
}

export const openApi = {
  get: { summary: 'Get automation definition', tags: ['Automations'], responses: { 200: { description: 'Automation definition' } } },
  put: { summary: 'Update automation definition', tags: ['Automations'], responses: { 200: { description: 'Updated' } } },
  delete: { summary: 'Delete automation definition', tags: ['Automations'], responses: { 200: { description: 'Deleted' } } },
}

async function resolveDefinition(request: NextRequest, id: string) {
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  const auth = await getAuthFromRequest(request)
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const tenantId = auth.tenantId
  const organizationId = scope?.selectedId ?? auth.orgId

  // Find by id + tenant, verify org match after
  const definition = await em.findOne(AutomationDefinition, {
    id,
    tenantId,
    deletedAt: null,
  })

  if (!definition) {
    console.error(`[automations] Definition not found: id=${id}, tenantId=${tenantId}`)
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  return { definition, em, auth, container, tenantId, organizationId }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await resolveDefinition(request, id)
    if ('error' in result) return result.error
    return NextResponse.json(result.definition)
  } catch (error) {
    console.error('[automations] GET /definitions/:id error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await resolveDefinition(request, id)
  if ('error' in result) return result.error

  try {
    const body = await request.json()
    const input = updateAutomationSchema.parse(body)
    const { definition, em, auth, container, tenantId, organizationId } = result

    if (input.name !== undefined) definition.name = input.name
    if (input.description !== undefined) definition.description = input.description
    if (input.definition !== undefined) {
      definition.definition = input.definition
      definition.version += 1
    }
    if (input.enabled !== undefined) definition.enabled = input.enabled
    if (input.metadata !== undefined) definition.metadata = input.metadata
    definition.updatedBy = auth.userId

    await em.flush()

    try {
      const eventBus = container.resolve<any>('eventBus')
      await eventBus?.emit('automations.definition.updated', {
        id: definition.id,
        automationId: definition.automationId,
        tenantId,
        organizationId,
      })
    } catch { /* best-effort */ }

    return NextResponse.json(definition)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await resolveDefinition(request, id)
  if ('error' in result) return result.error

  const { definition, em, container, tenantId, organizationId } = result
  definition.deletedAt = new Date()
  definition.enabled = false
  await em.flush()

  try {
    const eventBus = container.resolve<any>('eventBus')
    await eventBus?.emit('automations.definition.deleted', {
      id: definition.id,
      automationId: definition.automationId,
      tenantId,
      organizationId,
    })
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true })
}
