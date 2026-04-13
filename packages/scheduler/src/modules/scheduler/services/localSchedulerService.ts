import type { EntityManager } from '@mikro-orm/core'
import type { Queue } from '@open-mercato/queue'
import { CommandBus } from '@open-mercato/shared/lib/commands'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ScheduledJob } from '../data/entities.js'
import { LocalLockStrategy } from '../lib/localLockStrategy'
import { recalculateNextRun } from '../lib/nextRunCalculator'
import { emitSchedulerEvent } from '../events.js'
import { getGlobalEventBus } from '@open-mercato/shared/modules/events'
import {
  bindingsFromSchedule,
  recordScheduleRun,
  schedulerLogger,
  withScheduleSpan,
} from '../lib/observability.js'

const log = schedulerLogger.child({ component: 'localSchedulerService' })

export interface RbacServiceLike {
  tenantHasFeature(tenantId: string | null | undefined, feature: string, opts?: { organizationId?: string | null }): Promise<boolean>
}

export interface LocalSchedulerConfig {
  pollIntervalMs: number
}

export class LocalSchedulerService {
  private isRunning = false
  private pollTimer?: NodeJS.Timeout
  private lockStrategy: LocalLockStrategy

  constructor(
    private em: () => EntityManager,
    private queueFactory: (name: string) => Queue,
    private rbacService: RbacServiceLike,
    private config: LocalSchedulerConfig = { pollIntervalMs: 30000 },
  ) {
    this.lockStrategy = new LocalLockStrategy(em)
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Already running')
      return
    }

    this.isRunning = true
    log.info('Starting polling engine', { pollIntervalMs: this.config.pollIntervalMs })

    await this.poll()

    this.pollTimer = setInterval(() => {
      this.poll().catch((error) => {
        log.error('Poll error', { error: error instanceof Error ? error.message : String(error) })
      })
    }, this.config.pollIntervalMs)

    log.info('Polling engine started')
  }

  async stop(): Promise<void> {
    log.info('Stopping polling engine')
    this.isRunning = false

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }

    log.info('Polling engine stopped')
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    const em = this.em().fork()

    try {
      // Find enabled schedules that are due (limited to avoid spikes after outages)
      const dueSchedules = await em.find(ScheduledJob, {
        isEnabled: true,
        deletedAt: null,
        nextRunAt: { $lte: new Date() },
      }, {
        limit: 100,
        orderBy: { nextRunAt: 'ASC' },
      })

      if (dueSchedules.length === 0) {
        log.debug('No due schedules')
        return
      }

      log.debug('Due schedules picked up', { dueCount: dueSchedules.length })

      for (const schedule of dueSchedules) {
        await this.executeSchedule(schedule)
      }
    } catch (error: unknown) {
      log.error('Poll failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async executeSchedule(schedule: ScheduledJob): Promise<void> {
    const lockKey = `schedule:${schedule.id}`
    const bindings = bindingsFromSchedule(schedule, 'local-poll')
    const slog = log.child(bindings)

    const acquired = await this.lockStrategy.tryLock(lockKey)

    if (!acquired) {
      slog.debug('Schedule already locked, skipping')
      return
    }

    const startMs = Date.now()

    try {
      slog.info('Scheduled job started')

      await emitSchedulerEvent('scheduler.job.started', {
        id: schedule.id,
        tenantId: schedule.tenantId,
        organizationId: schedule.organizationId,
        scheduleName: schedule.name,
        scopeType: schedule.scopeType,
        triggerType: 'scheduled',
        startedAt: new Date(),
      })
      recordScheduleRun(bindings, 'started')

      try {
        await withScheduleSpan(bindings, async (span) => {
          if (schedule.requireFeature) {
            const hasFeature = await this.checkFeature(schedule)

            if (!hasFeature) {
              slog.info('Schedule skipped — required feature missing', {
                requireFeature: schedule.requireFeature,
              })
              span.setAttribute('scheduler.outcome', 'skipped')

              await emitSchedulerEvent('scheduler.job.skipped', {
                id: schedule.id,
                tenantId: schedule.tenantId,
                organizationId: schedule.organizationId,
                scheduleName: schedule.name,
                scopeType: schedule.scopeType,
                reason: `Missing required feature: ${schedule.requireFeature}`,
                skippedAt: new Date(),
              })
              recordScheduleRun(bindings, 'skipped', Date.now() - startMs)

              await this.updateNextRun(schedule)
              return
            }
          }

          if (schedule.targetType === 'queue') {
            await this.executeQueueTarget(schedule, slog)
          } else if (schedule.targetType === 'command') {
            await this.executeCommandTarget(schedule, slog)
          } else {
            throw new Error(`Unknown target type: ${schedule.targetType}`)
          }

          const em = this.em().fork()
          const freshSchedule = await em.findOne(ScheduledJob, { id: schedule.id })

          if (freshSchedule) {
            freshSchedule.lastRunAt = new Date()

            const nextRun = recalculateNextRun(
              freshSchedule.scheduleType,
              freshSchedule.scheduleValue,
              freshSchedule.timezone
            )

            if (nextRun) {
              freshSchedule.nextRunAt = nextRun
            }

            await em.flush()
          }

          const durationMs = Date.now() - startMs
          span.setAttribute('scheduler.outcome', 'completed')
          span.setAttribute('scheduler.duration_ms', durationMs)
          slog.info('Scheduled job completed', { durationMs })

          await emitSchedulerEvent('scheduler.job.completed', {
            id: schedule.id,
            tenantId: schedule.tenantId,
            organizationId: schedule.organizationId,
            scheduleName: schedule.name,
            scopeType: schedule.scopeType,
            completedAt: new Date(),
          })
          recordScheduleRun(bindings, 'completed', durationMs)
        })
      } catch (error: unknown) {
        const durationMs = Date.now() - startMs
        const message = error instanceof Error ? error.message : String(error)
        slog.error('Scheduled job failed', {
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

        await this.updateNextRun(schedule)
      }
    } finally {
      await this.lockStrategy.unlock(lockKey)
    }
  }

  private async executeQueueTarget(
    schedule: ScheduledJob,
    slog: ReturnType<typeof log.child>,
  ): Promise<void> {
    if (!schedule.targetQueue) {
      throw new Error('Target queue is required for queue target type')
    }

    const queue = this.queueFactory(schedule.targetQueue)

    await queue.enqueue({
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      scopeType: schedule.scopeType,
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
      payload: schedule.targetPayload || {},
      triggeredAt: new Date(),
    })

    slog.debug('Enqueued job to target queue', { targetQueue: schedule.targetQueue })
  }

  private async executeCommandTarget(
    schedule: ScheduledJob,
    slog: ReturnType<typeof log.child>,
  ): Promise<void> {
    if (!schedule.targetCommand) {
      throw new Error('Target command is required for command target type')
    }

    const commandBus = new CommandBus()

    const commandInput = {
      ...((schedule.targetPayload as Record<string, unknown>) || {}),
      tenantId: schedule.tenantId,
      organizationId: schedule.organizationId,
    }

    const commandCtx: CommandRuntimeContext = {
      container: {
        resolve: (name: string) => {
          if (name === 'em') return this.em()
          if (name === 'eventBus') return getGlobalEventBus()
          if (name === 'rbacService') return this.rbacService
          throw new Error(`Service not available in scheduler context: ${name}`)
        },
      } as CommandRuntimeContext['container'],
      auth: null,
      organizationScope: null,
      selectedOrganizationId: schedule.organizationId || null,
      organizationIds: schedule.organizationId ? [schedule.organizationId] : null,
      request: undefined,
    }

    const result = await commandBus.execute(schedule.targetCommand, {
      input: commandInput,
      ctx: commandCtx,
    })

    slog.debug('Executed command', { commandId: schedule.targetCommand, result })
  }

  private async checkFeature(schedule: ScheduledJob): Promise<boolean> {
    if (!schedule.requireFeature) {
      return true
    }

    try {
      if (schedule.scopeType === 'system') {
        return true
      }

      const hasFeature = await this.rbacService.tenantHasFeature(
        schedule.tenantId,
        schedule.requireFeature,
        {
          organizationId: schedule.organizationId,
        }
      )

      return hasFeature
    } catch (error: unknown) {
      log.error('Feature check failed', {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  private async updateNextRun(schedule: ScheduledJob): Promise<void> {
    const em = this.em().fork()
    const freshSchedule = await em.findOne(ScheduledJob, { id: schedule.id })

    if (freshSchedule) {
      const nextRun = recalculateNextRun(
        freshSchedule.scheduleType,
        freshSchedule.scheduleValue,
        freshSchedule.timezone
      )

      if (nextRun) {
        freshSchedule.nextRunAt = nextRun
        await em.flush()
      }
    }
  }
}
