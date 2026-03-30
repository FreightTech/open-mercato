import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { KsefSubmission } from '../data/entities'
import { getInvoiceStatusUrl } from '../lib/endpoints'
import { resolveKsefStatus, getProcessingDescription } from '../lib/status-codes'
import type { KsefInvoiceStatusResponse } from '../lib/types'
import { emitKsefEvent } from '../events'
import type { KsefSubmissionEventPayload } from '../events'

export const STATUS_POLL_QUEUE_NAME = 'ksef-status-poll'

export const metadata: WorkerMeta = {
  queue: STATUS_POLL_QUEUE_NAME,
  concurrency: 5,
  id: 'ksef-status-poll',
}

export type StatusPollPayload = {
  invoiceId: string
  submissionId: string
  referenceNumber: string
  tenantId: string
  organizationId: string
  attempt?: number
}

const MAX_POLL_ATTEMPTS = 20
const BASE_DELAY_MS = 5000
const MAX_DELAY_MS = 300000

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<StatusPollPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { invoiceId, submissionId, referenceNumber, tenantId, organizationId } = job.payload
  const attempt = job.payload.attempt ?? 1

  const submission = await em.findOne(KsefSubmission, {
    id: submissionId,
    tenantId,
    organizationId,
  })

  if (!submission) {
    return
  }

  // Skip if submission is already in a terminal status
  if (['accepted', 'rejected', 'upo_downloaded', 'cancelled'].includes(submission.status)) {
    return
  }

  if (attempt > MAX_POLL_ATTEMPTS) {
    submission.status = 'error'
    submission.errorMessage = `Status poll timed out after ${MAX_POLL_ATTEMPTS} attempts`
    await em.persist(submission).flush()

    await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))
    return
  }

  try {
    // Load KSeF credentials for environment
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em as any)
    const credentials = await credentialsService.getDecrypted('ksef', { tenantId, organizationId })
    const environment = (credentials?.environment as string) ?? 'test'

    const statusUrl = getInvoiceStatusUrl(environment as 'test' | 'demo' | 'production', referenceNumber)
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text()
      throw new Error(`KSeF status poll failed (${statusResponse.status}): ${errorBody}`)
    }

    const statusResult = (await statusResponse.json()) as KsefInvoiceStatusResponse
    const resolvedStatus = resolveKsefStatus(statusResult.processingCode)
    const processingDescription = getProcessingDescription(statusResult.processingCode)

    if (resolvedStatus === 'accepted') {
      submission.status = 'accepted'
      submission.ksefNumber = statusResult.ksefReferenceNumber ?? null
      submission.acceptedAt = statusResult.acquisitionTimestamp
        ? new Date(statusResult.acquisitionTimestamp)
        : new Date()
      submission.errorMessage = null
      submission.errorCode = null

      await em.persist(submission).flush()

      await emitKsefEvent('ksef.submission.accepted', buildEventPayload(submission))
      return
    }

    if (resolvedStatus === 'rejected') {
      submission.status = 'rejected'
      submission.errorMessage = processingDescription
      submission.errorCode = String(statusResult.processingCode)

      await em.persist(submission).flush()

      await emitKsefEvent('ksef.submission.rejected', buildEventPayload(submission))
      return
    }

    if (resolvedStatus === 'error') {
      submission.status = 'error'
      submission.errorMessage = processingDescription
      submission.errorCode = String(statusResult.processingCode)

      await em.persist(submission).flush()

      await emitKsefEvent('ksef.submission.error', buildEventPayload(submission))
      return
    }

    // Still processing - re-enqueue with exponential backoff
    const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
    await new Promise((resolve) => setTimeout(resolve, delayMs))

    const { createQueue } = await import('@open-mercato/queue')
    const pollQueue = createQueue<StatusPollPayload>(STATUS_POLL_QUEUE_NAME, 'local')
    await pollQueue.enqueue({
      invoiceId,
      submissionId,
      referenceNumber,
      tenantId,
      organizationId,
      attempt: attempt + 1,
    })
  } catch (err: unknown) {
    if (attempt < MAX_POLL_ATTEMPTS) {
      const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, delayMs))

      const { createQueue } = await import('@open-mercato/queue')
      const pollQueue = createQueue<StatusPollPayload>(STATUS_POLL_QUEUE_NAME, 'local')
      await pollQueue.enqueue({
        invoiceId,
        submissionId,
        referenceNumber,
        tenantId,
        organizationId,
        attempt: attempt + 1,
      })
      return
    }

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
