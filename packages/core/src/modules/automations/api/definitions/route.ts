import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationDefinition } from '../../data/entities'
import { createAutomationSchema, listDefinitionsQuerySchema } from '../../data/validators'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.view'],
}

export const openApi = {
  get: {
    summary: 'List automation definitions',
    tags: ['Automations'],
    responses: { 200: { description: 'List of automation definitions' } },
  },
  post: {
    summary: 'Create automation definition',
    tags: ['Automations'],
    responses: { 201: { description: 'Created' } },
  },
}

export async function GET(request: NextRequest) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const tenantId = auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId

    const { searchParams } = new URL(request.url)
    const query = listDefinitionsQuerySchema.parse(Object.fromEntries(searchParams))

    const where: any = { tenantId, organizationId, deletedAt: null }
    if (query.enabled) where.enabled = query.enabled === 'true'
    if (query.search) {
      where.$or = [
        { name: { $ilike: `%${query.search}%` } },
        { automationId: { $ilike: `%${query.search}%` } },
      ]
    }

    const [items, total] = await em.findAndCount(AutomationDefinition, where, {
      orderBy: { [query.sortField]: query.sortDir },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    })

    return NextResponse.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const tenantId = auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId

    const body = await request.json().catch(() => ({}))
    const input = createAutomationSchema.parse(body)

    // Auto-generate automationId and name if not provided
    const shortId = Math.random().toString(36).slice(2, 8)
    const automationId = input.automationId || `automation-${shortId}`
    const name = input.name || 'Untitled Automation'

    // Check unique constraint
    const existing = await em.findOne(AutomationDefinition, {
      automationId,
      tenantId,
      deletedAt: null,
    })
    if (existing) {
      return NextResponse.json({ error: 'Automation ID already exists' }, { status: 409 })
    }

    const defaultDefinition = {
      nodes: [
        {
          id: 'trigger_1',
          type: 'trigger.manual',
          name: 'Manual Trigger',
          position: { x: 250, y: 50 },
          config: {},
        },
      ],
      connections: [],
    }

    const definition = em.create(AutomationDefinition, {
      ...input,
      automationId,
      name,
      definition: input.definition ?? defaultDefinition,
      tenantId,
      organizationId,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })

    await em.persistAndFlush(definition)

    // Emit event
    try {
      const eventBus = container.resolve<any>('eventBus')
      await eventBus?.emit('automations.definition.created', {
        id: definition.id,
        automationId: definition.automationId,
        tenantId,
        organizationId,
      })
    } catch { /* event emission is best-effort */ }

    return NextResponse.json(definition, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: (error as any).errors }, { status: 400 })
    }
    console.error('[automations] POST /definitions error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
