import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { KsefSubmission, KsefSession } from '../data/entities'
import { prepareInvoiceForSubmission } from '../lib/crypto'
import { getSendInvoiceUrl, getSessionFailedInvoicesUrl, getCloseOnlineSessionUrl } from '../lib/endpoints'
import type { KsefAuthService } from '../services/auth.service'
import { KsefXmlService } from '../services/xml.service'
import { emitKsefEvent } from '../events'
import type { KsefSubmissionEventPayload } from '../events'

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
    const sendResponse = await fetch(sendUrl, {
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
    })

    if (!sendResponse.ok) {
      const errorBody = await sendResponse.text()
      throw new Error(`KSeF send invoice failed (${sendResponse.status}): ${errorBody}`)
    }

    const sendResult = (await sendResponse.json()) as { referenceNumber: string }
    console.log('[ksef-submit] Invoice accepted for processing:', sendResult.referenceNumber)
    console.log('[ksef-submit] Generated XML (first 500 chars):', invoiceXml.substring(0, 500))

    // Update submission with result
    submission.status = 'submitted'
    submission.ksefSessionId = session.id
    submission.ksefReferenceNumber = sendResult.referenceNumber
    submission.submittedAt = new Date()
    submission.errorMessage = null
    submission.errorCode = null

    session.invoiceCount = (session.invoiceCount ?? 0) + 1

    await em.persist([submission, session]).flush()

    await emitKsefEvent('ksef.submission.submitted', buildEventPayload(submission))

    // Poll for processing result — KSeF processes asynchronously
    await new Promise((r) => setTimeout(r, 5000))

    // Check for failed invoices in this session
    const failedUrl = getSessionFailedInvoicesUrl(environment as 'test' | 'demo' | 'production', sessionRef)
    const failedResponse = await fetch(failedUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (failedResponse.ok) {
      const failedResult = (await failedResponse.json()) as { invoices?: Array<{ referenceNumber?: string; exceptionDescription?: string; exceptionCode?: number; details?: string[] }> }
      const failures = failedResult.invoices ?? (Array.isArray(failedResult) ? failedResult : [])
      if (failures.length > 0) {
        const details = JSON.stringify(failures, null, 2)
        submission.status = 'rejected'
        submission.errorMessage = `KSeF rejected invoice: ${details}`
        await em.persist(submission).flush()
        await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))
        return
      }
    }

    // Check individual invoice status
    const invoiceStatusUrl = `${getSessionFailedInvoicesUrl(environment as 'test' | 'demo' | 'production', sessionRef).replace('/failed', '')}/${sendResult.referenceNumber}`
    const statusResponse = await fetch(invoiceStatusUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (statusResponse.ok) {
      const statusResult = (await statusResponse.json()) as Record<string, unknown>
      console.log('[ksef-submit] Invoice status after submission:', JSON.stringify(statusResult))

      const processingCode = statusResult.processingCode as number | undefined
      if (processingCode && processingCode >= 400) {
        submission.status = 'rejected'
        submission.errorMessage = `KSeF processing error (code ${processingCode}): ${JSON.stringify(statusResult)}`
        submission.errorCode = String(processingCode)
        await em.persist(submission).flush()
        await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))
        return
      }
    }

    // Close the online session — prevents stale sessions accumulating on KSeF side
    try {
      const closeUrl = getCloseOnlineSessionUrl(environment as 'test' | 'demo' | 'production', sessionRef)
      await fetch(closeUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      session.sessionStatus = 'closed' as any
      session.closedAt = new Date()
      await em.persist(session).flush()
    } catch {
      // Non-critical — session will eventually time out on KSeF side
      console.warn('[ksef-submit] Failed to close KSeF session, it will expire automatically')
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    submission.status = 'error'
    submission.errorMessage = errorMessage
    await em.persist(submission).flush()

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
