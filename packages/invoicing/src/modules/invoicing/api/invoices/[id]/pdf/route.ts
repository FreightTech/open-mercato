import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingInvoice, InvoicingLineItem } from '../../../../data/entities'
import { generateInvoicePdf } from '../../../../lib/pdf/invoice-pdf.service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['invoicing.invoices.view'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const tenantId = auth.actorTenantId || auth.tenantId

    const invoice = await em.findOne(InvoicingInvoice, { id, tenantId, deletedAt: null })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const lineItems = await em.find(
      InvoicingLineItem,
      { invoice },
      { orderBy: { lineNumber: 'asc' } }
    )

    const pdfBuffer = await generateInvoicePdf(invoice, lineItems)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate PDF'
    console.error('[invoicing/pdf] generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', message },
      { status: 500 }
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Invoice PDF',
  methods: {
    GET: {
      summary: 'Generate invoice PDF',
      description: 'Generate and return a PDF for the specified invoice',
    },
  },
}
