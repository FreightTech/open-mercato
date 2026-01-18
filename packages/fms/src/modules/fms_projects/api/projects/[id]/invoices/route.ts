/**
 * FMS Projects - Invoices API
 * Manage extracted invoices for a specific project
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject, FmsProjectInvoice } from '../../../../data/entities'
import { fmsProjectInvoiceReviewSchema } from '../../../../data/validators'
import { z } from 'zod'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_projects.projects.view'],
  },
  PUT: {
    requireAuth: true,
    requireFeatures: ['fms_projects.projects.manage'],
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET - List invoices for a specific project
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const projectId = params.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify project exists and user has access
    const project = await em.findOne(FmsProject, {
      id: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'pending_review' | 'approved' | 'rejected' | null

    // Build filters
    const filters: Record<string, any> = {
      project: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    }

    if (status) {
      filters.status = status
    }

    // Query invoices
    const invoices = await em.find(FmsProjectInvoice, filters, {
      orderBy: { createdAt: 'DESC' },
    })

    // Calculate totals
    const totals = {
      totalNet: 0,
      totalVat: 0,
      totalGross: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
    }

    const items = invoices.map((invoice) => {
      // Update totals
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
  } catch (error: any) {
    console.error('[fms-projects:invoices] list error:', error)
    return NextResponse.json(
      { error: 'Failed to list invoices', message: error.message },
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

    const params = await context.params
    const projectId = params.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify project exists and user has access
    const project = await em.findOne(FmsProject, {
      id: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Parse body
    const body = await request.json()
    const data = fmsProjectInvoiceReviewSchema.parse(body)

    // Find the invoice
    const invoice = await em.findOne(FmsProjectInvoice, {
      id: data.id,
      project: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Update the invoice
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
  } catch (error: any) {
    console.error('[fms-projects:invoices] update error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Update failed', message: error.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
