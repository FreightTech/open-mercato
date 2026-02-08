import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { TrackingService } from '../services/trackingService'

export const metadata: WorkerMeta = {
  queue: 'shipment-tracking-poll',
  concurrency: 5,
}

export type TrackingPollPayload = {
  jobId: string
  tenantId: string
  organizationId: string
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function trackingPollWorker(
  job: QueuedJob<TrackingPollPayload>,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  const payload = (job.payload || (job as any).data) as TrackingPollPayload | undefined

  if (!payload || !payload.jobId) {
    console.error('[shipment-tracking:poll] Invalid job payload:', { jobId: ctx.jobId })
    throw new Error('jobId is required in job payload')
  }

  console.debug('[shipment-tracking:poll] Processing:', {
    jobId: payload.jobId,
    attemptNumber: ctx.attemptNumber,
  })

  const trackingService = ctx.resolve<TrackingService>('shipmentTrackingService')
  const result = await trackingService.pollShipment(payload.jobId)

  console.debug('[shipment-tracking:poll] Completed:', {
    jobId: payload.jobId,
    newEvents: result.newEvents,
  })
}
