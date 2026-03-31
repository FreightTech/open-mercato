import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { KsefSubmission, KsefInvoice } from '../data/entities'
import { emitKsefEvent } from '../events'

export const metadata = {
  event: 'ksef.invoice.created',
  persistent: true,
  id: 'ksef.auto_submit_on_creation',
}

interface InvoiceCreatedPayload {
  id: string
  tenantId: string
  organizationId: string
  direction?: string
  [key: string]: unknown
}

export default async function handle(
  payload: InvoiceCreatedPayload,
  context?: SubscriberContext
): Promise<void> {
  const ksefInvoiceId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!ksefInvoiceId || !tenantId || !organizationId) {
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
    const autoSubmit = (state as Record<string, unknown>).autoSubmit
    if (!autoSubmit) {
      return
    }

    // Only submit outgoing invoices
    const invoice = await em.findOne(KsefInvoice, {
      id: ksefInvoiceId,
      deletedAt: null,
    })

    if (!invoice || invoice.direction !== 'outgoing') {
      return
    }

    // Check if a submission already exists
    const existing = await em.findOne(KsefSubmission, {
      ksefInvoiceId,
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
      ksefInvoiceId,
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
