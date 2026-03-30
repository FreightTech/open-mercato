import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { KsefSubmission, KsefSession } from '../data/entities'
import { prepareInvoiceForSubmission } from '../lib/crypto'
import { getSendInvoiceUrl } from '../lib/endpoints'
import type { KsefSendInvoiceResponse } from '../lib/types'
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
    const credentials = await credentialsService.getDecrypted('ksef', { tenantId, organizationId })

    if (!credentials) {
      throw new Error('KSeF credentials not configured. Go to Integrations > KSeF to set up credentials.')
    }

    const nip = credentials.nip as string
    const environment = (credentials.environment as string) ?? 'test'

    if (!nip) {
      throw new Error('NIP is required for KSeF submission')
    }

    // Get or create a KSeF session
    let session = await em.findOne(KsefSession, {
      tenantId,
      organizationId,
      nip,
      sessionStatus: 'active',
    })

    let accessToken: string

    if (!session) {
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
      session = authResult.session
      accessToken = authResult.accessToken
    } else {
      accessToken = session.sessionToken ?? ''
    }

    // Generate FA(3) XML for the invoice
    const xmlService = new KsefXmlService()
    const invoiceXml = await xmlService.generateFa3Xml(em, invoiceId)
    submission.faXml = invoiceXml

    // Prepare invoice for submission (encrypt if session has encryption keys)
    const sessionKey = session.encryptionKey ? Buffer.from(session.encryptionKey, 'base64') : undefined
    const sessionIv = session.encryptionIv ? Buffer.from(session.encryptionIv, 'base64') : undefined
    const prepared = prepareInvoiceForSubmission(invoiceXml, sessionKey, sessionIv)

    // Submit to KSeF
    const sendUrl = getSendInvoiceUrl(environment as 'test' | 'demo' | 'production')
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

    // Update submission with result
    submission.status = 'submitted'
    submission.ksefSessionId = session.id
    submission.ksefReferenceNumber = sendResult.elementReferenceNumber
    submission.submittedAt = new Date()
    submission.errorMessage = null
    submission.errorCode = null

    session.invoiceCount = (session.invoiceCount ?? 0) + 1

    await em.persist([submission, session]).flush()

    await emitKsefEvent('ksef.submission.submitted', buildEventPayload(submission))

    // Enqueue status poll job
    const { createQueue } = await import('@open-mercato/queue')
    const pollQueue = createQueue<StatusPollPayload>('ksef-status-poll', 'local')
    await pollQueue.enqueue({
      invoiceId,
      submissionId,
      referenceNumber: sendResult.elementReferenceNumber,
      tenantId,
      organizationId,
      attempt: 1,
    })
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
    invoiceId: submission.invoiceId,
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
