import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { InvoicingInvoice, InvoicingSettings } from '../data/entities'
import { createInvoicingLogger } from '../../../lib/logger'
import { getInvoiceStatusUrl } from '../lib/ksef/endpoints'
import { resolveKsefStatus, isTerminalStatus, getProcessingDescription } from '../lib/ksef/status-codes'
import type { KsefInvoiceStatusResponse } from '../lib/ksef/types'
import { emitInvoicingEvent } from '../events'
import type { InvoiceEventPayload } from '../events'

export const STATUS_POLL_QUEUE_NAME = 'invoicing-ksef-status-poll'

export const metadata: WorkerMeta = {
  queue: STATUS_POLL_QUEUE_NAME,
  concurrency: 5,
  id: 'invoicing-ksef-status-poll',
}

export type StatusPollPayload = {
  invoiceId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
  attempt?: number
}

const logger = createInvoicingLogger('invoicing.ksef_status_poll')

const MAX_POLL_ATTEMPTS = 20
const BASE_DELAY_MS = 5000
const MAX_DELAY_MS = 300000

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<StatusPollPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { invoiceId, referenceNumber, tenantId, organizationId } = job.payload
  const attempt = job.payload.attempt ?? 1

  logger.info('polling_status', { invoiceId, referenceNumber, attempt })

  const invoice = await em.findOne(InvoicingInvoice, {
    id: invoiceId,
    tenantId,
    organizationId,
    deletedAt: null,
  })

  if (!invoice) {
    logger.warn('invoice_not_found', { invoiceId })
    return
  }

  // Skip if invoice is already in a terminal KSeF status
  if (['accepted', 'rejected', 'upo_downloaded', 'cancelled'].includes(invoice.ksefStatus)) {
    logger.info('invoice_already_terminal', {
      invoiceId,
      ksefStatus: invoice.ksefStatus,
    })
    return
  }

  if (attempt > MAX_POLL_ATTEMPTS) {
    invoice.ksefStatus = 'error'
    invoice.ksefErrorMessage = `Status poll timed out after ${MAX_POLL_ATTEMPTS} attempts`
    await em.persist(invoice).flush()

    logger.error('poll_timeout', new Error('Max poll attempts exceeded'), {
      invoiceId,
      referenceNumber,
      attempt,
    })

    await emitInvoicingEvent('invoicing.ksef.error', buildEventPayload(invoice))
    return
  }

  try {
    const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
    if (!settings) {
      throw new Error('Invoicing settings not configured')
    }

    const statusUrl = getInvoiceStatusUrl(settings.ksefEnvironment, referenceNumber)
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text()
      throw new Error(`KSeF status poll failed (${statusResponse.status}): ${errorBody}`)
    }

    const statusResult = (await statusResponse.json()) as KsefInvoiceStatusResponse
    const resolvedStatus = resolveKsefStatus(statusResult.processingCode)
    const processingDescription = getProcessingDescription(statusResult.processingCode)

    logger.info('status_received', {
      invoiceId,
      referenceNumber,
      processingCode: statusResult.processingCode,
      resolvedStatus,
      processingDescription,
    })

    if (resolvedStatus === 'accepted') {
      invoice.ksefStatus = 'accepted'
      invoice.ksefNumber = statusResult.ksefReferenceNumber ?? null
      invoice.ksefAcceptedAt = statusResult.acquisitionTimestamp
        ? new Date(statusResult.acquisitionTimestamp)
        : new Date()
      invoice.ksefErrorMessage = null
      invoice.ksefErrorCode = null

      await em.persist(invoice).flush()

      logger.info('invoice_accepted', {
        invoiceId,
        ksefNumber: invoice.ksefNumber,
        ksefAcceptedAt: invoice.ksefAcceptedAt,
      })

      await emitInvoicingEvent('invoicing.ksef.accepted', buildEventPayload(invoice))
      return
    }

    if (resolvedStatus === 'rejected') {
      invoice.ksefStatus = 'rejected'
      invoice.ksefErrorMessage = processingDescription
      invoice.ksefErrorCode = String(statusResult.processingCode)

      await em.persist(invoice).flush()

      logger.warn('invoice_rejected', {
        invoiceId,
        processingCode: statusResult.processingCode,
        processingDescription,
      })

      await emitInvoicingEvent('invoicing.ksef.rejected', buildEventPayload(invoice))
      return
    }

    if (resolvedStatus === 'error') {
      invoice.ksefStatus = 'error'
      invoice.ksefErrorMessage = processingDescription
      invoice.ksefErrorCode = String(statusResult.processingCode)

      await em.persist(invoice).flush()

      logger.error('invoice_error', new Error(processingDescription), {
        invoiceId,
        processingCode: statusResult.processingCode,
      })

      await emitInvoicingEvent('invoicing.ksef.error', buildEventPayload(invoice))
      return
    }

    // Still processing - re-enqueue with exponential backoff
    const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)

    logger.info('still_processing_requeue', {
      invoiceId,
      referenceNumber,
      nextAttempt: attempt + 1,
      delayMs,
    })

    // Wait before re-enqueuing (simple delay for backoff)
    await new Promise((resolve) => setTimeout(resolve, delayMs))

    const { createQueue } = await import('@open-mercato/queue')
    const pollQueue = createQueue<StatusPollPayload>(STATUS_POLL_QUEUE_NAME, 'local')
    await pollQueue.enqueue({
      invoiceId,
      referenceNumber,
      tenantId,
      organizationId,
      attempt: attempt + 1,
    })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    logger.error('poll_failed', err, {
      invoiceId,
      referenceNumber,
      attempt,
    })

    // On transient errors, re-enqueue if under max attempts
    if (attempt < MAX_POLL_ATTEMPTS) {
      const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, delayMs))

      const { createQueue } = await import('@open-mercato/queue')
      const pollQueue = createQueue<StatusPollPayload>(STATUS_POLL_QUEUE_NAME, 'local')
      await pollQueue.enqueue({
        invoiceId,
        referenceNumber,
        tenantId,
        organizationId,
        attempt: attempt + 1,
      })
      return
    }

    invoice.ksefStatus = 'error'
    invoice.ksefErrorMessage = errorMessage
    await em.persist(invoice).flush()

    await emitInvoicingEvent('invoicing.ksef.error', buildEventPayload(invoice))

    throw err
  }
}

function buildEventPayload(invoice: InvoicingInvoice): InvoiceEventPayload {
  return {
    id: invoice.id,
    tenantId: invoice.tenantId,
    organizationId: invoice.organizationId,
    invoiceNumber: invoice.invoiceNumber,
    direction: invoice.direction,
    sourceType: invoice.sourceType,
  }
}
