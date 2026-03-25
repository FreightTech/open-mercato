/**
 * FMS Files - Invoices API
 * Manage extracted invoices for a specific file
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile, FmsFileInvoice } from '../../../../data/entities'
import { fmsFileInvoiceReviewSchema } from '../../../../data/validators'
import { z } from 'zod'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_files.invoices.view'],
  },
  PUT: {
    requireAuth: true,
    requireFeatures: ['fms_files.invoices.manage'],
  },
}

export const openApi = {
  GET: {
    summary: 'List invoices for a file',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['pending_review', 'approved', 'rejected'] } },
    ],
    responses: { 200: { description: 'Invoices list with totals' }, 401: { description: 'Unauthorized' } },
  },
  PUT: {
    summary: 'Review (approve/reject) an invoice',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'Updated invoice' }, 401: { description: 'Unauthorized' } },
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

const paramsSchema = z.object({ id: z.string().uuid() })

/**
 * GET - List invoices for a specific file
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawParams = await context.params
    const parse = paramsSchema.safeParse({ id: rawParams.id })
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })
    }

    const fileId = parse.data.id

    const file = await em.findOne(FmsFile, {
      id: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'pending_review' | 'approved' | 'rejected' | null

    const filters: Record<string, unknown> = {
      file: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    }

    if (status) {
      filters.status = status
    }

    const invoices = await em.find(FmsFileInvoice, filters, {
      orderBy: { createdAt: 'DESC' },
    })

    const totals = {
      totalNet: 0,
      totalVat: 0,
      totalGross: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
    }

    const items = invoices.map((invoice) => {
      if (invoice.status === 'approved') {
        totals.approvedCount++
        if (invoice.netAmount) totals.totalNet += parseFloat(invoice.netAmount)
        if (invoice.vatAmount) totals.totalVat += parseFloat(invoice.vatAmount)
        if (invoice.grossAmount) totals.totalGross += parseFloat(invoice.grossAmount)
      } else if (invoice.status === 'pending_review') {
        totals.pendingCount++
      } else {
        totals.rejectedCount++
      }

      return {
        id: invoice.id,
        documentId: invoice.documentId,
        invoiceNumber: invoice.invoiceNumber,
        sellerName: invoice.sellerName,
        sellerNip: invoice.sellerNip,
        buyerName: invoice.buyerName,
        buyerNip: invoice.buyerNip,
        netAmount: invoice.netAmount,
        vatAmount: invoice.vatAmount,
        grossAmount: invoice.grossAmount,
        currencyCode: invoice.currencyCode,
        invoiceDate: invoice.invoiceDate,
        paymentDueDate: invoice.paymentDueDate,
        paymentMethod: invoice.paymentMethod,
        lineItems: invoice.lineItems,
        confidence: invoice.confidence,
        status: invoice.status,
        reviewedBy: invoice.reviewedBy,
        reviewedAt: invoice.reviewedAt,
        reviewNotes: invoice.reviewNotes,
        createdAt: invoice.createdAt,
      }
    })

    return NextResponse.json({
      ok: true,
      items,
      totals,
      count: items.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fms-files:invoices] list error:', error)
    return NextResponse.json(
      { error: 'Failed to list invoices', message },
      { status: 500 }
    )
  }
}

/**
 * PUT - Review/update an invoice
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawParams = await context.params
    const parse = paramsSchema.safeParse({ id: rawParams.id })
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })
    }

    const fileId = parse.data.id

    const file = await em.findOne(FmsFile, {
      id: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const body = await request.json()
    const data = fmsFileInvoiceReviewSchema.parse(body)

    const invoice = await em.findOne(FmsFileInvoice, {
      id: data.id,
      file: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    invoice.status = data.status
    invoice.reviewNotes = data.reviewNotes ?? null
    invoice.reviewedBy = auth.sub ?? null
    invoice.reviewedAt = new Date()
    invoice.updatedAt = new Date()

    await em.flush()

    return NextResponse.json({
      ok: true,
      item: {
        id: invoice.id,
        status: invoice.status,
        reviewedBy: invoice.reviewedBy,
        reviewedAt: invoice.reviewedAt,
        reviewNotes: invoice.reviewNotes,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fms-files:invoices] update error:', error)

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Update failed', message },
      { status: 500 }
    )
  }
}
