import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingInvoice, FmsInvoicingLineItem } from '../../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.ksef.submit'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
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

  const lineItems = await em.find(
    FmsInvoicingLineItem,
    { invoice },
    { orderBy: { lineNumber: 'asc' } }
  )

  try {
    // TODO: Sprint 4 - Wire up FA(3) XML generation from ksef/fa3-schema.ts
    // const ksefService = container.resolve('fmsInvoicingService') as InvoicingService
    // const xml = await ksefService.generateFaXml(invoice, lineItems)

    // For now, return a preview stub indicating the feature is pending
    return NextResponse.json({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      message: 'FA(3) XML generation will be available in Sprint 4',
      lineItemCount: lineItems.length,
      xml: null,
    }, { status: 501 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate KSeF XML'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing - KSeF',
  summary: 'Generate KSeF XML',
  methods: {
    POST: {
      summary: 'Generate FA(3) XML for an invoice',
      description: 'Generate the KSeF-compliant FA(3) XML document for an invoice without submitting it',
    },
  },
}
