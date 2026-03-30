import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingKsefSession } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['invoicing.ksef.view'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))
  const statusFilter = url.searchParams.get('status')

  const filters: Record<string, unknown> = {
    tenantId,
    organizationId: { $in: allowedOrgIds },
  }

  if (statusFilter) {
    filters.sessionStatus = statusFilter
  }

  const [sessions, total] = await em.findAndCount(
    InvoicingKsefSession,
    filters,
    {
      limit,
      offset: (page - 1) * limit,
      orderBy: { createdAt: 'desc' },
    }
  )

  return NextResponse.json({
    items: sessions.map((session) => ({
      id: session.id,
      sessionType: session.sessionType,
      sessionStatus: session.sessionStatus,
      ksefReferenceNumber: session.ksefReferenceNumber,
      nip: session.nip,
      invoiceCount: session.invoiceCount,
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      errorMessage: session.errorMessage,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing - KSeF',
  summary: 'KSeF sessions',
  methods: {
    GET: {
      summary: 'List KSeF sessions',
      description: 'List all KSeF sessions with pagination and optional status filtering',
    },
  },
}
