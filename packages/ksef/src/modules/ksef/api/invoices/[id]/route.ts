import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefInvoice, KsefInvoiceLineItem, KsefSubmission } from '../../../data/entities'
import { ksefInvoiceUpdateSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.view'] },
  PUT: { requireAuth: true, requireFeatures: ['ksef.submit'] },
  DELETE: { requireAuth: true, requireFeatures: ['ksef.submit'] },
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

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const invoice = await em.findOne(KsefInvoice, {
    id,
    tenantId,
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const lineItems = await em.find(
    KsefInvoiceLineItem,
    { invoice: id },
    { orderBy: { lineNumber: 'asc' } }
  )

  // Get linked submission if exists
  const submission = await em.findOne(KsefSubmission, {
    ksefInvoiceId: id,
    tenantId,
  })

  return NextResponse.json({
    ...invoice,
    lineItems,
    _ksef: submission ? {
      submissionId: submission.id,
      status: submission.status,
      ksefNumber: submission.ksefNumber,
      referenceNumber: submission.ksefReferenceNumber,
      submittedAt: submission.submittedAt,
      acceptedAt: submission.acceptedAt,
      errorMessage: submission.errorMessage,
      errorCode: submission.errorCode,
    } : null,
  })
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
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

  const invoice = await em.findOne(KsefInvoice, {
    id,
    tenantId,
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // NOTE: When a full workflow (draft → approved → submitted) is added,
  // check invoice status here to prevent editing approved/submitted invoices.

  const body = await request.json()
  const parsed = ksefInvoiceUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { lineItems: lineItemsData, ...updateData } = parsed.data

  // Update invoice fields
  if (updateData.invoiceNumber !== undefined) invoice.invoiceNumber = updateData.invoiceNumber
  if (updateData.invoiceDate !== undefined) invoice.invoiceDate = updateData.invoiceDate ? new Date(updateData.invoiceDate) : null
  if (updateData.dueDate !== undefined) invoice.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null
  if (updateData.serviceDate !== undefined) invoice.serviceDate = updateData.serviceDate ? new Date(updateData.serviceDate) : null
  if (updateData.sellerName !== undefined) invoice.sellerName = updateData.sellerName
  if (updateData.sellerTaxId !== undefined) invoice.sellerTaxId = updateData.sellerTaxId
  if (updateData.sellerAddress !== undefined) invoice.sellerAddress = updateData.sellerAddress
  if (updateData.sellerCountryCode !== undefined) invoice.sellerCountryCode = updateData.sellerCountryCode
  if (updateData.sellerBankAccount !== undefined) invoice.sellerBankAccount = updateData.sellerBankAccount
  if (updateData.buyerName !== undefined) invoice.buyerName = updateData.buyerName
  if (updateData.buyerTaxId !== undefined) invoice.buyerTaxId = updateData.buyerTaxId
  if (updateData.buyerAddress !== undefined) invoice.buyerAddress = updateData.buyerAddress
  if (updateData.buyerCountryCode !== undefined) invoice.buyerCountryCode = updateData.buyerCountryCode
  if (updateData.grossAmount !== undefined) invoice.grossAmount = String(updateData.grossAmount)
  if (updateData.netAmount !== undefined) invoice.netAmount = String(updateData.netAmount)
  if (updateData.vatAmount !== undefined) invoice.vatAmount = String(updateData.vatAmount)
  if (updateData.currencyCode !== undefined) invoice.currencyCode = updateData.currencyCode
  if (updateData.paymentMethod !== undefined) invoice.paymentMethod = updateData.paymentMethod
  if (updateData.invoiceType !== undefined) invoice.invoiceType = updateData.invoiceType
  if (updateData.correctedInvoiceId !== undefined) invoice.correctedInvoiceId = updateData.correctedInvoiceId
  if (updateData.correctionReason !== undefined) invoice.correctionReason = updateData.correctionReason

  // Replace line items if provided
  if (lineItemsData) {
    const existingLines = await em.find(KsefInvoiceLineItem, { invoice: id })
    for (const line of existingLines) {
      em.remove(line)
    }

    for (const li of lineItemsData) {
      const lineItem = em.create(KsefInvoiceLineItem, {
        invoice,
        lineNumber: li.lineNumber,
        description: li.description,
        quantity: String(li.quantity),
        unit: li.unit,
        unitPriceNet: String(li.unitPriceNet),
        netAmount: String(li.netAmount),
        vatAmount: String(li.vatAmount),
        vatRate: li.vatRate,
        vatRateCode: li.vatRateCode,
        gtuCode: li.gtuCode,
      })
      em.persist(lineItem)
    }
  }

  await em.flush()

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
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

  const invoice = await em.findOne(KsefInvoice, {
    id,
    tenantId,
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Check if there's an active submission
  const submission = await em.findOne(KsefSubmission, {
    ksefInvoiceId: id,
    tenantId,
    status: { $in: ['queued', 'submitted', 'processing'] },
  })

  if (submission) {
    return NextResponse.json(
      { error: 'Cannot delete invoice with active KSeF submission' },
      { status: 400 }
    )
  }

  invoice.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ ok: true })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Invoice detail',
  methods: {
    GET: {
      summary: 'Get KSeF invoice detail',
      description: 'Returns invoice with line items and KSeF submission status',
    },
    PUT: {
      summary: 'Update KSeF invoice',
      description: 'Update an existing KSeF invoice and its line items',
    },
    DELETE: {
      summary: 'Delete KSeF invoice',
      description: 'Soft-delete a KSeF invoice (cannot delete if submission is active)',
    },
  },
}
