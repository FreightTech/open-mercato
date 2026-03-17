import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingInvoice } from '../../../../data/entities'

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

  const invoice = await em.findOne(
    FmsInvoicingInvoice,
    { id, tenantId, deletedAt: null }
  )

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // TODO: Sprint 4 - Poll KSeF API for real-time status if invoice is in processing state
  // const ksefService = container.resolve('fmsInvoicingService') as InvoicingService
  // if (invoice.ksefStatus === 'submitted' || invoice.ksefStatus === 'processing') {
  //   await ksefService.refreshKsefStatus(invoice, { container, auth })
  // }

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    ksefStatus: invoice.ksefStatus,
    ksefNumber: invoice.ksefNumber,
    ksefSessionId: invoice.ksefSessionId,
    ksefSubmittedAt: invoice.ksefSubmittedAt,
    ksefAcceptedAt: invoice.ksefAcceptedAt,
    ksefReferenceNumber: invoice.ksefReferenceNumber,
    ksefErrorMessage: invoice.ksefErrorMessage,
    ksefErrorCode: invoice.ksefErrorCode,
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing - KSeF',
  summary: 'KSeF status',
  methods: {
    GET: {
      summary: 'Get KSeF submission status for an invoice',
      description: 'Retrieve the current KSeF submission status, reference number, and any errors',
    },
  },
}
