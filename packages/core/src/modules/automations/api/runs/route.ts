import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationRun } from '../../data/entities'
import { listRunsQuerySchema } from '../../data/validators'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.view_runs'],
}

export const openApi = {
  get: { summary: 'List automation runs', tags: ['Automations'], responses: { 200: { description: 'List of automation runs' } } },
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
    const query = listRunsQuerySchema.parse(Object.fromEntries(searchParams))

    const where: any = { tenantId, organizationId }
    if (query.automationId) where.automationId = query.automationId
    if (query.definitionId) where.definitionId = query.definitionId
    if (query.status) where.status = query.status

    const [items, total] = await em.findAndCount(AutomationRun, where, {
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
