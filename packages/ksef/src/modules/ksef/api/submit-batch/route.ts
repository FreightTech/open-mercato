import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefSubmission } from '../../data/entities'
import { submitBatchSchema } from '../../data/validators'
import { emitKsefEvent } from '../../events'

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

  const body = await request.json()
  const parsed = submitBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { invoiceIds } = parsed.data

  // Verify invoices exist and are approved
  const knex = (em as unknown as { getConnection: () => { getKnex: () => unknown } }).getConnection().getKnex()
  const invoiceRows = await (knex as any)('fms_invoicing_invoices')
    .select('id', 'status', 'invoice_number')
    .whereIn('id', invoiceIds)
    .where('tenant_id', tenantId)
    .whereNull('deleted_at')

  const invoiceMap = new Map<string, { id: string; status: string; invoice_number: string }>()
  for (const row of invoiceRows) {
    invoiceMap.set(row.id, row)
  }

  const queued: string[] = []
  const skipped = {
    notFound: [] as string[],
    notApproved: [] as string[],
    alreadySubmitted: [] as string[],
  }

  for (const invoiceId of invoiceIds) {
    const invoice = invoiceMap.get(invoiceId)
    if (!invoice) {
      skipped.notFound.push(invoiceId)
      continue
    }
    if (invoice.status !== 'approved') {
      skipped.notApproved.push(invoiceId)
      continue
    }

    const existing = await em.findOne(KsefSubmission, {
      invoiceId,
      tenantId,
      organizationId,
    })

    if (existing && !['none', 'error', 'cancelled'].includes(existing.status)) {
      skipped.alreadySubmitted.push(invoiceId)
      continue
    }

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

    queued.push(invoiceId)
  }

  return NextResponse.json({
    queued,
    queuedCount: queued.length,
    skipped,
    total: invoiceIds.length,
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Batch submit',
  methods: {
    POST: {
      summary: 'Submit multiple invoices to KSeF',
      description: 'Queue multiple approved invoices for KSeF submission in batch',
    },
  },
}
