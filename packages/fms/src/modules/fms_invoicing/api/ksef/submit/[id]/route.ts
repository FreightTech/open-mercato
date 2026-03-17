import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingInvoice } from '../../../../data/entities'

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

  if (invoice.status !== 'approved') {
    return NextResponse.json(
      { error: 'Invoice must be approved before submitting to KSeF' },
      { status: 400 }
    )
  }

  if (invoice.ksefStatus !== 'none' && invoice.ksefStatus !== 'error' && invoice.ksefStatus !== 'cancelled') {
    return NextResponse.json(
      { error: `Invoice already has KSeF status: ${invoice.ksefStatus}` },
      { status: 400 }
    )
  }

  try {
    // TODO: Sprint 4 - Wire up KSeF service for actual submission
    // const ksefService = container.resolve('fmsInvoicingService') as InvoicingService
    // const result = await ksefService.submitToKsef(invoice, { container, auth })

    // For now, queue the invoice for KSeF submission
    invoice.ksefStatus = 'queued'
    invoice.updatedAt = new Date()
    await em.flush()

    return NextResponse.json({
      id: invoice.id,
      ksefStatus: invoice.ksefStatus,
      message: 'Invoice queued for KSeF submission',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit invoice to KSeF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing - KSeF',
  summary: 'Submit to KSeF',
  methods: {
    POST: {
      summary: 'Submit a single invoice to KSeF',
      description: 'Queue an approved invoice for submission to the Polish KSeF system',
    },
  },
}
