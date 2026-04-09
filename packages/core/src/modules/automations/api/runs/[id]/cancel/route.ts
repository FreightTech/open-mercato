import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationRun } from '../../../../data/entities'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.execute'],
}

export const openApi = {
  post: { summary: 'Cancel a running automation', tags: ['Automations'], responses: { 200: { description: 'Cancelled' } } },
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const tenantId = auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId

    const run = await em.findOne(AutomationRun, {
      id,
      tenantId,
      organizationId,
    })

    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (run.status !== 'RUNNING') {
      return NextResponse.json({ error: `Cannot cancel run with status: ${run.status}` }, { status: 400 })
    }

    run.status = 'CANCELLED'
    run.completedAt = new Date()
    await em.flush()

    return NextResponse.json({ ok: true, status: run.status })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
