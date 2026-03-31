import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefInvoice, KsefInvoiceLineItem } from '../../../data/entities'
import {
  extractInvoiceNumberFromFa3,
  extractSellerNipFromFa3,
  extractBuyerNipFromFa3,
  extractInvoiceDateFromFa3,
  extractGrossAmountFromFa3,
  extractLineItemsFromFa3,
  extractSellerNameFromFa3,
  extractBuyerNameFromFa3,
  extractDueDateFromFa3,
  extractCurrencyFromFa3,
  extractPaymentMethodFromFa3,
} from '../../../lib/xml-parser'
import { emitKsefEvent } from '../../../events'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.submit'] },
}

export async function POST(request: NextRequest) {
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

  let xmlContent: string

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    xmlContent = await file.text()
  } else {
    const body = await request.json()
    xmlContent = body.xml as string
    if (!xmlContent) {
      return NextResponse.json({ error: 'No XML content provided' }, { status: 400 })
    }
  }

  if (!xmlContent.includes('<Faktura') && !xmlContent.includes('<Fa>') && !xmlContent.includes('<tns:Faktura')) {
    return NextResponse.json({ error: 'Invalid FA(3) XML — missing Faktura root element' }, { status: 400 })
  }

  const invoiceNumber = extractInvoiceNumberFromFa3(xmlContent)
  if (!invoiceNumber) {
    return NextResponse.json({ error: 'Could not extract invoice number from XML' }, { status: 400 })
  }

  const direction = (request.headers.get('x-ksef-direction') ?? 'outgoing') as 'outgoing' | 'incoming'

  const invoice = em.create(KsefInvoice, {
    organizationId,
    tenantId,
    invoiceNumber,
    invoiceDate: extractInvoiceDateFromFa3(xmlContent) ? new Date(extractInvoiceDateFromFa3(xmlContent)!) : null,
    dueDate: extractDueDateFromFa3(xmlContent) ? new Date(extractDueDateFromFa3(xmlContent)!) : null,
    sellerName: extractSellerNameFromFa3(xmlContent),
    sellerTaxId: extractSellerNipFromFa3(xmlContent),
    buyerName: extractBuyerNameFromFa3(xmlContent),
    buyerTaxId: extractBuyerNipFromFa3(xmlContent),
    grossAmount: extractGrossAmountFromFa3(xmlContent) ?? '0',
    currencyCode: extractCurrencyFromFa3(xmlContent) ?? 'PLN',
    paymentMethod: extractPaymentMethodFromFa3(xmlContent),
    direction,
  })
  em.persist(invoice)

  // Parse and create line items
  const parsedLines = extractLineItemsFromFa3(xmlContent)
  let totalNet = 0
  let totalVat = 0

  for (const line of parsedLines) {
    const netAmount = parseFloat(line.netAmount ?? '0')
    const unitPriceNet = parseFloat(line.unitPrice ?? '0')
    const vatRate = line.vatRate ?? '0'
    const vatAmount = isNaN(parseFloat(vatRate)) ? 0 : netAmount * (parseFloat(vatRate) / 100)

    totalNet += netAmount
    totalVat += vatAmount

    const lineItem = em.create(KsefInvoiceLineItem, {
      invoice,
      lineNumber: parseInt(line.lineNumber ?? '0', 10) || 1,
      description: line.description ?? '',
      quantity: line.quantity ?? '1',
      unitPriceNet: String(unitPriceNet),
      netAmount: String(netAmount),
      vatAmount: String(Math.round(vatAmount * 100) / 100),
      vatRate,
    })
    em.persist(lineItem)
  }

  // Update calculated amounts
  if (totalNet > 0) {
    invoice.netAmount = String(Math.round(totalNet * 100) / 100)
  }
  if (totalVat > 0) {
    invoice.vatAmount = String(Math.round(totalVat * 100) / 100)
  }

  await em.flush()

  await emitKsefEvent('ksef.invoice.created', {
    id: invoice.id,
    invoiceId: invoice.id,
    tenantId,
    organizationId,
    direction: invoice.direction,
    source: 'xml-import',
  })

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    lineItemCount: parsedLines.length,
    message: 'Invoice imported from XML successfully',
  }, { status: 201 })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Import XML',
  methods: {
    POST: {
      summary: 'Import invoice from FA(3) XML',
      description: 'Parse a FA(3) XML file and create a KSeF invoice with line items',
    },
  },
}
