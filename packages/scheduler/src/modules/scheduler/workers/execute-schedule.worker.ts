import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import { createQueue } from '@open-mercato/queue'
import { getRedisUrl } from '@open-mercato/shared/lib/redis/connection'
import type { EntityManager } from '@mikro-orm/core'
import { ScheduledJob } from '../data/entities.js'
import { CommandBus } from '@open-mercato/shared/lib/commands'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { emitSchedulerEvent } from '../events.js'

// Worker metadata for auto-discovery
export const metadata: WorkerMeta = {
  queue: 'scheduler-execution',
  concurrency: 5, // Process up to 5 schedules concurrently
}

export type ExecuteSchedulePayload = {
  scheduleId: string
  tenantId?: string | null
  organizationId?: string | null
  scopeType: 'system' | 'organization' | 'tenant'
  triggerType?: 'scheduled' | 'manual'
  triggeredByUserId?: string | null
}

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function executeScheduleWorker(
  job: QueuedJob<ExecuteSchedulePayload>,
  ctx: JobContext & HandlerContext,
): Promise<void> {
  console.debug('[scheduler:execute] Processing job:', {
    jobId: ctx.jobId,
    attemptNumber: ctx.attemptNumber,
  })

  // Defensive: handle both data and payload for BullMQ compatibility
  const payload = (job.payload || (job as unknown as { data?: ExecuteSchedulePayload }).data) as ExecuteSchedulePayload | undefined

  if (!payload || !payload.scheduleId) {
    console.error('[scheduler:execute] Invalid job payload:', {
      jobId: ctx.jobId,
      payload: job.payload,
    })
    throw new Error('scheduleId is required in job payload')
  }

  const { scheduleId } = payload

  const em = ctx.resolve<EntityManager>('em')
  const rbacService = ctx.resolve<{ tenantHasFeature(tenantId: string | null | undefined, feature: string): Promise<boolean> }>('rbacService')

  // Load fresh schedule from database
  const schedule = await em.findOne(ScheduledJob, {
    id: scheduleId,
    deletedAt: null,
  })

  if (!schedule) {
    console.log(`[scheduler:worker] Schedule not found or deleted: ${scheduleId}`)
    return
  }

  // CRITICAL: Verify scope integrity
  if (payload.scopeType !== schedule.scopeType) {
    console.error(`[scheduler:worker] Scope type mismatch for schedule ${scheduleId}:`, {
      payloadScope: payload.scopeType,
      dbScope: schedule.scopeType,
    })
    throw new Error('Schedule scope type mismatch - potential security issue')
  }

  if (payload.tenantId !== schedule.tenantId) {
    console.error(`[scheduler:worker] Tenant ID mismatch for schedule ${scheduleId}:`, {
      payloadTenant: payload.tenantId,
      dbTenant: schedule.tenantId,
    })
    throw new Error('Schedule tenant ID mismatch - potential security issue')
  }

  if (payload.organizationId !== schedule.organizationId) {
    console.error(`[scheduler:worker] Organization ID mismatch for schedule ${scheduleId}:`, {
      payloadOrg: payload.organizationId,
      dbOrg: schedule.organizationId,
    })
    throw new Error('Schedule organization ID mismatch - potential security issue')
  }

  if (!schedule.isEnabled) {
    console.debug(`[scheduler:worker] Schedule is disabled: ${scheduleId}`)
    await emitSchedulerEvent('scheduler.job.skipped', {
      id: schedule.id,
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
      reason: 'Schedule is disabled',
    })
    return
  }

  await emitSchedulerEvent('scheduler.job.started', {
    id: schedule.id,
    tenantId: schedule.tenantId,
    organizationId: schedule.organizationId,
    scheduleName: schedule.name,
    attemptNumber: ctx.attemptNumber || 1,
  })

  if (schedule.requireFeature) {
      const hasFeature = await rbacService.tenantHasFeature(
      schedule.tenantId,
      schedule.requireFeature
    )

    if (!hasFeature) {
      await emitSchedulerEvent('scheduler.job.skipped', {
        id: schedule.id,
        tenantId: schedule.tenantId,
        organizationId: schedule.organizationId,
        reason: `Feature not enabled: ${schedule.requireFeature}`,
      })

      console.debug(`[scheduler:worker] Schedule skipped - feature not enabled: ${schedule.requireFeature}`)
      return
    }
  }

  if (schedule.targetType === 'queue' && schedule.targetQueue) {
    const queueStrategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
    const targetQueue = createQueue(schedule.targetQueue, queueStrategy, {
      connection: { url: getRedisUrl('QUEUE') },
    })

    let targetJobId: string | undefined
    try {
      const executionTimestamp = Date.now()
      const idempotencyKey = `scheduler-${schedule.id}-${executionTimestamp}`

      const queuePayload = {
        ...((schedule.targetPayload as Record<string, unknown>) || {}),
        tenantId: schedule.tenantId,
        organizationId: schedule.organizationId,
        _idempotencyKey: idempotencyKey,
      }

      targetJobId = await targetQueue.enqueue(queuePayload)
    } finally {
      await targetQueue.close()
    }

    schedule.lastRunAt = new Date()
    await em.flush()

    await emitSchedulerEvent('scheduler.job.completed', {
      id: schedule.id,
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
      queueJobId: targetJobId,
      queueName: schedule.targetQueue,
    })

    console.debug(`[scheduler:worker] Successfully enqueued job`, {
      scheduleId: schedule.id,
      targetQueue: schedule.targetQueue,
      queueJobId: targetJobId,
    })

  } else if (schedule.targetType === 'command' && schedule.targetCommand) {
    const commandBus = new CommandBus()

    const commandInput = {
      ...((schedule.targetPayload as Record<string, unknown>) || {}),
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
    }

    // Build command runtime context
    // Scheduled commands run without user auth but with proper tenant/org scope
    const commandCtx: CommandRuntimeContext = {
      container: ctx as unknown as AppContainer,
      auth: null, // Scheduled commands run without user authentication
      organizationScope: null, // No organization scope filtering for scheduled commands
      selectedOrganizationId: schedule.organizationId || null,
      organizationIds: schedule.organizationId ? [schedule.organizationId] : null,
      request: undefined,
    }

    const commandResult = await commandBus.execute(schedule.targetCommand, {
      input: commandInput,
      ctx: commandCtx,
    })

    schedule.lastRunAt = new Date()
    await em.flush()

    await emitSchedulerEvent('scheduler.job.completed', {
      id: schedule.id,
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
      commandId: schedule.targetCommand,
      commandResult: commandResult.result,
    })

    console.debug(`[scheduler:worker] Successfully executed command`, {
      scheduleId: schedule.id,
      commandId: schedule.targetCommand,
      result: commandResult.result,
    })

  } else {
    throw new Error('Invalid target configuration')
  }
}
