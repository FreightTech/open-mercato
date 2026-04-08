import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefSubmission, KsefInvoice } from '../../../data/entities'
import { emitKsefEvent } from '../../../events'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.submit'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: ksefInvoiceId } = await context.params
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

  // Verify the KSeF invoice exists and is outgoing
  const invoice = await em.findOne(KsefInvoice, {
    id: ksefInvoiceId,
    tenantId,
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (invoice.direction !== 'outgoing') {
    return NextResponse.json(
      { error: 'Only outgoing invoices can be submitted to KSeF' },
      { status: 400 }
    )
  }

  // Check if a submission already exists
  const existing = await em.findOne(KsefSubmission, {
    ksefInvoiceId,
    tenantId,
    organizationId,
  })

  if (existing && !['none', 'error', 'cancelled'].includes(existing.status)) {
    return NextResponse.json(
      { error: `Invoice already has KSeF submission status: ${existing.status}` },
      { status: 400 }
    )
  }

  try {
    const submission = existing ?? em.create(KsefSubmission, {
      organizationId,
      tenantId,
      ksefInvoiceId,
    })

    submission.status = 'queued'
    submission.errorMessage = null
    submission.errorCode = null
    em.persist(submission)
    await em.flush()

    const { createQueue } = await import('@open-mercato/queue')
    const { getRedisUrl } = await import('@open-mercato/shared/lib/redis/connection')
    const queueStrategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
    const submitQueue = createQueue<{
      invoiceId: string
      submissionId: string
      tenantId: string
      organizationId: string
    }>('ksef-submit', queueStrategy, {
      connection: queueStrategy === 'async' ? { url: getRedisUrl('QUEUE') } : undefined,
    })

    await submitQueue.enqueue({
      invoiceId: ksefInvoiceId,
      submissionId: submission.id,
      tenantId,
      organizationId,
    })

    await emitKsefEvent('ksef.submission.queued', {
      id: submission.id,
      invoiceId: ksefInvoiceId,
      tenantId,
      organizationId,
      status: 'queued',
    })

    return NextResponse.json({
      submissionId: submission.id,
      invoiceId: ksefInvoiceId,
      status: 'queued',
      message: 'Invoice queued for KSeF submission',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit invoice to KSeF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Submit to KSeF',
  methods: {
    POST: {
      summary: 'Submit a single invoice to KSeF',
      description: 'Queue a KSeF invoice for submission to the Polish KSeF system',
    },
  },
}
