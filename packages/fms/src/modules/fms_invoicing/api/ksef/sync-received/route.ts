import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { syncReceivedSchema } from '../../../data/validators'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.ksef.receive'] },
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = syncReceivedSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  try {
    // TODO: Sprint 4 - Wire up KSeF service for downloading received invoices
    // const ksefService = container.resolve('fmsInvoicingService') as InvoicingService
    // const result = await ksefService.syncReceivedInvoices({
    //   dateFrom: parse.data.dateFrom,
    //   dateTo: parse.data.dateTo,
    //   organizationId,
    //   tenantId,
    //   container,
    //   auth,
    //   scope,
    // })

    return NextResponse.json({
      message: 'KSeF received invoice sync will be available in Sprint 4',
      received: 0,
      dateFrom: parse.data.dateFrom ?? null,
      dateTo: parse.data.dateTo ?? null,
    }, { status: 501 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync received invoices from KSeF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing - KSeF',
  summary: 'Sync received invoices',
  methods: {
    POST: {
      summary: 'Sync received invoices from KSeF',
      description: 'Download and import invoices received via KSeF within the specified date range',
    },
  },
}
