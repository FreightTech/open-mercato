import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { TrackingService } from '../services/trackingService'

function ensureScope(ctx: CommandRuntimeContext, tenantId: string, organizationId?: string) {
  if (ctx.auth?.tenantId && ctx.auth.tenantId !== tenantId) {
    throw new Error('Tenant mismatch')
  }
  if (organizationId && !ctx.auth?.isSuperAdmin && ctx.auth?.organizationId && ctx.auth.organizationId !== organizationId) {
    throw new Error('Organization mismatch')
  }
}

type PollAllInput = {
  tenantId: string
  organizationId?: string
}

type PollAllResult = {
  polled: number
  newEvents: number
  failed: number
}

/**
 * Command to poll all active tracking jobs for a tenant/organization.
 * This is called by the scheduler for daily re-polling.
 */
const pollAllActiveJobs: CommandHandler<PollAllInput, PollAllResult> = {
  id: 'shipment_tracking.tracking.poll_all',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const trackingService = ctx.container.resolve<TrackingService>('shipmentTrackingService')

    const result = await trackingService.pollAllActiveJobs(input.tenantId, input.organizationId)

    console.log('[shipment-tracking:poll_all] Command completed:', {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      ...result,
    })

    return result
  },

  buildLog({ result, input }) {
    return {
      actionLabel: 'Poll all tracking jobs',
      resourceKind: 'shipment_tracking.tracking',
      resourceId: input.organizationId ?? input.tenantId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      details: {
        polled: result.polled,
        newEvents: result.newEvents,
        failed: result.failed,
      },
    }
  },
}

type PollSingleInput = {
  jobId: string
  tenantId: string
  organizationId: string
}

type PollSingleResult = {
  newEvents: number
  shipmentsCreated: number
  shipmentsUpdated: number
}

/**
 * Command to poll a single tracking job.
 * Can be called manually to trigger an immediate poll.
 */
const pollSingleJob: CommandHandler<PollSingleInput, PollSingleResult> = {
  id: 'shipment_tracking.tracking.poll_single',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const trackingService = ctx.container.resolve<TrackingService>('shipmentTrackingService')

    const result = await trackingService.pollTrackingJob(input.jobId)

    return {
      newEvents: result.newEvents,
      shipmentsCreated: result.shipmentsCreated,
      shipmentsUpdated: result.shipmentsUpdated,
    }
  },

  buildLog({ result, input }) {
    return {
      actionLabel: 'Poll tracking job',
      resourceKind: 'shipment_tracking.tracking_job',
      resourceId: input.jobId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      details: {
        newEvents: result.newEvents,
        shipmentsCreated: result.shipmentsCreated,
        shipmentsUpdated: result.shipmentsUpdated,
      },
    }
  },
}

registerCommand(pollAllActiveJobs)
registerCommand(pollSingleJob)
