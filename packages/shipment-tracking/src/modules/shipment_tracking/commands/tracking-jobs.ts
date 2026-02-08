import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import { TrackingJob, Shipment } from '../data/entities'
import { generatePollSchedule, getNextPollDate } from '../lib/schedule-generator'
import type { TrackingJobCreateInput } from '../data/validators'

function ensureScope(ctx: CommandRuntimeContext, tenantId: string, organizationId: string) {
  if (ctx.auth?.tenantId && ctx.auth.tenantId !== tenantId) {
    throw new Error('Tenant mismatch')
  }
  if (!ctx.auth?.isSuperAdmin && ctx.auth?.organizationId && ctx.auth.organizationId !== organizationId) {
    throw new Error('Organization mismatch')
  }
}

const createTrackingJob: CommandHandler<TrackingJobCreateInput, { id: string }> = {
  id: 'shipment_tracking.tracking_job.create',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const shipment = await em.findOne(Shipment, {
      id: input.shipmentId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      deletedAt: null,
    })
    if (!shipment) throw new Error('Shipment not found')

    // Generate schedule if not provided
    const schedule = input.schedule ?? generatePollSchedule({
      etd: shipment.etd,
      eta: shipment.eta,
      atd: shipment.atd,
      ata: shipment.ata,
    })

    const nextPollAt = getNextPollDate(schedule)

    const job = em.create(TrackingJob, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      shipment,
      carrierName: input.carrierName,
      referenceType: input.referenceType,
      referenceValue: input.referenceValue,
      status: 'active',
      schedule,
      nextPollAt,
    })

    await em.flush()

    await eventBus.emit('shipment_tracking.tracking_job.created', {
      id: job.id,
      shipmentId: shipment.id,
      carrierName: job.carrierName,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    return { id: job.id }
  },
}

const pauseTrackingJob: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { id: string }> = {
  id: 'shipment_tracking.tracking_job.pause',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const job = await em.findOne(TrackingJob, {
      id: input.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })
    if (!job) throw new Error('Tracking job not found')

    job.status = 'paused'
    await em.flush()

    await eventBus.emit('shipment_tracking.tracking_job.updated', {
      id: job.id,
      status: 'paused',
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    return { id: job.id }
  },
}

const resumeTrackingJob: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { id: string }> = {
  id: 'shipment_tracking.tracking_job.resume',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const job = await em.findOne(TrackingJob, {
      id: input.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })
    if (!job) throw new Error('Tracking job not found')

    job.status = 'active'

    // Recalculate next poll from schedule
    if (job.schedule) {
      job.nextPollAt = getNextPollDate(job.schedule)
    }

    await em.flush()

    await eventBus.emit('shipment_tracking.tracking_job.updated', {
      id: job.id,
      status: 'active',
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    return { id: job.id }
  },
}

const deactivateTrackingJob: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { id: string }> = {
  id: 'shipment_tracking.tracking_job.deactivate',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const job = await em.findOne(TrackingJob, {
      id: input.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })
    if (!job) throw new Error('Tracking job not found')

    job.status = 'deactivated'
    job.nextPollAt = null
    await em.flush()

    await eventBus.emit('shipment_tracking.tracking_job.completed', {
      id: job.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    return { id: job.id }
  },
}

registerCommand(createTrackingJob)
registerCommand(pauseTrackingJob)
registerCommand(resumeTrackingJob)
registerCommand(deactivateTrackingJob)
