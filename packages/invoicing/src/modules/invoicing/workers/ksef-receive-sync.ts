import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import {
  InvoicingInvoice,
  InvoicingSettings,
} from '../data/entities'
import { createInvoicingLogger } from '../../../lib/logger'
import {
  getQueryInvoicesUrl,
  getInvoiceUrl,
} from '../lib/ksef/endpoints'
import type {
  KsefQueryInvoicesResponse,
  KsefDownloadInvoiceResponse,
  KsefInvoiceHeader,
} from '../lib/ksef/types'
import { emitInvoicingEvent } from '../events'
import type { KsefAuthService } from '../services/ksef/auth.service'

export const RECEIVE_SYNC_QUEUE_NAME = 'invoicing-ksef-receive-sync'

export const metadata: WorkerMeta = {
  queue: RECEIVE_SYNC_QUEUE_NAME,
  concurrency: 2,
  id: 'invoicing-ksef-receive-sync',
}

export type ReceiveSyncPayload = {
  tenantId: string
  organizationId: string
  nip: string
  dateFrom?: string
  dateTo?: string
}

const logger = createInvoicingLogger('invoicing.ksef_receive_sync')

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<ReceiveSyncPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { tenantId, organizationId, nip, dateFrom, dateTo } = job.payload

  logger.info('starting_receive_sync', { tenantId, organizationId, nip, dateFrom, dateTo })

  try {
    const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
    if (!settings) {
      throw new Error('Invoicing settings not configured')
    }

    const environment = settings.ksefEnvironment

    // Authenticate using KsefAuthService
    const authService = ctx.resolve<KsefAuthService>('invoicingKsefAuthService')
    const authResult = await authService.authenticate(em, {
      tenantId,
      organizationId,
      nip,
      environment,
    })
    const accessToken = authResult.accessToken

    try {
      // Query for received invoices
      const now = new Date()
      const defaultDateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      const queryDateFrom = dateFrom ?? defaultDateFrom.toISOString()
      const queryDateTo = dateTo ?? now.toISOString()

      const queryUrl = getQueryInvoicesUrl(environment)
      const queryResponse = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          queryCriteria: {
            subjectType: 'subject2',
            type: 'range',
            acquisitionTimestampThresholdFrom: queryDateFrom,
            acquisitionTimestampThresholdTo: queryDateTo,
          },
        }),
      })

      if (!queryResponse.ok) {
        const errorBody = await queryResponse.text()
        throw new Error(`KSeF query failed (${queryResponse.status}): ${errorBody}`)
      }

      const queryResult = (await queryResponse.json()) as KsefQueryInvoicesResponse
      const invoiceHeaders = queryResult.invoiceHeaderList ?? []

      logger.info('received_invoice_headers', {
        count: invoiceHeaders.length,
        nip,
      })

      let importedCount = 0

      for (const header of invoiceHeaders) {
        const imported = await importReceivedInvoice(em, header, accessToken, environment, tenantId, organizationId)
        if (imported) {
          importedCount++
        }
      }

      logger.info('receive_sync_completed', {
        nip,
        totalHeaders: invoiceHeaders.length,
        importedCount,
      })

      // Invalidate the session
      await authService.invalidateSession(em, authResult.session.id, environment)
    } catch (err: unknown) {
      // Attempt to invalidate session even on error
      try {
        await authService.invalidateSession(em, authResult.session.id, environment)
      } catch {
        // Ignore invalidation errors
      }
      throw err
    }
  } catch (err: unknown) {
    logger.error('receive_sync_failed', err, { tenantId, organizationId, nip })
    throw err
  }
}

async function importReceivedInvoice(
  em: EntityManager,
  header: KsefInvoiceHeader,
  accessToken: string,
  environment: 'test' | 'demo' | 'production',
  tenantId: string,
  organizationId: string
): Promise<boolean> {
  // Check if already imported by KSeF reference number
  const existing = await em.findOne(InvoicingInvoice, {
    ksefNumber: header.ksefReferenceNumber,
    tenantId,
    organizationId,
    deletedAt: null,
  })

  if (existing) {
    logger.debug('invoice_already_imported', {
      ksefNumber: header.ksefReferenceNumber,
      existingId: existing.id,
    })
    return false
  }

  // Download full invoice XML
  const downloadUrl = getInvoiceUrl(environment, header.ksefReferenceNumber)
  const downloadResponse = await fetch(downloadUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  if (!downloadResponse.ok) {
    logger.warn('invoice_download_failed', {
      ksefNumber: header.ksefReferenceNumber,
      status: downloadResponse.status,
    })
    return false
  }

  const downloadResult = (await downloadResponse.json()) as KsefDownloadInvoiceResponse

  // Extract seller and buyer info from header
  const sellerName = header.subjectBy.issuedByName.tradeName
    ?? header.subjectBy.issuedByName.fullName
    ?? null
  const sellerTaxId = header.subjectBy.issuedByIdentifier?.identifier ?? null

  const buyerName = header.subjectTo?.issuedToName?.tradeName
    ?? header.subjectTo?.issuedToName?.fullName
    ?? null
  const buyerTaxId = header.subjectTo?.issuedToIdentifier?.identifier ?? null

  const invoice = em.create(InvoicingInvoice, {
    tenantId,
    organizationId,
    invoiceNumber: header.invoiceNumber,
    invoiceDate: header.invoicingDate ? new Date(header.invoicingDate) : null,
    sellerName,
    sellerTaxId,
    buyerName,
    buyerTaxId,
    netAmount: header.net ?? '0',
    vatAmount: header.vat ?? '0',
    grossAmount: header.gross ?? '0',
    direction: 'incoming',
    sourceType: 'ksef_received',
    status: 'pending_review',
    ksefStatus: 'accepted',
    ksefNumber: header.ksefReferenceNumber,
    ksefAcceptedAt: header.acquisitionTimestamp ? new Date(header.acquisitionTimestamp) : new Date(),
    ksefFaXml: downloadResult.invoiceBody
      ? Buffer.from(downloadResult.invoiceBody, 'base64').toString('utf8')
      : null,
  })

  em.persist(invoice)
  await em.flush()

  logger.info('received_invoice_imported', {
    invoiceId: invoice.id,
    ksefNumber: header.ksefReferenceNumber,
    invoiceNumber: header.invoiceNumber,
  })

  await emitInvoicingEvent('invoicing.ksef.received', {
    id: invoice.id,
    tenantId,
    organizationId,
    invoiceNumber: header.invoiceNumber,
    direction: 'incoming',
    sourceType: 'ksef_received',
  })

  return true
}
