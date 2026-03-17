import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { FmsInvoicingInvoice, FmsInvoicingSettings } from '../data/entities'
import { createFmsLogger } from '../../../lib/logger'
import type { InvoiceEventPayload } from '../events'

const logger = createFmsLogger('fms_invoicing.auto_submit_to_ksef')

export const metadata = {
  event: 'fms_invoicing.invoice.approved',
  persistent: true,
  id: 'fms_invoicing.auto_submit_to_ksef',
}

export default async function handle(
  payload: InvoiceEventPayload,
  context?: SubscriberContext
): Promise<void> {
  const invoiceId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!invoiceId || !tenantId || !organizationId) {
    logger.warn('missing_required_fields', {
      invoiceId,
      tenantId: !!tenantId,
      organizationId: !!organizationId,
    })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), {
      invoiceId,
    })
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Check if auto-submit to KSeF is enabled
    const settings = await em.findOne(FmsInvoicingSettings, { tenantId, organizationId })
    if (!settings || !settings.ksefAutoSubmit) {
      logger.debug('ksef_auto_submit_disabled', { tenantId, organizationId })
      return
    }

    // Verify invoice exists and is in the right state
    const invoice = await em.findOne(FmsInvoicingInvoice, {
      id: invoiceId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!invoice) {
      logger.warn('invoice_not_found', { invoiceId })
      return
    }

    // Only submit outgoing invoices
    if (invoice.direction !== 'outgoing') {
      logger.debug('skipping_non_outgoing', {
        invoiceId,
        direction: invoice.direction,
      })
      return
    }

    // Only submit if not already queued/submitted/accepted
    if (invoice.ksefStatus !== 'none') {
      logger.debug('invoice_already_has_ksef_status', {
        invoiceId,
        ksefStatus: invoice.ksefStatus,
      })
      return
    }

    // Update KSeF status to queued
    invoice.ksefStatus = 'queued'
    await em.persist(invoice).flush()

    // Enqueue the KSeF submit worker
    const { createQueue } = await import('@open-mercato/queue')
    const submitQueue = createQueue<{
      invoiceId: string
      tenantId: string
      organizationId: string
    }>('fms-invoicing-ksef-submit', 'local')

    await submitQueue.enqueue({
      invoiceId,
      tenantId,
      organizationId,
    })

    logger.info('ksef_submit_enqueued', {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
    })
  } catch (error) {
    logger.error('auto_submit_failed', error, { invoiceId })

    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { invoiceId })
      return
    }

    throw error
  }
}
