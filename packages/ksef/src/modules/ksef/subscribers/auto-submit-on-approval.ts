import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { KsefSubmission } from '../data/entities'
import { emitKsefEvent } from '../events'

export const metadata = {
  event: 'fms_invoicing.invoice.approved',
  persistent: true,
  id: 'ksef.auto_submit_on_approval',
}

interface InvoiceApprovedPayload {
  id: string
  tenantId: string
  organizationId: string
  invoiceNumber?: string
  direction?: string
  [key: string]: unknown
}

export default async function handle(
  payload: InvoiceApprovedPayload,
  context?: SubscriberContext
): Promise<void> {
  const invoiceId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!invoiceId || !tenantId || !organizationId) {
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Check if KSeF integration is enabled and auto-submit is configured
    const { createIntegrationStateService } = await import('@open-mercato/core/modules/integrations/lib/state-service')
    const stateService = createIntegrationStateService(em)
    const state = await stateService.get('ksef', { tenantId, organizationId })

    if (!state || !state.isEnabled) {
      return
    }

    // Check auto-submit setting from integration state metadata
    const autoSubmit = (state as unknown as Record<string, unknown>).autoSubmit
    if (!autoSubmit) {
      return
    }

    // Only submit outgoing invoices — load invoice direction via raw query
    const knex = (em as unknown as { getConnection: () => { getKnex: () => unknown } }).getConnection().getKnex()
    const invoiceRow = await (knex as any)('fms_invoicing_invoices')
      .select('direction')
      .where('id', invoiceId)
      .whereNull('deleted_at')
      .first()

    if (!invoiceRow || invoiceRow.direction !== 'outgoing') {
      return
    }

    // Check if a submission already exists
    const existing = await em.findOne(KsefSubmission, {
      invoiceId,
      tenantId,
      organizationId,
    })

    if (existing && existing.status !== 'none') {
      return
    }

    // Create KsefSubmission with queued status
    const submission = existing ?? em.create(KsefSubmission, {
      organizationId,
      tenantId,
      invoiceId,
    })

    submission.status = 'queued'
    em.persist(submission)
    await em.flush()

    // Enqueue the KSeF submit worker
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      return
    }

    throw error
  }
}
