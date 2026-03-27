import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { InvoicingInvoice, InvoicingKsefSession, InvoicingLineItem, InvoicingSettings } from '../data/entities'
import { createInvoicingLogger } from '../../../lib/logger'
import { prepareInvoiceForSubmission } from '../lib/ksef/crypto'
import { getSendInvoiceUrl } from '../lib/ksef/endpoints'
import { buildFa3Xml } from '../lib/ksef/xml-builder'
import type { KsefSendInvoiceResponse } from '../lib/ksef/types'
import type { KsefAuthService } from '../services/ksef/auth.service'

export const SUBMIT_QUEUE_NAME = 'invoicing-ksef-submit'

export const metadata: WorkerMeta = {
  queue: SUBMIT_QUEUE_NAME,
  concurrency: 3,
  id: 'invoicing-ksef-submit',
}

export type SubmitPayload = {
  invoiceId: string
  tenantId: string
  organizationId: string
}

const logger = createInvoicingLogger('invoicing.ksef_submit')

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<SubmitPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { invoiceId, tenantId, organizationId } = job.payload

  logger.info('starting_submission', { invoiceId, tenantId, organizationId })

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

  if (invoice.ksefStatus !== 'queued') {
    logger.warn('invoice_not_queued', {
      invoiceId,
      currentStatus: invoice.ksefStatus,
    })
    return
  }

  try {
    const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
    if (!settings) {
      throw new Error('Invoicing settings not configured for this tenant')
    }

    const sellerNip = invoice.sellerTaxId ?? settings.defaultSellerNip
    if (!sellerNip) {
      throw new Error('Seller NIP is required for KSeF submission')
    }

    const lineItems = await em.find(
      InvoicingLineItem,
      { invoice: invoiceId },
      { orderBy: { lineNumber: 'asc' } }
    )

    if (lineItems.length === 0) {
      invoice.ksefStatus = 'error'
      invoice.ksefErrorMessage = 'Invoice has no line items'
      await em.persist(invoice).flush()
      logger.warn('no_line_items', { invoiceId })
      return
    }

    // Get or create a KSeF session
    let session = await em.findOne(InvoicingKsefSession, {
      tenantId,
      organizationId,
      nip: sellerNip,
      sessionStatus: 'active',
    })

    let accessToken: string

    if (!session) {
      const authService = ctx.resolve<KsefAuthService>('invoicingKsefAuthService')
      const authResult = await authService.authenticate(em, {
        tenantId,
        organizationId,
        nip: sellerNip,
        environment: settings.ksefEnvironment,
      })
      session = authResult.session
      accessToken = authResult.accessToken
    } else {
      accessToken = session.sessionToken ?? ''
    }

    // Generate FA(3) XML for the invoice
    const invoiceXml = buildFa3Xml(invoice, lineItems)
    invoice.ksefFaXml = invoiceXml

    // Prepare invoice for submission (encrypt if session has encryption keys)
    const sessionKey = session.encryptionKey ? Buffer.from(session.encryptionKey, 'base64') : undefined
    const sessionIv = session.encryptionIv ? Buffer.from(session.encryptionIv, 'base64') : undefined
    const prepared = prepareInvoiceForSubmission(invoiceXml, sessionKey, sessionIv)

    // Submit to KSeF
    const sendUrl = getSendInvoiceUrl(settings.ksefEnvironment)
    const sendResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        invoiceHash: {
          hashSHA: {
            algorithm: 'SHA-256',
            encoding: 'Base64',
            value: prepared.hashValue,
          },
          fileSize: prepared.fileSize,
        },
        invoicePayload: {
          type: prepared.encrypted ? 'encrypted' : 'plain',
          invoiceBody: prepared.invoiceBody,
        },
      }),
    })

    if (!sendResponse.ok) {
      const errorBody = await sendResponse.text()
      throw new Error(`KSeF send invoice failed (${sendResponse.status}): ${errorBody}`)
    }

    const sendResult = (await sendResponse.json()) as KsefSendInvoiceResponse

    // Update invoice with submission result
    invoice.ksefStatus = 'submitted'
    invoice.ksefSessionId = session.id
    invoice.ksefReferenceNumber = sendResult.elementReferenceNumber
    invoice.ksefSubmittedAt = new Date()
    invoice.ksefErrorMessage = null
    invoice.ksefErrorCode = null

    // Update session invoice count
    session.invoiceCount = (session.invoiceCount ?? 0) + 1

    await em.persist([invoice, session]).flush()

    logger.info('invoice_submitted', {
      invoiceId,
      referenceNumber: sendResult.elementReferenceNumber,
      processingCode: sendResult.processingCode,
    })

    // Enqueue status poll job
    const { createQueue } = await import('@open-mercato/queue')
    const pollQueue = createQueue<StatusPollPayload>('invoicing-ksef-status-poll', 'local')
    await pollQueue.enqueue({
      invoiceId,
      referenceNumber: sendResult.elementReferenceNumber,
      tenantId,
      organizationId,
      attempt: 1,
    })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    invoice.ksefStatus = 'error'
    invoice.ksefErrorMessage = errorMessage
    await em.persist(invoice).flush()

    logger.error('submission_failed', err, { invoiceId })

    throw err
  }
}

type StatusPollPayload = {
  invoiceId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
  attempt: number
}
