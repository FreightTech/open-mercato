import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefSubmission } from '../../../data/entities'
import { emitKsefEvent } from '../../../events'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.submit'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: invoiceId } = await context.params
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

  // Verify the invoice exists and is approved (via raw query — cross-module)
  const knex = (em as unknown as { getConnection: () => { getKnex: () => unknown } }).getConnection().getKnex()
  const invoiceRow = await (knex as any)('fms_invoicing_invoices')
    .select('id', 'status', 'invoice_number', 'organization_id')
    .where('id', invoiceId)
    .where('tenant_id', tenantId)
    .whereNull('deleted_at')
    .first()

  if (!invoiceRow) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (invoiceRow.status !== 'approved') {
    return NextResponse.json(
      { error: 'Invoice must be approved before submitting to KSeF' },
      { status: 400 }
    )
  }

  // Check if a submission already exists
  const existing = await em.findOne(KsefSubmission, {
    invoiceId,
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
      invoiceId,
    })

    submission.status = 'queued'
    submission.errorMessage = null
    submission.errorCode = null
    em.persist(submission)
    await em.flush()

    const { createQueue } = await import('@open-mercato/queue')
    const submitQueue = createQueue<{
      invoiceId: string
      submissionId: string
      tenantId: string
      organizationId: string
    }>('ksef-submit', 'local')

    await submitQueue.enqueue({
      invoiceId,
      submissionId: submission.id,
      tenantId,
      organizationId,
    })

    await emitKsefEvent('ksef.submission.queued', {
      id: submission.id,
      invoiceId,
      tenantId,
      organizationId,
      status: 'queued',
    })

    return NextResponse.json({
      submissionId: submission.id,
      invoiceId,
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
      description: 'Queue an approved invoice for submission to the Polish KSeF system',
    },
  },
}
