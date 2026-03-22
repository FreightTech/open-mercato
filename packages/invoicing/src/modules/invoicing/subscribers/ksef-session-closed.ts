import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { InvoicingKsefSession } from '../data/entities'
import { createInvoicingLogger } from '../../../lib/logger'
import type { KsefSessionEventPayload } from '../events'

const logger = createInvoicingLogger('invoicing.ksef_session_closed')

export const metadata = {
  event: 'invoicing.ksef.session_closed',
  persistent: true,
  id: 'invoicing.ksef_session_closed',
}

export default async function handle(
  payload: KsefSessionEventPayload,
  context?: SubscriberContext
): Promise<void> {
  const sessionId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!sessionId || !tenantId || !organizationId) {
    logger.warn('missing_required_fields', {
      sessionId,
      tenantId: !!tenantId,
      organizationId: !!organizationId,
    })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), {
      sessionId,
    })
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Load the session to get the reference number
    const session = await em.findOne(InvoicingKsefSession, {
      id: sessionId,
      tenantId,
      organizationId,
    })

    if (!session) {
      logger.warn('session_not_found', { sessionId })
      return
    }

    // Skip if UPO is already downloaded
    if (session.upoXml) {
      logger.debug('upo_already_downloaded', { sessionId })
      return
    }

    const referenceNumber = session.ksefReferenceNumber
    if (!referenceNumber) {
      logger.warn('session_missing_reference_number', { sessionId })
      return
    }

    // Enqueue UPO download worker
    const { createQueue } = await import('@open-mercato/queue')
    const upoQueue = createQueue<{
      sessionId: string
      referenceNumber: string
      tenantId: string
      organizationId: string
    }>('invoicing-ksef-upo-download', 'local')

    await upoQueue.enqueue({
      sessionId,
      referenceNumber,
      tenantId,
      organizationId,
    })

    logger.info('upo_download_enqueued', {
      sessionId,
      referenceNumber,
    })
  } catch (error) {
    logger.error('session_closed_handler_failed', error, { sessionId })

    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { sessionId })
      return
    }

    throw error
  }
}
