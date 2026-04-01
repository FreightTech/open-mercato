import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { KsefSubmission, KsefInvoice, KsefInvoiceLineItem } from '../data/entities'
import { getQueryInvoicesUrl, getInvoiceByKsefNumberUrl } from '../lib/endpoints'
import type {
  KsefQueryInvoicesResponse,
  KsefDownloadInvoiceResponse,
  KsefInvoiceHeader,
} from '../lib/types'
import {
  extractInvoiceNumberFromFa3,
  extractSellerNipFromFa3,
  extractBuyerNipFromFa3,
  extractInvoiceDateFromFa3,
  extractGrossAmountFromFa3,
  extractLineItemsFromFa3,
} from '../lib/xml-parser'
import { emitKsefEvent } from '../events'
import type { KsefAuthService } from '../services/auth.service'

export const RECEIVE_SYNC_QUEUE_NAME = 'ksef-receive-sync'

export const metadata: WorkerMeta = {
  queue: RECEIVE_SYNC_QUEUE_NAME,
  concurrency: 2,
  id: 'ksef-receive-sync',
}

export type ReceiveSyncPayload = {
  tenantId: string
  organizationId: string
  nip: string
  dateFrom?: string
  dateTo?: string
  subjectType?: string
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<ReceiveSyncPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { tenantId, organizationId, nip, dateFrom, dateTo, subjectType } = job.payload

  try {
    // Load KSeF credentials from Integration Marketplace
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em)
    const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })

    if (!credentials) {
      throw new Error('KSeF credentials not configured')
    }

    const environment = (credentials.environment as string) ?? 'test'

    const authService = ctx.resolve<KsefAuthService>('ksefAuthService')
    const authResult = await authService.authenticate(em, {
      tenantId,
      organizationId,
      nip,
      environment: environment as 'test' | 'demo' | 'production',
      credentials: {
        authType: credentials.authType as string,
        ksefToken: credentials.ksefToken as string | undefined,
        certificatePem: credentials.certificatePem as string | undefined,
        privateKeyPem: credentials.privateKeyPem as string | undefined,
      },
    })
    const accessToken = authResult.accessToken

    try {
      const now = new Date()
      const defaultDateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const queryDateFrom = dateFrom
        ? new Date(dateFrom).toISOString()
        : defaultDateFrom.toISOString()
      const queryDateTo = dateTo
        ? new Date(dateTo + 'T23:59:59').toISOString()
        : now.toISOString()

      const requestBody = {
        filters: {
          subjectType: subjectType ?? 'subject2',
          dateRange: {
            from: queryDateFrom,
            to: queryDateTo,
          },
        },
      }
      console.log('[ksef-receive-sync] Query body:', JSON.stringify(requestBody))

      const queryUrl = getQueryInvoicesUrl(environment as 'test' | 'demo' | 'production')
      const queryResponse = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (!queryResponse.ok) {
        const errorBody = await queryResponse.text()
        throw new Error(`KSeF query failed (${queryResponse.status}): ${errorBody}`)
      }

      const queryResult = (await queryResponse.json()) as KsefQueryInvoicesResponse
      const invoiceHeaders = queryResult.invoiceHeaderList ?? []

      const invoiceDirection = subjectType === 'subject1' ? 'outgoing' : 'incoming'

      for (const header of invoiceHeaders) {
        await importReceivedInvoice(
          em,
          header,
          accessToken,
          environment as 'test' | 'demo' | 'production',
          tenantId,
          organizationId,
          invoiceDirection
        )
      }

      await authService.invalidateSession(em, authResult.session.id, environment as 'test' | 'demo' | 'production')
    } catch (err: unknown) {
      try {
        await authService.invalidateSession(em, authResult.session.id, environment as 'test' | 'demo' | 'production')
      } catch {
        // Ignore invalidation errors
      }
      throw err
    }
  } catch (err: unknown) {
    throw err
  }
}

async function importReceivedInvoice(
  em: EntityManager,
  header: KsefInvoiceHeader,
  accessToken: string,
  environment: 'test' | 'demo' | 'production',
  tenantId: string,
  organizationId: string,
  direction: 'outgoing' | 'incoming' = 'incoming'
): Promise<boolean> {
  // Check if already imported by KSeF number
  const existing = await em.findOne(KsefSubmission, {
    ksefNumber: header.ksefReferenceNumber,
    tenantId,
    organizationId,
  })

  if (existing) {
    return false
  }

  // Download full invoice XML
  const downloadUrl = getInvoiceByKsefNumberUrl(environment, header.ksefReferenceNumber)
  const downloadResponse = await fetch(downloadUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  let invoiceXml: string | null = null
  if (downloadResponse.ok) {
    const downloadResult = (await downloadResponse.json()) as KsefDownloadInvoiceResponse
    invoiceXml = downloadResult.invoiceBody
      ? Buffer.from(downloadResult.invoiceBody, 'base64').toString('utf8')
      : null
  }

  // Create KsefInvoice (direction: incoming) from header data
  const ksefInvoice = em.create(KsefInvoice, {
    organizationId,
    tenantId,
    invoiceNumber: header.invoiceNumber ?? extractInvoiceNumberFromFa3(invoiceXml ?? '') ?? 'UNKNOWN',
    invoiceDate: header.invoicingDate ? new Date(header.invoicingDate) : null,
    sellerName: header.subjectBy?.issuedByName?.tradeName ?? header.subjectBy?.issuedByName?.fullName ?? null,
    sellerTaxId: header.subjectBy?.issuedByIdentifier?.identifier ?? extractSellerNipFromFa3(invoiceXml ?? '') ?? null,
    buyerName: header.subjectTo?.issuedToName?.tradeName ?? header.subjectTo?.issuedToName?.fullName ?? null,
    buyerTaxId: header.subjectTo?.issuedToIdentifier?.identifier ?? extractBuyerNipFromFa3(invoiceXml ?? '') ?? null,
    netAmount: header.net ?? '0',
    vatAmount: header.vat ?? '0',
    grossAmount: header.gross ?? extractGrossAmountFromFa3(invoiceXml ?? '') ?? '0',
    currencyCode: 'PLN',
    direction,
  })
  em.persist(ksefInvoice)

  // Parse line items from XML if available
  if (invoiceXml) {
    const parsedLines = extractLineItemsFromFa3(invoiceXml)
    for (const line of parsedLines) {
      const lineItem = em.create(KsefInvoiceLineItem, {
        invoice: ksefInvoice,
        lineNumber: parseInt(line.lineNumber ?? '0', 10),
        description: line.description ?? '',
        quantity: line.quantity ?? '1',
        unitPriceNet: line.unitPrice ?? '0',
        netAmount: line.netAmount ?? '0',
        vatAmount: '0',
        vatRate: line.vatRate ?? '0',
      })
      em.persist(lineItem)
    }
  }

  // Create KsefSubmission record linked to the KsefInvoice
  const submission = em.create(KsefSubmission, {
    tenantId,
    organizationId,
    ksefInvoiceId: ksefInvoice.id,
    status: 'accepted',
    ksefNumber: header.ksefReferenceNumber,
    ksefReferenceNumber: header.invoiceReferenceNumber,
    acceptedAt: header.acquisitionTimestamp ? new Date(header.acquisitionTimestamp) : new Date(),
    faXml: invoiceXml,
  })

  em.persist(submission)
  await em.flush()

  await emitKsefEvent('ksef.invoice.received', {
    id: submission.id,
    invoiceId: ksefInvoice.id,
    tenantId,
    organizationId,
    ksefNumber: header.ksefReferenceNumber,
    invoiceNumber: ksefInvoice.invoiceNumber,
    sellerNip: ksefInvoice.sellerTaxId,
    sellerName: ksefInvoice.sellerName,
    buyerNip: ksefInvoice.buyerTaxId,
    buyerName: ksefInvoice.buyerName,
    netAmount: ksefInvoice.netAmount,
    vatAmount: ksefInvoice.vatAmount,
    grossAmount: ksefInvoice.grossAmount,
    invoiceDate: ksefInvoice.invoiceDate?.toISOString() ?? null,
  })

  return true
}
