import type { Queue } from '@open-mercato/queue'
import type { TrackingPollPayload } from '../workers/tracking-poll.worker'

export const metadata = {
  event: 'shipment_tracking.tracking_job.created',
  persistent: true,
  id: 'shipment_tracking:tracking-job-created-enqueue-poll',
}

type TrackingJobCreatedPayload = {
  id: string
  shipmentId: string
  carrierName: string
  tenantId: string
  organizationId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(payload: TrackingJobCreatedPayload, ctx: ResolverContext) {
  try {
    const queue = ctx.resolve<Queue<TrackingPollPayload>>('shipmentTrackingPollQueue')

    const jobId = await queue.enqueue({
      jobId: payload.id,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })

    console.log('[shipment-tracking:enqueue-poll] Enqueued initial poll:', {
      trackingJobId: payload.id,
      shipmentId: payload.shipmentId,
      carrier: payload.carrierName,
      queueJobId: jobId,
    })
  } catch (error) {
    console.error('[shipment-tracking:enqueue-poll] Failed to enqueue poll:', {
      trackingJobId: payload.id,
      error: error instanceof Error ? error.message : error,
    })
  }
}
