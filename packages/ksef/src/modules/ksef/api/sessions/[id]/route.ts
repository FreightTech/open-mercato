import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefSession } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.view'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const session = await em.findOne(KsefSession, {
    id,
    tenantId,
  })

  if (!session) {
    return NextResponse.json({ error: 'KSeF session not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: session.id,
    sessionType: session.sessionType,
    sessionStatus: session.sessionStatus,
    nip: session.nip,
    ksefReferenceNumber: session.ksefReferenceNumber ?? null,
    invoiceCount: session.invoiceCount,
    startedAt: session.startedAt?.toISOString() ?? null,
    closedAt: session.closedAt?.toISOString() ?? null,
    errorMessage: session.errorMessage ?? null,
    hasUpo: !!session.upoXml,
    upoDownloadedAt: session.upoDownloadedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Session details',
  methods: {
    GET: {
      summary: 'Get KSeF session details',
      description: 'Returns details of a specific KSeF session',
    },
  },
}
