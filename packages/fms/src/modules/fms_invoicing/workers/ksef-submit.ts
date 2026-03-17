import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsInvoicingInvoice, FmsInvoicingKsefSession, FmsInvoicingSettings } from '../data/entities'
import { createFmsLogger } from '../../../lib/logger'
import { prepareInvoiceForSubmission } from '../lib/ksef/crypto'
import { getSendInvoiceUrl } from '../lib/ksef/endpoints'
import type { KsefSendInvoiceResponse } from '../lib/ksef/types'
import type { KsefAuthService } from '../services/ksef/auth.service'

export const SUBMIT_QUEUE_NAME = 'fms-invoicing-ksef-submit'

export const metadata: WorkerMeta = {
  queue: SUBMIT_QUEUE_NAME,
  concurrency: 3,
  id: 'fms-invoicing-ksef-submit',
}

export type SubmitPayload = {
  invoiceId: string
  tenantId: string
  organizationId: string
}

const logger = createFmsLogger('fms_invoicing.ksef_submit')

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<SubmitPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { invoiceId, tenantId, organizationId } = job.payload

  logger.info('starting_submission', { invoiceId, tenantId, organizationId })

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

  if (invoice.ksefStatus !== 'queued') {
    logger.warn('invoice_not_queued', {
      invoiceId,
      currentStatus: invoice.ksefStatus,
    })
    return
  }

  try {
    const settings = await em.findOne(FmsInvoicingSettings, { tenantId, organizationId })
    if (!settings) {
      throw new Error('FMS Invoicing settings not configured for this tenant')
    }

    const sellerNip = invoice.sellerTaxId ?? settings.defaultSellerNip
    if (!sellerNip) {
      throw new Error('Seller NIP is required for KSeF submission')
    }

    // Get or create a KSeF session
    let session = await em.findOne(FmsInvoicingKsefSession, {
      tenantId,
      organizationId,
      nip: sellerNip,
      sessionStatus: 'active',
    })

    let accessToken: string

    if (!session) {
      const authService = ctx.resolve<KsefAuthService>('fmsKsefAuthService')
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
    const invoiceXml = generateFa3Xml(invoice)
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
    const pollQueue = createQueue<StatusPollPayload>('fms-invoicing-ksef-status-poll', 'local')
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

function generateFa3Xml(invoice: FmsInvoicingInvoice): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">')
  lines.push('  <Naglowek>')
  lines.push('    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="3-0E">FA</KodFormularza>')
  lines.push('    <WariantFormularza>3</WariantFormularza>')
  lines.push(`    <DataWytworzeniaFa>${new Date().toISOString().slice(0, 19)}</DataWytworzeniaFa>`)
  lines.push('    <SystemInfo>OpenMercato</SystemInfo>')
  lines.push('  </Naglowek>')
  lines.push('  <Podmiot1>')
  lines.push('    <DaneIdentyfikacyjne>')
  if (invoice.sellerTaxId) {
    lines.push(`      <NIP>${escapeXml(invoice.sellerTaxId)}</NIP>`)
  }
  if (invoice.sellerName) {
    lines.push(`      <Nazwa>${escapeXml(invoice.sellerName)}</Nazwa>`)
  }
  lines.push('    </DaneIdentyfikacyjne>')
  if (invoice.sellerAddress) {
    lines.push('    <Adres>')
    lines.push(`      <KodKraju>${escapeXml(invoice.sellerCountryCode ?? 'PL')}</KodKraju>`)
    lines.push(`      <AdresL1>${escapeXml(invoice.sellerAddress)}</AdresL1>`)
    lines.push('    </Adres>')
  }
  lines.push('  </Podmiot1>')
  lines.push('  <Podmiot2>')
  lines.push('    <DaneIdentyfikacyjne>')
  if (invoice.buyerTaxId) {
    lines.push(`      <NIP>${escapeXml(invoice.buyerTaxId)}</NIP>`)
  }
  if (invoice.buyerName) {
    lines.push(`      <Nazwa>${escapeXml(invoice.buyerName)}</Nazwa>`)
  }
  lines.push('    </DaneIdentyfikacyjne>')
  if (invoice.buyerAddress) {
    lines.push('    <Adres>')
    lines.push(`      <KodKraju>${escapeXml(invoice.buyerCountryCode ?? 'PL')}</KodKraju>`)
    lines.push(`      <AdresL1>${escapeXml(invoice.buyerAddress)}</AdresL1>`)
    lines.push('    </Adres>')
  }
  lines.push('  </Podmiot2>')
  lines.push('  <Fa>')
  lines.push('    <KodWaluty>PLN</KodWaluty>')
  lines.push(`    <P_1>${invoice.invoiceDate ? formatDate(invoice.invoiceDate) : formatDate(new Date())}</P_1>`)
  lines.push(`    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>`)
  lines.push(`    <P_15>${invoice.netAmount}</P_15>`)
  lines.push(`    <P_16>${invoice.vatAmount}</P_16>`)
  lines.push('    <RodzajFaktury>VAT</RodzajFaktury>')
  lines.push('  </Fa>')
  lines.push('</Faktura>')
  return lines.join('\n')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(date: Date): string {
  if (typeof date === 'string') return (date as string).slice(0, 10)
  return date.toISOString().slice(0, 10)
}

type StatusPollPayload = {
  invoiceId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
  attempt: number
}
