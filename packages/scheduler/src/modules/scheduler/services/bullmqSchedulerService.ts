import type { EntityManager } from '@mikro-orm/core'
import { ScheduledJob } from '../data/entities.js'
import { recalculateNextRun } from '../lib/nextRunCalculator'
import { parseCronExpression } from '../lib/cronParser'
import { parseInterval } from '../lib/intervalParser'
import { getRedisUrl, parseRedisUrl } from '@open-mercato/shared/lib/redis/connection'

interface BullRepeatableJob {
  key: string
  name: string
  id?: string | null
}

interface BullRepeatOptions {
  tz?: string
  pattern?: string
  every?: number
}

interface BullQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>
  getRepeatableJobs?(): Promise<BullRepeatableJob[]>
  removeRepeatableByKey?(key: string): Promise<boolean>
  close(): Promise<void>
}

/**
 * Production scheduler using BullMQ repeatable jobs.
 *
 * Requires Redis. Set QUEUE_STRATEGY=async to use this service.
 */
export class BullMQSchedulerService {
  private queue: BullQueue | null = null

  constructor(
    private em: () => EntityManager,
  ) {}

  private async getQueue(): Promise<BullQueue> {
    if (!this.queue) {
      try {
        const { Queue } = await import('bullmq')
        this.queue = new Queue('scheduler-execution', { connection: parseRedisUrl(getRedisUrl('QUEUE')) })
      } catch {
        throw new Error('BullMQ is required for async scheduler. Install it with: npm install bullmq')
      }
    }
    return this.queue
  }

  async register(schedule: ScheduledJob, options: { skipNextRunUpdate?: boolean } = {}): Promise<void> {
    if (!schedule.isEnabled) {
      console.debug(`[scheduler:bullmq] Skipping disabled schedule: ${schedule.id}`)
      return
    }

    try {
      if (!options.skipNextRunUpdate) {
        const nextRun = recalculateNextRun(
          schedule.scheduleType,
          schedule.scheduleValue,
          schedule.timezone
        )

        if (nextRun) {
          schedule.nextRunAt = nextRun
        }
      }

      const repeatOpts = this.buildRepeatOptions(schedule)
      const queue = await this.getQueue()
      const jobName = `schedule-${schedule.id}`

      const jobData = {
        id: jobName,
        payload: {
          scheduleId: schedule.id,
          tenantId: schedule.tenantId,
          organizationId: schedule.organizationId,
          scopeType: schedule.scopeType,
        },
        createdAt: new Date().toISOString(),
      }

      console.debug(`[scheduler:bullmq] Adding repeatable job with data:`, {
        jobName,
        scheduleId: schedule.id,
        scopeType: schedule.scopeType,
        tenantId: schedule.tenantId,
        organizationId: schedule.organizationId,
        repeatOpts,
        jobData,
      })

      await queue.add(
        jobName,
        jobData,
        {
          repeat: repeatOpts,
          removeOnComplete: {
            age: 86400 * 30,
            count: 1000,
          },
          removeOnFail: {
            age: 86400 * 90,
            count: 5000,
          },
        }
      )

      console.debug(`[scheduler:bullmq] Registered schedule: ${schedule.name} (${schedule.id})`, {
        type: schedule.scheduleType,
        pattern: schedule.scheduleValue,
        timezone: schedule.timezone,
      })
    } catch (error: unknown) {
      console.error(`[scheduler:bullmq] Failed to register schedule: ${schedule.id}`, error)
      throw error
    }
  }

  async unregister(scheduleId: string): Promise<void> {
    try {
      const queue = await this.getQueue()
      const repeatableJobs = await queue.getRepeatableJobs?.()

      if (repeatableJobs) {
        for (const job of repeatableJobs) {
          if (job.id === `schedule-${scheduleId}` || job.name === `schedule-${scheduleId}`) {
            await queue.removeRepeatableByKey?.(job.key)
            console.debug(`[scheduler:bullmq] Unregistered schedule: ${scheduleId}`)
            return
          }
        }
      }

      console.debug(`[scheduler:bullmq] No repeatable job found for schedule: ${scheduleId}`)
    } catch (error: unknown) {
      console.error(`[scheduler:bullmq] Failed to unregister schedule: ${scheduleId}`, error)
      throw error
    }
  }

  async syncAll(): Promise<void> {
    const em = this.em().fork()
    const queue = await this.getQueue()

    console.debug('[scheduler:bullmq] Starting full sync...')

    const repeatableJobs = await queue.getRepeatableJobs?.() || []
    const bullmqScheduleIds = new Set<string>(
      repeatableJobs
        .filter((j) => j.id?.startsWith('schedule-') || j.name?.startsWith('schedule-'))
        .map((j) => String(j.id || j.name).replace('schedule-', ''))
    )

    // Get enabled schedules from database in batches to avoid unbounded loads
    const BATCH_SIZE = 500
    const dbSchedules: ScheduledJob[] = []
    let offset = 0
    let batch: ScheduledJob[]
    do {
      batch = await em.find(ScheduledJob, {
        isEnabled: true,
        deletedAt: null,
      }, { limit: BATCH_SIZE, offset })
      dbSchedules.push(...batch)
      offset += BATCH_SIZE
    } while (batch.length === BATCH_SIZE)

    const dbScheduleIds = new Set(dbSchedules.map(s => s.id))

    for (const schedule of dbSchedules) {
      if (!bullmqScheduleIds.has(schedule.id)) {
        console.debug(`[scheduler:bullmq] Registering missing schedule: ${schedule.name}`)
        await this.register(schedule)
      }
    }

    for (const scheduleId of bullmqScheduleIds) {
      if (!dbScheduleIds.has(scheduleId)) {
        console.log(`[scheduler:bullmq] Removing orphaned schedule: ${scheduleId}`)
        await this.unregister(String(scheduleId))
      }
    }

    console.debug(`[scheduler:bullmq] Sync complete - ${dbSchedules.length} schedules active`)
  }

  private buildRepeatOptions(schedule: ScheduledJob): BullRepeatOptions {
    const opts: BullRepeatOptions = {
      tz: schedule.timezone || 'UTC',
    }

    if (schedule.scheduleType === 'cron') {
      parseCronExpression(schedule.scheduleValue, schedule.timezone || 'UTC')
      opts.pattern = schedule.scheduleValue
    } else if (schedule.scheduleType === 'interval') {
      const intervalMs = parseInterval(schedule.scheduleValue)
      opts.every = intervalMs
    } else {
      throw new Error(`Unsupported schedule type: ${schedule.scheduleType}`)
    }

    return opts
  }

  async getRepeatableJobs(): Promise<unknown[]> {
    try {
      const queue = await this.getQueue()
      return await queue.getRepeatableJobs?.() || []
    } catch (error) {
      console.error('[scheduler:bullmq] Failed to get repeatable jobs:', error)
      return []
    }
  }

  /**
   * Close the cached BullMQ queue connection.
   * Must be called during graceful shutdown to prevent Redis connection leaks.
   */
  async destroy(): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.close()
        this.queue = null
        console.debug('[scheduler:bullmq] Queue connection closed')
      } catch (error) {
        console.error('[scheduler:bullmq] Error closing queue:', error)
      }
    }
  }
}
