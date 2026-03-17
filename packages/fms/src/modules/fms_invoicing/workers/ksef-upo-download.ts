import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { FmsInvoicingInvoice, FmsInvoicingKsefSession, FmsInvoicingSettings } from '../data/entities'
import { createFmsLogger } from '../../../lib/logger'
import { resolveKsefStatus } from '../lib/ksef/status-codes'
import { KsefClientService } from '../services/ksef/client.service'
import { emitFmsInvoicingEvent } from '../events'

export const UPO_DOWNLOAD_QUEUE_NAME = 'fms-invoicing-ksef-upo-download'

export const metadata: WorkerMeta = {
  queue: UPO_DOWNLOAD_QUEUE_NAME,
  concurrency: 3,
  id: 'fms-invoicing-ksef-upo-download',
}

export type UpoDownloadPayload = {
  sessionId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
}

const logger = createFmsLogger('fms_invoicing.ksef_upo_download')

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<UpoDownloadPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { sessionId, referenceNumber, tenantId, organizationId } = job.payload

  logger.info('starting_upo_download', { sessionId, referenceNumber, tenantId, organizationId })

  const session = await em.findOne(FmsInvoicingKsefSession, {
    id: sessionId,
    tenantId,
    organizationId,
  })

  if (!session) {
    logger.warn('session_not_found', { sessionId })
    return
  }

  // Skip if UPO already downloaded
  if (session.upoXml) {
    logger.info('upo_already_downloaded', { sessionId })
    return
  }

  try {
    const settings = await em.findOne(FmsInvoicingSettings, { tenantId, organizationId })
    if (!settings) {
      throw new Error('FMS Invoicing settings not configured')
    }

    if (!session.sessionToken) {
      throw new Error('Session has no access token for UPO download')
    }

    const client = new KsefClientService(settings.ksefEnvironment)
    client.setAccessToken(session.sessionToken)

    const upoResult = await client.downloadUpo()
    const resolvedStatus = resolveKsefStatus(upoResult.processingCode)

    if (resolvedStatus === 'error' || resolvedStatus === 'rejected') {
      throw new Error(`KSeF UPO not available: ${upoResult.processingDescription} (code ${upoResult.processingCode})`)
    }

    // Store UPO XML in session record
    session.upoXml = upoResult.upo
    session.upoDownloadedAt = new Date()
    await em.persist(session).flush()

    logger.info('upo_downloaded', {
      sessionId,
      referenceNumber,
      upoSize: upoResult.upo.length,
    })

    // Update all accepted invoices in this session to 'upo_downloaded'
    const invoices = await em.find(FmsInvoicingInvoice, {
      ksefSessionId: sessionId,
      ksefStatus: 'accepted',
      tenantId,
      organizationId,
      deletedAt: null,
    })

    for (const invoice of invoices) {
      invoice.ksefStatus = 'upo_downloaded'
      invoice.ksefUpoXml = upoResult.upo
      em.persist(invoice)
    }

    await em.flush()

    logger.info('invoices_updated_with_upo', {
      sessionId,
      invoiceCount: invoices.length,
    })

    // Emit UPO downloaded event for each updated invoice
    for (const invoice of invoices) {
      await emitFmsInvoicingEvent('fms_invoicing.ksef.upo_downloaded', {
        id: invoice.id,
        tenantId: invoice.tenantId,
        organizationId: invoice.organizationId,
        invoiceNumber: invoice.invoiceNumber,
        direction: invoice.direction,
        sourceType: invoice.sourceType,
      })
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    session.errorMessage = errorMessage
    await em.persist(session).flush()

    logger.error('upo_download_failed', err, { sessionId, referenceNumber })

    throw err
  }
}
