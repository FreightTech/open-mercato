import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingInvoice } from '../../../../data/entities'
import { emitInvoicingEvent } from '../../../../events'
import type { SubmitPayload } from '../../../../workers/ksef-submit'

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
    invoice.ksefStatus = 'queued'
    invoice.updatedAt = new Date()
    await em.flush()

    const { createQueue } = await import('@open-mercato/queue')
    const submitQueue = createQueue<SubmitPayload>('invoicing-ksef-submit', 'local')
    await submitQueue.enqueue({
      invoiceId: invoice.id,
      tenantId,
      organizationId: invoice.organizationId,
    })

    await emitInvoicingEvent('invoicing.ksef.queued', {
      id: invoice.id,
      tenantId,
      organizationId: invoice.organizationId,
      invoiceNumber: invoice.invoiceNumber,
      direction: invoice.direction,
      sourceType: invoice.sourceType,
    })

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
  tag: 'Invoicing - KSeF',
  summary: 'Submit to KSeF',
  methods: {
    POST: {
      summary: 'Submit a single invoice to KSeF',
      description: 'Queue an approved invoice for submission to the Polish KSeF system',
    },
  },
}
