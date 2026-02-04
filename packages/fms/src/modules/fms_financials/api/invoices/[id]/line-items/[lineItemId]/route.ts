import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { z } from 'zod'
import { FmsInvoice, FmsInvoiceLineItem } from '../../../../../data/entities'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_financials.invoices.view'] },
  PATCH: { requireAuth: true, requireFeatures: ['fms_financials.invoices.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_financials.invoices.manage'] },
}

export const metadata = routeMetadata

type RouteContext = { params: Promise<{ id: string; lineItemId: string }> }

const updateLineItemSchema = z.object({
  description: z.string().optional(),
  quantity: z.string().optional(),
  unit: z.string().nullable().optional(),
  unitPriceNet: z.string().optional(),
  vatRate: z.string().optional(),
  netAmount: z.string().optional(),
  vatAmount: z.string().optional(),
  grossAmount: z.string().optional(),
})

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, lineItemId } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  // First verify the invoice exists and belongs to the user
  const invoice = await em.findOne(FmsInvoice, {
    id,
    tenantId,
    organizationId: { $in: allowedOrgIds },
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const lineItem = await em.findOne(
    FmsInvoiceLineItem,
    { id: lineItemId, invoice },
    { populate: ['chargeCode'] }
  )

  if (!lineItem) {
    return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
  }

  return NextResponse.json({
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
    chargeCodeId: lineItem.chargeCode?.id ?? null,
    chargeCodeName: lineItem.chargeCode?.name ?? null,
    chargeCode: lineItem.chargeCode?.code ?? null,
    chargeCodeMatchConfidence: lineItem.chargeCodeMatchConfidence,
    rawDescription: lineItem.rawDescription,
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, lineItemId } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = updateLineItemSchema.safeParse(body)

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

  const lineItem = await em.findOne(FmsInvoiceLineItem, {
    id: lineItemId,
    invoice,
  })

  if (!lineItem) {
    return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
  }

  // Update fields
  const data = parse.data
  if (data.description !== undefined) lineItem.description = data.description
  if (data.quantity !== undefined) lineItem.quantity = data.quantity
  if (data.unit !== undefined) lineItem.unit = data.unit
  if (data.unitPriceNet !== undefined) lineItem.unitPriceNet = data.unitPriceNet
  if (data.vatRate !== undefined) lineItem.vatRate = data.vatRate
  if (data.netAmount !== undefined) lineItem.netAmount = data.netAmount
  if (data.vatAmount !== undefined) lineItem.vatAmount = data.vatAmount
  if (data.grossAmount !== undefined) lineItem.grossAmount = data.grossAmount

  // Also update invoice totals
  await em.flush()

  // Recalculate invoice totals from line items
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
    },
    invoiceTotals: {
      netAmount: invoice.netAmount,
      vatAmount: invoice.vatAmount,
      grossAmount: invoice.grossAmount,
    },
  })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, lineItemId } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const lineItem = await em.findOne(FmsInvoiceLineItem, {
    id: lineItemId,
    invoice,
  })

  if (!lineItem) {
    return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
  }

  // Remove the line item
  await em.removeAndFlush(lineItem)

  // Recalculate invoice totals
  const remainingLineItems = await em.find(FmsInvoiceLineItem, { invoice })
  let totalNet = 0
  let totalVat = 0
  let totalGross = 0

  for (const li of remainingLineItems) {
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
    invoiceTotals: {
      netAmount: invoice.netAmount,
      vatAmount: invoice.vatAmount,
      grossAmount: invoice.grossAmount,
    },
  })
}
