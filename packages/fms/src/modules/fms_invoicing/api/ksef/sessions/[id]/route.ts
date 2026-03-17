import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingKsefSession } from '../../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_invoicing.ksef.view'] },
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

  const tenantId = auth.actorTenantId || auth.tenantId

  const session = await em.findOne(
    FmsInvoicingKsefSession,
    { id, tenantId }
  )

  if (!session) {
    return NextResponse.json({ error: 'KSeF session not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: session.id,
    sessionType: session.sessionType,
    sessionStatus: session.sessionStatus,
    ksefReferenceNumber: session.ksefReferenceNumber,
    nip: session.nip,
    invoiceCount: session.invoiceCount,
    startedAt: session.startedAt,
    closedAt: session.closedAt,
    errorMessage: session.errorMessage,
    upoDownloadedAt: session.upoDownloadedAt,
    organizationId: session.organizationId,
    tenantId: session.tenantId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing - KSeF',
  summary: 'KSeF session detail',
  methods: {
    GET: {
      summary: 'Get KSeF session by ID',
      description: 'Retrieve details of a specific KSeF session',
    },
  },
}
