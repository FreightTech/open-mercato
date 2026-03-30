import type { EntityManager } from '@mikro-orm/core'
import type { Queue } from '@open-mercato/queue'
import { CommandBus } from '@open-mercato/shared/lib/commands'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ScheduledJob } from '../data/entities.js'
import { LocalLockStrategy } from '../lib/localLockStrategy'
import { recalculateNextRun } from '../lib/nextRunCalculator'
import { emitSchedulerEvent } from '../events.js'
import { getGlobalEventBus } from '@open-mercato/shared/modules/events'

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
      console.warn('[scheduler:local] Already running')
      return
    }

    this.isRunning = true
    console.log('[scheduler:local] Starting polling engine...')
    console.log(`[scheduler:local] Poll interval: ${this.config.pollIntervalMs}ms`)

    await this.poll()

    this.pollTimer = setInterval(() => {
      this.poll().catch((error) => {
        console.error('[scheduler:local] Poll error:', error)
      })
    }, this.config.pollIntervalMs)

    console.log('[scheduler:local] ✓ Polling engine started')
  }

  async stop(): Promise<void> {
    console.log('[scheduler:local] Stopping polling engine...')
    this.isRunning = false

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }

    console.log('[scheduler:local] ✓ Polling engine stopped')
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
        console.log('[scheduler:local] No due schedules')
        return
      }

      console.log(`[scheduler:local] Found ${dueSchedules.length} due schedule(s)`)

      for (const schedule of dueSchedules) {
        await this.executeSchedule(schedule)
      }
    } catch (error: unknown) {
      console.error('[scheduler:local] Poll failed:', error)
    }
  }

  private async executeSchedule(schedule: ScheduledJob): Promise<void> {
    const lockKey = `schedule:${schedule.id}`

    const acquired = await this.lockStrategy.tryLock(lockKey)

    if (!acquired) {
      console.log(`[scheduler:local] Schedule ${schedule.name} is already locked, skipping`)
      return
    }

    try {
      console.log(`[scheduler:local] Executing schedule: ${schedule.name} (${schedule.id})`)

      await emitSchedulerEvent('scheduler.job.started', {
        id: schedule.id,
        tenantId: schedule.tenantId,
        organizationId: schedule.organizationId,
        scheduleName: schedule.name,
        scopeType: schedule.scopeType,
        triggerType: 'scheduled',
        startedAt: new Date(),
      })

      try {
        if (schedule.requireFeature) {
          const hasFeature = await this.checkFeature(schedule)

          if (!hasFeature) {
            console.log(`[scheduler:local] Schedule ${schedule.name} skipped: missing feature ${schedule.requireFeature}`)

            await emitSchedulerEvent('scheduler.job.skipped', {
              id: schedule.id,
              tenantId: schedule.tenantId,
              organizationId: schedule.organizationId,
              scheduleName: schedule.name,
              scopeType: schedule.scopeType,
              reason: `Missing required feature: ${schedule.requireFeature}`,
              skippedAt: new Date(),
            })

            await this.updateNextRun(schedule)
            return
          }
        }

        if (schedule.targetType === 'queue') {
          await this.executeQueueTarget(schedule)
        } else if (schedule.targetType === 'command') {
          await this.executeCommandTarget(schedule)
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

        console.log(`[scheduler:local] ✓ Schedule ${schedule.name} completed successfully`)

        await emitSchedulerEvent('scheduler.job.completed', {
          id: schedule.id,
          tenantId: schedule.tenantId,
          organizationId: schedule.organizationId,
          scheduleName: schedule.name,
          scopeType: schedule.scopeType,
          completedAt: new Date(),
        })
      } catch (error: unknown) {
        console.error(`[scheduler:local] ✗ Schedule ${schedule.name} failed:`, error)

        await emitSchedulerEvent('scheduler.job.failed', {
          id: schedule.id,
          tenantId: schedule.tenantId,
          organizationId: schedule.organizationId,
          scheduleName: schedule.name,
          scopeType: schedule.scopeType,
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date(),
        })

        await this.updateNextRun(schedule)
      }
    } finally {
      await this.lockStrategy.unlock(lockKey)
    }
  }

  private async executeQueueTarget(schedule: ScheduledJob): Promise<void> {
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

    console.log(`[scheduler:local] Enqueued job to queue: ${schedule.targetQueue}`)
  }

  private async executeCommandTarget(schedule: ScheduledJob): Promise<void> {
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

    console.log(`[scheduler:local] Executed command: ${schedule.targetCommand}`, result)
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
      console.error('[scheduler:local] Feature check failed:', error)
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
