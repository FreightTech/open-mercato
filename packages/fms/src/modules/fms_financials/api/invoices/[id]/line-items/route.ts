import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { z } from 'zod'
import { FmsInvoice, FmsInvoiceLineItem } from '../../../../data/entities'

const routeMetadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_financials.invoices.manage'] },
}

export const metadata = routeMetadata

type RouteContext = { params: Promise<{ id: string }> }

const createLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().default('1'),
  unit: z.string().nullable().optional(),
  unitPriceNet: z.string().default('0'),
  vatRate: z.string().default('0'),
  netAmount: z.string().default('0'),
  vatAmount: z.string().default('0'),
  grossAmount: z.string().default('0'),
})

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createLineItemSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  // Verify the invoice exists and belongs to the user
  const invoice = await em.findOne(FmsInvoice, {
    id,
    tenantId,
    organizationId: { $in: allowedOrgIds },
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Get the next line number
  const existingItems = await em.find(FmsInvoiceLineItem, { invoice })
  const maxLineNumber = existingItems.reduce((max, item) => Math.max(max, item.lineNumber), 0)

  // Create the new line item
  const data = parse.data
  const lineItem = em.create(FmsInvoiceLineItem, {
    invoice,
    lineNumber: maxLineNumber + 1,
    description: data.description,
    quantity: data.quantity,
    unit: data.unit ?? null,
    unitPriceNet: data.unitPriceNet,
    vatRate: data.vatRate,
    netAmount: data.netAmount,
    vatAmount: data.vatAmount,
    grossAmount: data.grossAmount,
    rawDescription: data.description,
  })

  await em.persistAndFlush(lineItem)

  // Recalculate invoice totals
  const allLineItems = await em.find(FmsInvoiceLineItem, { invoice })
  let totalNet = 0
  let totalVat = 0
  let totalGross = 0

  for (const li of allLineItems) {
    totalNet += parseFloat(li.netAmount) || 0
    totalVat += parseFloat(li.vatAmount) || 0
    totalGross += parseFloat(li.grossAmount) || 0
  }

  invoice.netAmount = totalNet.toFixed(2)
  invoice.vatAmount = totalVat.toFixed(2)
  invoice.grossAmount = totalGross.toFixed(2)
  invoice.updatedBy = typeof auth.userId === 'string' ? auth.userId : null

  await em.flush()

  return NextResponse.json({
    success: true,
    lineItem: {
      id: lineItem.id,
      lineNumber: lineItem.lineNumber,
      description: lineItem.description,
      quantity: lineItem.quantity,
      unit: lineItem.unit,
      unitPriceNet: lineItem.unitPriceNet,
      vatRate: lineItem.vatRate,
      netAmount: lineItem.netAmount,
      vatAmount: lineItem.vatAmount,
      grossAmount: lineItem.grossAmount,
      chargeCodeId: null,
      chargeCodeName: null,
      chargeCode: null,
      chargeCodeMatchConfidence: null,
    },
    invoiceTotals: {
      netAmount: invoice.netAmount,
      vatAmount: invoice.vatAmount,
      grossAmount: invoice.grossAmount,
    },
  })
}
