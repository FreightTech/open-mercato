import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { KsefSubmission } from '../data/entities'
import { getQueryInvoicesUrl, getInvoiceUrl } from '../lib/endpoints'
import type {
  KsefQueryInvoicesResponse,
  KsefDownloadInvoiceResponse,
  KsefInvoiceHeader,
} from '../lib/types'
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
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<ReceiveSyncPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { tenantId, organizationId, nip, dateFrom, dateTo } = job.payload

  try {
    // Load KSeF credentials from Integration Marketplace
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em)
    const credentials = await credentialsService.getDecrypted('ksef', { tenantId, organizationId })

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
      const queryDateFrom = dateFrom ?? defaultDateFrom.toISOString()
      const queryDateTo = dateTo ?? now.toISOString()

      const queryUrl = getQueryInvoicesUrl(environment as 'test' | 'demo' | 'production')
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

      for (const header of invoiceHeaders) {
        await importReceivedInvoice(
          em,
          header,
          accessToken,
          environment as 'test' | 'demo' | 'production',
          tenantId,
          organizationId
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
  organizationId: string
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
  const downloadUrl = getInvoiceUrl(environment, header.ksefReferenceNumber)
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

  // Create KsefSubmission record for the received invoice.
  // The actual invoice creation in fms_invoicing should be handled via
  // an event subscriber in the invoicing module reacting to ksef.invoice.received.
  const submission = em.create(KsefSubmission, {
    tenantId,
    organizationId,
    invoiceId: '00000000-0000-0000-0000-000000000000', // placeholder — resolved by invoicing module
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
    invoiceId: submission.invoiceId,
    tenantId,
    organizationId,
    ksefNumber: header.ksefReferenceNumber,
    invoiceNumber: header.invoiceNumber,
    sellerNip: header.subjectBy?.issuedByIdentifier?.identifier ?? null,
    sellerName: header.subjectBy?.issuedByName?.tradeName ?? header.subjectBy?.issuedByName?.fullName ?? null,
    buyerNip: header.subjectTo?.issuedToIdentifier?.identifier ?? null,
    buyerName: header.subjectTo?.issuedToName?.tradeName ?? header.subjectTo?.issuedToName?.fullName ?? null,
    netAmount: header.net ?? '0',
    vatAmount: header.vat ?? '0',
    grossAmount: header.gross ?? '0',
    invoiceDate: header.invoicingDate ?? null,
  })

  return true
}
