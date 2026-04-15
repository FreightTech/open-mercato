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
import { ksefFetchWithRetry } from '../lib/rate-limit'
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
  nip?: string
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
  const { tenantId, organizationId, dateFrom, dateTo, subjectType } = job.payload

  const { createIntegrationLogService } = await import('@open-mercato/core/modules/integrations/lib/log-service')
  const log = createIntegrationLogService(em).scoped('ksef', { tenantId, organizationId })

  await log.info('Receive sync job started', { dateFrom, dateTo, subjectType })

  try {
    // Load KSeF credentials from Integration Marketplace
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em)
    const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })

    if (!credentials) {
      await log.error('KSeF credentials not configured')
      throw new Error('KSeF credentials not configured')
    }

    // NIP can be provided in payload or resolved from credentials
    const nip = job.payload.nip ?? (credentials.nip as string)
    if (!nip) {
      await log.error('NIP not available in credentials')
      throw new Error('NIP not available — configure it in KSeF integration credentials')
    }

    const environment = (credentials.environment as string) ?? 'test'
    await log.info(`Authenticating with KSeF ${environment} environment`, { nip, authType: credentials.authType as string })

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

    await log.info('KSeF authentication successful')

    try {
      const now = new Date()
      const defaultDateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const queryDateFrom = dateFrom
        ? new Date(dateFrom).toISOString()
        : defaultDateFrom.toISOString()
      const queryDateTo = dateTo
        ? new Date(dateTo + 'T23:59:59').toISOString()
        : now.toISOString()

      const resolvedSubjectType = subjectType ?? 'subject2'
      const pascalSubjectType = resolvedSubjectType === 'subject1' ? 'Subject1'
        : resolvedSubjectType === 'subject2' ? 'Subject2'
        : resolvedSubjectType === 'subject3' ? 'Subject3'
        : resolvedSubjectType

      const requestBody = {
        subjectType: pascalSubjectType,
        dateRange: {
          dateType: 'Invoicing',
          from: queryDateFrom,
          to: queryDateTo,
        },
      }

      await log.info('Querying KSeF for invoices', { subjectType: subjectType ?? 'subject2', dateFrom: queryDateFrom, dateTo: queryDateTo })

      const queryUrl = getQueryInvoicesUrl(environment as 'test' | 'demo' | 'production')
      const invoiceDirection = subjectType === 'subject1' ? 'outgoing' : 'incoming'
      let imported = 0
      let skipped = 0
      let totalFound = 0
      let pageNumber = 0
      let hasMore = true

      while (hasMore) {
        const pageBody = {
          ...requestBody,
          ...(pageNumber > 0 ? { pageOffset: pageNumber } : {}),
        }

        const queryResponse = await ksefFetchWithRetry(
          queryUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(pageBody),
          },
          {
            onRetry: async (attempt, waitMs) => {
              await log.info(`Rate limited by KSeF, waiting ${Math.ceil(waitMs / 1000)}s before retry (attempt ${attempt + 1})`, { attempt, waitMs })
            },
          },
        )

        if (!queryResponse.ok) {
          const errorBody = await queryResponse.text()
          await log.error(`KSeF query failed (${queryResponse.status})`, { responseBody: errorBody, page: pageNumber })
          throw new Error(`KSeF query failed (${queryResponse.status}): ${errorBody}`)
        }

        const queryResult = (await queryResponse.json()) as Record<string, unknown>
        const invoiceHeaders = (queryResult.invoices ?? queryResult.invoiceHeaderList ?? []) as KsefInvoiceHeader[]
        hasMore = queryResult.hasMore === true

        totalFound += invoiceHeaders.length
        await log.info(`Page ${pageNumber + 1}: found ${invoiceHeaders.length} invoice(s)${hasMore ? ', fetching next page...' : ''}`)

        for (const header of invoiceHeaders) {
          const wasImported = await importReceivedInvoice(
            em,
            header,
            accessToken,
            environment as 'test' | 'demo' | 'production',
            tenantId,
            organizationId,
            invoiceDirection
          )
          if (wasImported) imported++
          else skipped++
        }

        pageNumber++
      }

      await log.info(`Receive sync completed: ${imported} imported, ${skipped} skipped (duplicates)`, { imported, skipped, total: totalFound, pages: pageNumber })

      // Update lastSyncAt in settings
      try {
        type ConfigService = {
          getValue<T>(moduleId: string, name: string): Promise<T | null>
          setValue(moduleId: string, name: string, value: unknown): Promise<unknown>
        }
        const configService = ctx.resolve<ConfigService>('moduleConfigService')
        const existing = await configService.getValue<Record<string, unknown>>('ksef', 'receive_sync_settings')
        await configService.setValue('ksef', 'receive_sync_settings', {
          ...existing,
          lastSyncAt: new Date().toISOString(),
        })
      } catch {
        // Non-critical — settings update failure shouldn't fail the sync
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    await log.error(`Receive sync failed: ${message}`).catch(() => {})
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
  // v2 uses `ksefNumber`, v1 used `ksefReferenceNumber`
  const raw = header as unknown as Record<string, unknown>
  const ksefNumber = (raw.ksefNumber ?? header.ksefReferenceNumber) as string
  const invoiceNumber = (raw.invoiceNumber ?? header.invoiceNumber) as string | undefined
  const invoicingDate = (raw.invoicingDate ?? header.invoicingDate) as string | undefined
  const acquisitionDate = (raw.acquisitionDate ?? raw.acquisitionTimestamp ?? header.acquisitionTimestamp) as string | undefined

  // v2 seller: { nip, name }, v1: subjectBy.issuedByIdentifier/issuedByName
  const seller = raw.seller as { nip?: string; name?: string } | undefined
  const buyer = raw.buyer as { identifier?: { type?: string; value?: string }; name?: string } | undefined
  const sellerNip = seller?.nip ?? header.subjectBy?.issuedByIdentifier?.identifier
  const sellerName = seller?.name ?? header.subjectBy?.issuedByName?.tradeName ?? header.subjectBy?.issuedByName?.fullName
  const buyerNip = buyer?.identifier?.value ?? header.subjectTo?.issuedToIdentifier?.identifier
  const buyerName = buyer?.name ?? header.subjectTo?.issuedToName?.tradeName ?? header.subjectTo?.issuedToName?.fullName

  // v2 amounts are numbers, v1 were strings
  const netAmount = String(raw.netAmount ?? header.net ?? '0')
  const vatAmount = String(raw.vatAmount ?? header.vat ?? '0')
  const grossAmount = String(raw.grossAmount ?? header.gross ?? '0')
  const currencyCode = (raw.currency as string) ?? 'PLN'

  // Check if already imported by KSeF number
  const existing = await em.findOne(KsefSubmission, {
    ksefNumber,
    tenantId,
    organizationId,
  })

  if (existing) {
    // Legacy orphan: a prior worker bug created submissions with
    // ksef_invoice_id = NULL because the DB-generated primary key
    // wasn't resolved yet. Drop those so the normal create path below
    // can re-link properly. Outgoing invoices heal automatically via
    // the invoice-number match; incoming will get a fresh row and the
    // old orphan KsefInvoice can be cleaned up separately.
    if (existing.ksefInvoiceId) {
      return false
    }
    await em.removeAndFlush(existing)
  }

  // Download full invoice XML (v2 returns raw XML, v1 returned JSON with base64)
  const downloadUrl = getInvoiceByKsefNumberUrl(environment, ksefNumber)
  const downloadResponse = await ksefFetchWithRetry(downloadUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  let invoiceXml: string | null = null
  if (downloadResponse.ok) {
    const contentType = downloadResponse.headers.get('content-type') ?? ''
    if (contentType.includes('xml')) {
      invoiceXml = await downloadResponse.text()
    } else {
      const downloadResult = (await downloadResponse.json()) as KsefDownloadInvoiceResponse
      invoiceXml = downloadResult.invoiceBody
        ? Buffer.from(downloadResult.invoiceBody, 'base64').toString('utf8')
        : null
    }
  }

  // Try to match an existing local invoice (e.g. outgoing invoices created via "New Invoice")
  const resolvedInvoiceNumber = invoiceNumber ?? extractInvoiceNumberFromFa3(invoiceXml ?? '') ?? 'UNKNOWN'
  let ksefInvoice: KsefInvoice | null = null

  if (direction === 'outgoing') {
    ksefInvoice = await em.findOne(KsefInvoice, {
      invoiceNumber: resolvedInvoiceNumber,
      tenantId,
      organizationId,
      deletedAt: null,
    })
  }

  if (!ksefInvoice) {
    ksefInvoice = em.create(KsefInvoice, {
      organizationId,
      tenantId,
      invoiceNumber: resolvedInvoiceNumber,
      invoiceDate: invoicingDate ? new Date(invoicingDate) : null,
      sellerName: sellerName ?? null,
      sellerTaxId: sellerNip ?? extractSellerNipFromFa3(invoiceXml ?? '') ?? null,
      buyerName: buyerName ?? null,
      buyerTaxId: buyerNip ?? extractBuyerNipFromFa3(invoiceXml ?? '') ?? null,
      netAmount,
      vatAmount,
      grossAmount: grossAmount !== '0' ? grossAmount : extractGrossAmountFromFa3(invoiceXml ?? '') ?? '0',
      currencyCode,
      direction,
    })
    em.persist(ksefInvoice)
    // Flush so the DB-generated primary key is populated on the entity
    // before we reference ksefInvoice.id in the submission row below;
    // otherwise the submission is inserted with ksef_invoice_id = NULL,
    // the API list enrichment fails to join it, and the UI displays
    // "Not sent" for invoices that actually exist in KSeF.
    await em.flush()
  }

  // Parse line items from XML if available
  if (invoiceXml) {
    const parsedLines = extractLineItemsFromFa3(invoiceXml)
    for (const line of parsedLines) {
      const netAmount = parseFloat(line.netAmount ?? '0')
      const vatRate = line.vatRate ?? '0'
      const vatAmount = isNaN(parseFloat(vatRate)) ? 0 : netAmount * (parseFloat(vatRate) / 100)

      const lineItem = em.create(KsefInvoiceLineItem, {
        invoice: ksefInvoice,
        lineNumber: parseInt(line.lineNumber ?? '0', 10),
        description: line.description ?? '',
        quantity: line.quantity ?? '1',
        unitPriceNet: line.unitPrice ?? '0',
        netAmount: String(netAmount),
        vatAmount: String(Math.round(vatAmount * 100) / 100),
        vatRate,
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
    ksefNumber,
    ksefReferenceNumber: ksefNumber,
    acceptedAt: acquisitionDate ? new Date(acquisitionDate) : new Date(),
    faXml: invoiceXml,
  })

  em.persist(submission)
  await em.flush()

  await emitKsefEvent('ksef.invoice.received', {
    id: submission.id,
    invoiceId: ksefInvoice.id,
    tenantId,
    organizationId,
    ksefNumber,
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
