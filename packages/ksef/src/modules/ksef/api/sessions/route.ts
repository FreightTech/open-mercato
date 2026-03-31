import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { KsefSessionService } from '../../services/session.service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.view'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const sessionService = container.resolve('ksefSessionService') as KsefSessionService

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const organizationId = (auth.actorOrgId || auth.orgId) as string

  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') ?? '1', 10)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
  const status = url.searchParams.get('status') as string | undefined

  const offset = (page - 1) * limit

  const result = await sessionService.listSessions(em, {
    tenantId,
    organizationId,
    status: status as any,
    limit,
    offset,
  })

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page,
    limit,
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'List sessions',
  methods: {
    GET: {
      summary: 'List KSeF sessions',
      description: 'Returns paginated list of KSeF authentication sessions',
    },
  },
}
