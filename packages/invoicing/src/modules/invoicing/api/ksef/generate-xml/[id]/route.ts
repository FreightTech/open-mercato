import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingInvoice, InvoicingLineItem } from '../../../../data/entities'
import { buildFa3Xml } from '../../../../lib/ksef/xml-builder'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['invoicing.ksef.submit'] },
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
    InvoicingInvoice,
    { id, tenantId, deletedAt: null }
  )

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (!invoice.sellerTaxId) {
    return NextResponse.json({ error: 'Seller tax ID (NIP) is required for KSeF XML generation' }, { status: 400 })
  }

  if (!invoice.invoiceDate) {
    return NextResponse.json({ error: 'Invoice date is required for KSeF XML generation' }, { status: 400 })
  }

  const lineItems = await em.find(
    InvoicingLineItem,
    { invoice },
    { orderBy: { lineNumber: 'asc' } }
  )

  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'Invoice must have at least one line item for KSeF XML generation' }, { status: 400 })
  }

  try {
    // Look up corrected invoice KSeF number for correction invoices
    let correctedKsefNumber: string | null = null
    if (invoice.correctedInvoiceId && ['KOR', 'KOR_ZAL', 'KOR_ROZ'].includes(invoice.invoiceType)) {
      const correctedInvoice = await em.findOne(InvoicingInvoice, { id: invoice.correctedInvoiceId })
      correctedKsefNumber = correctedInvoice?.ksefNumber ?? null
    }

    const xml = buildFa3Xml(invoice, lineItems, { correctedKsefNumber })

    return NextResponse.json({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      lineItemCount: lineItems.length,
      xml,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate KSeF XML'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing - KSeF',
  summary: 'Generate KSeF XML',
  methods: {
    POST: {
      summary: 'Generate FA(3) XML for an invoice',
      description: 'Generate the KSeF-compliant FA(3) XML document for an invoice without submitting it',
    },
  },
}
