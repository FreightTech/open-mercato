import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { KsefSubmission, KsefSession } from '../data/entities'
import { prepareInvoiceForSubmission } from '../lib/crypto'
import {
  getSendInvoiceUrl,
  getSessionFailedInvoicesUrl,
  getCloseOnlineSessionUrl,
  getSessionInvoiceStatusUrl,
} from '../lib/endpoints'
import { validateKsefNumber } from '../lib/ksef-number'
import type { KsefAuthService } from '../services/auth.service'
import { KsefXmlService } from '../services/xml.service'
import { emitKsefEvent } from '../events'
import type { KsefSubmissionEventPayload } from '../events'
import {
  ksefLogger as logger,
  monitoredKsefFetch,
  recordKsefSubmission,
  withKsefSpan,
} from '../lib/observability'

export const SUBMIT_QUEUE_NAME = 'ksef-submit'

export const metadata: WorkerMeta = {
  queue: SUBMIT_QUEUE_NAME,
  concurrency: 3,
  id: 'ksef-submit',
}

export type SubmitPayload = {
  invoiceId: string
  submissionId: string
  tenantId: string
  organizationId: string
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<SubmitPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { invoiceId, submissionId, tenantId, organizationId } = job.payload

  const submission = await em.findOne(KsefSubmission, {
    id: submissionId,
    tenantId,
    organizationId,
  })

  if (!submission) {
    return
  }

  if (submission.status !== 'queued') {
    return
  }

  return withKsefSpan(
    { op: 'submit', environment: null, nip: null },
    () => handleInner(em, submission, invoiceId, tenantId, organizationId, ctx),
  )
}

async function handleInner(
  em: EntityManager,
  submission: KsefSubmission,
  invoiceId: string,
  tenantId: string,
  organizationId: string,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  try {
    // Load KSeF credentials from Integration Marketplace
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em)
    const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })

    if (!credentials) {
      throw new Error('KSeF credentials not configured. Go to Integrations > KSeF to set up credentials.')
    }

    const nip = credentials.nip as string
    const environment = (credentials.environment as string) ?? 'test'

    if (!nip) {
      throw new Error('NIP is required for KSeF submission')
    }

    // Get or create a KSeF session
    // Always create a fresh auth + online session for each submission
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
    const session = authResult.session
    const accessToken = authResult.accessToken

    // Generate FA(3) XML for the invoice
    const xmlService = new KsefXmlService()
    const invoiceXml = await xmlService.generateFa3Xml(em, invoiceId)
    submission.faXml = invoiceXml

    // Prepare invoice for submission (encrypt if session has encryption keys)
    const sessionKey = session.encryptionKey ? Buffer.from(session.encryptionKey, 'base64') : undefined
    const sessionIv = session.encryptionIv ? Buffer.from(session.encryptionIv, 'base64') : undefined
    const prepared = prepareInvoiceForSubmission(invoiceXml, sessionKey, sessionIv)

    // Submit to KSeF
    const sessionRef = session.ksefReferenceNumber
    if (!sessionRef) {
      throw new Error('KSeF session has no reference number — cannot submit invoice')
    }
    const sendUrl = getSendInvoiceUrl(environment as 'test' | 'demo' | 'production', sessionRef)
    const sendResponse = await monitoredKsefFetch(
      sendUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          invoiceHash: prepared.invoiceHash,
          invoiceSize: prepared.invoiceSize,
          encryptedInvoiceHash: prepared.encryptedInvoiceHash,
          encryptedInvoiceSize: prepared.encryptedInvoiceSize,
          encryptedInvoiceContent: prepared.encryptedInvoiceContent,
          offlineMode: false,
        }),
      },
      { op: 'send_invoice', environment, nip },
    )

    if (!sendResponse.ok) {
      const errorBody = await sendResponse.text()
      throw new Error(`KSeF send invoice failed (${sendResponse.status}): ${errorBody}`)
    }

    const sendResult = (await sendResponse.json()) as { referenceNumber: string }
    logger.info('ksef.submit.accepted', {
      referenceNumber: sendResult.referenceNumber,
      submissionId: submission.id,
      tenantId,
      organizationId,
    })

    // Update submission with result
    submission.status = 'submitted'
    submission.ksefSessionId = session.id
    submission.ksefReferenceNumber = sendResult.referenceNumber
    submission.submittedAt = new Date()
    submission.errorMessage = null
    submission.errorCode = null

    session.invoiceCount = (session.invoiceCount ?? 0) + 1

    await em.persist([submission, session]).flush()

    recordKsefSubmission({ op: 'submit', environment, nip }, 'submitted')
    await emitKsefEvent('ksef.submission.submitted', buildEventPayload(submission))

    // Poll for processing result — KSeF processes asynchronously
    await new Promise((r) => setTimeout(r, 5000))

    // Check for failed invoices in this session
    const failedUrl = getSessionFailedInvoicesUrl(environment as 'test' | 'demo' | 'production', sessionRef)
    const failedResponse = await monitoredKsefFetch(
      failedUrl,
      { headers: { 'Authorization': `Bearer ${accessToken}` } },
      { op: 'session_failed_invoices', environment, nip },
    )
    if (failedResponse.ok) {
      const failedResult = (await failedResponse.json()) as { invoices?: Array<{ referenceNumber?: string; exceptionDescription?: string; exceptionCode?: number; details?: string[] }> }
      const failures = failedResult.invoices ?? (Array.isArray(failedResult) ? failedResult : [])
      if (failures.length > 0) {
        const details = JSON.stringify(failures, null, 2)
        submission.status = 'rejected'
        submission.errorMessage = `KSeF rejected invoice: ${details}`
        await em.persist(submission).flush()
        recordKsefSubmission({ op: 'submit', environment, nip }, 'rejected')
        await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))
        return
      }
    }

    // Check individual invoice status.
    const invoiceStatusUrl = getSessionInvoiceStatusUrl(
      environment as 'test' | 'demo' | 'production',
      sessionRef,
      sendResult.referenceNumber,
    )
    const statusResponse = await monitoredKsefFetch(
      invoiceStatusUrl,
      { headers: { 'Authorization': `Bearer ${accessToken}` } },
      { op: 'session_invoice_status', environment, nip },
    )
    if (statusResponse.ok) {
      const statusResult = (await statusResponse.json()) as Record<string, unknown>

      const processingCode = statusResult.processingCode as number | undefined
      if (processingCode && processingCode >= 400) {
        submission.status = 'rejected'
        submission.errorMessage = `KSeF processing error (code ${processingCode}): ${JSON.stringify(statusResult)}`
        submission.errorCode = String(processingCode)
        await em.persist(submission).flush()
        recordKsefSubmission({ op: 'submit', environment, nip }, 'rejected')
        await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))
        return
      }

      // When the KSeF number has been assigned, persist it — but only if it
      // passes format + CRC-8 validation. Any mismatch is a strong signal
      // that we're talking to the wrong endpoint or mis-parsing the body.
      const ksefNumber = (statusResult.ksefReferenceNumber as string | undefined)
        ?? (statusResult.ksefNumber as string | undefined)
      if (ksefNumber) {
        const validation = validateKsefNumber(ksefNumber)
        if (!validation.valid) {
          throw new Error(
            `KSeF returned an invalid KSeF number: ${validation.error} (got "${ksefNumber}")`,
          )
        }
        submission.ksefNumber = ksefNumber
        submission.status = 'accepted'
        submission.acceptedAt = new Date()
        recordKsefSubmission({ op: 'submit', environment, nip }, 'accepted')
      }
    }

    // Close the online session — prevents stale sessions accumulating on KSeF side
    try {
      const closeUrl = getCloseOnlineSessionUrl(environment as 'test' | 'demo' | 'production', sessionRef)
      await monitoredKsefFetch(
        closeUrl,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        },
        { op: 'close_online_session', environment, nip },
      )
      session.sessionStatus = 'closed' as any
      session.closedAt = new Date()
      await em.persist(session).flush()
    } catch (closeErr) {
      // Non-critical — session will eventually time out on KSeF side
      logger.warn('ksef.submit.session_close_failed', {
        submissionId: submission.id,
        error: closeErr instanceof Error ? closeErr.message : 'Unknown error',
      })
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    submission.status = 'error'
    submission.errorMessage = errorMessage
    await em.persist(submission).flush()

    recordKsefSubmission({ op: 'submit', environment: null, nip: null }, 'error')
    logger.error('ksef.submit.failed', {
      submissionId: submission.id,
      tenantId,
      organizationId,
      error: errorMessage,
    })
    await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))

    throw err
  }
}

function buildEventPayload(submission: KsefSubmission): KsefSubmissionEventPayload {
  return {
    id: submission.id,
    invoiceId: submission.ksefInvoiceId ?? submission.invoiceId ?? '',
    tenantId: submission.tenantId,
    organizationId: submission.organizationId,
    status: submission.status,
    ksefNumber: submission.ksefNumber ?? undefined,
  }
}

type StatusPollPayload = {
  invoiceId: string
  submissionId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
  attempt: number
}
