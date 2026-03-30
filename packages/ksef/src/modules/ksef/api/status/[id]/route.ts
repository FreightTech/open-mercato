import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefSubmission } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.view'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: invoiceId } = await context.params
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

  const organizationId = (auth.actorOrgId || auth.orgId) as string

  const submission = await em.findOne(KsefSubmission, {
    invoiceId,
    tenantId,
    organizationId,
  })

  if (!submission) {
    return NextResponse.json({
      invoiceId,
      status: 'none',
      message: 'No KSeF submission found for this invoice',
    })
  }

  return NextResponse.json({
    submissionId: submission.id,
    invoiceId: submission.invoiceId,
    status: submission.status,
    ksefNumber: submission.ksefNumber ?? null,
    ksefReferenceNumber: submission.ksefReferenceNumber ?? null,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    acceptedAt: submission.acceptedAt?.toISOString() ?? null,
    errorMessage: submission.errorMessage ?? null,
    errorCode: submission.errorCode ?? null,
    offlineMode: submission.offlineMode ?? null,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'KSeF status',
  methods: {
    GET: {
      summary: 'Get KSeF submission status for an invoice',
      description: 'Returns the current KSeF submission status for the specified invoice',
    },
  },
}
