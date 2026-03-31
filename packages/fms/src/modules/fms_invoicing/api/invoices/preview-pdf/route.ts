import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { generateInvoicePdf } from '../../../lib/pdf/invoice-pdf.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.invoices.view'] },
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const invoice = {
      invoiceNumber: body.invoiceNumber || '',
      invoiceDate: body.invoiceDate || null,
      dueDate: body.dueDate || null,
      serviceDate: body.serviceDate || null,
      sellerName: body.sellerName || null,
      sellerTaxId: body.sellerTaxId || null,
      sellerAddress: body.sellerAddress || null,
      sellerCountryCode: body.sellerCountryCode || null,
      sellerBankAccount: body.sellerBankAccount || null,
      buyerName: body.buyerName || null,
      buyerTaxId: body.buyerTaxId || null,
      buyerAddress: body.buyerAddress || null,
      buyerCountryCode: body.buyerCountryCode || null,
      netAmount: body.netAmount || '0',
      vatAmount: body.vatAmount || '0',
      grossAmount: body.grossAmount || '0',
      currencyCode: body.currencyCode || 'PLN',
      paymentMethod: body.paymentMethod || null,
      paymentTerms: body.paymentTerms || null,
      notes: body.notes || null,
    }

    const lineItems = Array.isArray(body.lineItems)
      ? body.lineItems.map((li: Record<string, unknown>, idx: number) => ({
          lineNumber: (li.lineNumber as number) || idx + 1,
          description: (li.description as string) || '',
          quantity: (li.quantity as string) || '1',
          unit: (li.unit as string) || null,
          unitPriceNet: (li.unitPriceNet as string) || '0',
          vatRate: (li.vatRate as string) || '0',
          vatRateCode: (li.vatRateCode as string) || null,
          netAmount: (li.netAmount as string) || '0',
          vatAmount: (li.vatAmount as string) || '0',
          grossAmount: (li.grossAmount as string) || '0',
        }))
      : []

    const pdfBuffer = await generateInvoicePdf(invoice, lineItems)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Content-Disposition': 'inline; filename="preview.pdf"',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate PDF'
    console.error('[invoicing/preview-pdf] generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', message },
      { status: 500 }
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Invoice PDF preview',
  methods: {
    POST: {
      summary: 'Generate PDF preview from form data',
      description: 'Generate a PDF preview without saving — accepts invoice data in request body',
    },
  },
}
