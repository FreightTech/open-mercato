import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { KsefSubmission, KsefSession } from '../data/entities'
import { resolveKsefStatus } from '../lib/status-codes'
import { KsefClientService } from '../services/client.service'
import { emitKsefEvent } from '../events'
import type { KsefSubmissionEventPayload } from '../events'

export const UPO_DOWNLOAD_QUEUE_NAME = 'ksef-upo-download'

export const metadata: WorkerMeta = {
  queue: UPO_DOWNLOAD_QUEUE_NAME,
  concurrency: 3,
  id: 'ksef-upo-download',
}

export type UpoDownloadPayload = {
  sessionId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<UpoDownloadPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { sessionId, referenceNumber, tenantId, organizationId } = job.payload

  const session = await em.findOne(KsefSession, {
    id: sessionId,
    tenantId,
    organizationId,
  })

  if (!session) {
    return
  }

  if (session.upoXml) {
    return
  }

  try {
    // Load KSeF credentials for environment
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em as any)
    const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })
    const environment = (credentials?.environment as string) ?? 'test'

    if (!session.sessionToken) {
      throw new Error('Session has no access token for UPO download')
    }

    const client = new KsefClientService(environment as 'test' | 'demo' | 'production')
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

    // Update all accepted submissions in this session to 'upo_downloaded'
    const submissions = await em.find(KsefSubmission, {
      ksefSessionId: sessionId,
      status: 'accepted',
      tenantId,
      organizationId,
    })

    for (const submission of submissions) {
      submission.status = 'upo_downloaded'
      submission.upoXml = upoResult.upo
      em.persist(submission)
    }

    await em.flush()

    for (const submission of submissions) {
      await emitKsefEvent('ksef.submission.upo_downloaded', buildEventPayload(submission))
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    session.errorMessage = errorMessage
    await em.persist(session).flush()

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
