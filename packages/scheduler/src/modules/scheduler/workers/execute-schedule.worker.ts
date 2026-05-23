import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import { createQueue } from '@open-mercato/queue'
import { getRedisUrlOrThrow } from '@open-mercato/shared/lib/redis/connection'
import type { EntityManager } from '@mikro-orm/core'
import { ScheduledJob } from '../data/entities.js'
import { CommandBus } from '@open-mercato/shared/lib/commands'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { emitSchedulerEvent } from '../events.js'
import {
  bindingsFromSchedule,
  recordScheduleRun,
  schedulerLogger,
  withScheduleSpan,
  type ScheduleBindings,
} from '../lib/observability.js'

export const metadata: WorkerMeta = {
  queue: 'scheduler-execution',
  concurrency: 5,
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
  const payload = (job.payload || (job as unknown as { data?: ExecuteSchedulePayload }).data) as ExecuteSchedulePayload | undefined

  if (!payload || !payload.scheduleId) {
    schedulerLogger.error('Invalid scheduler job payload', {
      jobId: ctx.jobId,
      payload: job.payload,
    })
    throw new Error('scheduleId is required in job payload')
  }

  const { scheduleId } = payload
  const attemptNumber = ctx.attemptNumber || 1

  const em = ctx.resolve<EntityManager>('em')
  const rbacService = ctx.resolve<{ tenantHasFeature(tenantId: string | null | undefined, feature: string): Promise<boolean> }>('rbacService')

  const schedule = await em.findOne(ScheduledJob, {
    id: scheduleId,
    deletedAt: null,
  })

  if (!schedule) {
    schedulerLogger.warn('Scheduled job not found or deleted', {
      scheduleId,
      jobId: ctx.jobId,
    })
    return
  }

  const bindings = bindingsFromSchedule(schedule, 'worker')
  const log = schedulerLogger.child({ ...bindings, jobId: ctx.jobId, attemptNumber })

  if (payload.scopeType !== schedule.scopeType) {
    log.error('Schedule scope type mismatch — potential security issue', {
      payloadScope: payload.scopeType,
      dbScope: schedule.scopeType,
    })
    throw new Error('Schedule scope type mismatch - potential security issue')
  }

  if (payload.tenantId !== schedule.tenantId) {
    log.error('Schedule tenant ID mismatch — potential security issue', {
      payloadTenant: payload.tenantId,
      dbTenant: schedule.tenantId,
    })
    throw new Error('Schedule tenant ID mismatch - potential security issue')
  }

  if (payload.organizationId !== schedule.organizationId) {
    log.error('Schedule organization ID mismatch — potential security issue', {
      payloadOrg: payload.organizationId,
      dbOrg: schedule.organizationId,
    })
    throw new Error('Schedule organization ID mismatch - potential security issue')
  }

  if (!schedule.isEnabled) {
    log.debug('Schedule disabled, skipping')
    await emitSchedulerEvent('scheduler.job.skipped', {
      id: schedule.id,
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
      reason: 'Schedule is disabled',
    })
    recordScheduleRun(bindings, 'skipped')
    return
  }

  log.info('Scheduled job started')
  await emitSchedulerEvent('scheduler.job.started', {
    id: schedule.id,
    tenantId: schedule.tenantId,
    organizationId: schedule.organizationId,
    scheduleName: schedule.name,
    attemptNumber,
  })
  recordScheduleRun(bindings, 'started')

  const startMs = Date.now()

  try {
    await withScheduleSpan(bindings, async (span) => {
      span.setAttribute('scheduler.attempt_number', attemptNumber)

      if (schedule.requireFeature) {
        const hasFeature = await rbacService.tenantHasFeature(
          schedule.tenantId,
          schedule.requireFeature,
        )

        if (!hasFeature) {
          log.info('Schedule skipped — required feature not enabled', {
            requireFeature: schedule.requireFeature,
          })
          span.setAttribute('scheduler.outcome', 'skipped')
          await emitSchedulerEvent('scheduler.job.skipped', {
            id: schedule.id,
            tenantId: schedule.tenantId,
            organizationId: schedule.organizationId,
            reason: `Feature not enabled: ${schedule.requireFeature}`,
          })
          recordScheduleRun(bindings, 'skipped', Date.now() - startMs)
          return
        }
      }

      if (schedule.targetType === 'queue' && schedule.targetQueue) {
        await runQueueTarget(schedule, em, bindings, log, span, startMs)
      } else if (schedule.targetType === 'command' && schedule.targetCommand) {
        await runCommandTarget(schedule, em, ctx, bindings, log, span, startMs)
      } else {
        throw new Error('Invalid target configuration')
      }
    })
  } catch (error) {
    const durationMs = Date.now() - startMs
    const message = error instanceof Error ? error.message : String(error)
    log.error('Scheduled job failed', {
      error: message,
      durationMs,
      stack: error instanceof Error ? error.stack : undefined,
    })
    await emitSchedulerEvent('scheduler.job.failed', {
      id: schedule.id,
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
      scheduleName: schedule.name,
      scopeType: schedule.scopeType,
      error: message,
      failedAt: new Date(),
    })
    recordScheduleRun(bindings, 'failed', durationMs)
    throw error
  }
}

async function runQueueTarget(
  schedule: ScheduledJob,
  em: EntityManager,
  bindings: ScheduleBindings,
  log: ReturnType<typeof schedulerLogger.child>,
  span: import('@opentelemetry/api').Span,
  startMs: number,
): Promise<void> {
  const queueStrategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
  const targetQueue = createQueue(schedule.targetQueue!, queueStrategy, {
    connection: { url: getRedisUrlOrThrow('QUEUE') },
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

  const durationMs = Date.now() - startMs
  span.setAttribute('scheduler.outcome', 'completed')
  span.setAttribute('scheduler.queue_job_id', targetJobId ?? 'unknown')
  span.setAttribute('scheduler.duration_ms', durationMs)

  await emitSchedulerEvent('scheduler.job.completed', {
    id: schedule.id,
    tenantId: schedule.tenantId,
    organizationId: schedule.organizationId,
    queueJobId: targetJobId,
    queueName: schedule.targetQueue,
  })
  recordScheduleRun(bindings, 'completed', durationMs)

  log.info('Scheduled job enqueued target', {
    targetQueue: schedule.targetQueue,
    queueJobId: targetJobId,
    durationMs,
  })
}

async function runCommandTarget(
  schedule: ScheduledJob,
  em: EntityManager,
  ctx: HandlerContext,
  bindings: ScheduleBindings,
  log: ReturnType<typeof schedulerLogger.child>,
  span: import('@opentelemetry/api').Span,
  startMs: number,
): Promise<void> {
  const commandBus = new CommandBus()
  const commandInput = {
    ...((schedule.targetPayload as Record<string, unknown>) || {}),
    tenantId: schedule.tenantId,
    organizationId: schedule.organizationId,
  }

  const commandCtx: CommandRuntimeContext = {
    container: ctx as unknown as AppContainer,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: schedule.organizationId || null,
    organizationIds: schedule.organizationId ? [schedule.organizationId] : null,
    request: undefined,
  }

  const commandResult = await commandBus.execute(schedule.targetCommand!, {
    input: commandInput,
    ctx: commandCtx,
  })

  schedule.lastRunAt = new Date()
  await em.flush()

  const durationMs = Date.now() - startMs
  span.setAttribute('scheduler.outcome', 'completed')
  span.setAttribute('scheduler.command_id', schedule.targetCommand!)
  span.setAttribute('scheduler.duration_ms', durationMs)

  await emitSchedulerEvent('scheduler.job.completed', {
    id: schedule.id,
    tenantId: schedule.tenantId,
    organizationId: schedule.organizationId,
    commandId: schedule.targetCommand,
    commandResult: commandResult.result,
  })
  recordScheduleRun(bindings, 'completed', durationMs)

  log.info('Scheduled job executed command', {
    commandId: schedule.targetCommand,
    durationMs,
  })
}
