import { createLogger, getMeter } from '@open-mercato/logger'
import { withSpan } from '@open-mercato/logger/tracing'
import type { Span } from '@opentelemetry/api'
import type { ScheduledJob } from '../data/entities.js'

const MODULE_NAME = 'scheduler'

export const schedulerLogger = createLogger(MODULE_NAME)

type Counter = ReturnType<ReturnType<typeof getMeter>['createCounter']>
type Histogram = ReturnType<ReturnType<typeof getMeter>['createHistogram']>

let cachedRunsCounter: Counter | null = null
let cachedRunDurationHistogram: Histogram | null = null

function runsCounter(): Counter {
  if (!cachedRunsCounter) {
    cachedRunsCounter = getMeter('scheduler').createCounter('scheduler.runs.total', {
      description: 'Number of scheduled job runs by status',
    })
  }
  return cachedRunsCounter
}

function runDurationHistogram(): Histogram {
  if (!cachedRunDurationHistogram) {
    cachedRunDurationHistogram = getMeter('scheduler').createHistogram('scheduler.run.duration_ms', {
      description: 'Duration of scheduled job runs in milliseconds',
      unit: 'ms',
    })
  }
  return cachedRunDurationHistogram
}

export type ScheduleRunStatus = 'started' | 'completed' | 'skipped' | 'failed'

export type ScheduleBindings = {
  scheduleId: string
  scheduleName: string
  scopeType: 'system' | 'organization' | 'tenant'
  tenantId: string | null
  organizationId: string | null
  targetType: 'queue' | 'command'
  targetRef: string | null
  triggerSource: 'worker' | 'local-poll' | 'bullmq'
}

export function bindingsFromSchedule(
  schedule: ScheduledJob,
  triggerSource: ScheduleBindings['triggerSource'],
): ScheduleBindings {
  return {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    scopeType: schedule.scopeType as ScheduleBindings['scopeType'],
    tenantId: schedule.tenantId ?? null,
    organizationId: schedule.organizationId ?? null,
    targetType: schedule.targetType as ScheduleBindings['targetType'],
    targetRef:
      schedule.targetType === 'queue'
        ? schedule.targetQueue ?? null
        : schedule.targetCommand ?? null,
    triggerSource,
  }
}

function metricAttributes(b: ScheduleBindings, status: ScheduleRunStatus) {
  return {
    'scheduler.schedule_id': b.scheduleId,
    'scheduler.schedule_name': b.scheduleName,
    'scheduler.scope_type': b.scopeType,
    'scheduler.tenant_id': b.tenantId ?? 'system',
    'scheduler.organization_id': b.organizationId ?? 'system',
    'scheduler.target_type': b.targetType,
    'scheduler.target_ref': b.targetRef ?? 'unknown',
    'scheduler.trigger_source': b.triggerSource,
    'scheduler.status': status,
  }
}

export function recordScheduleRun(
  bindings: ScheduleBindings,
  status: ScheduleRunStatus,
  durationMs?: number,
): void {
  runsCounter().add(1, metricAttributes(bindings, status))
  if (typeof durationMs === 'number') {
    runDurationHistogram().record(durationMs, metricAttributes(bindings, status))
  }
}

export async function withScheduleSpan<T>(
  bindings: ScheduleBindings,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(
    {
      name: `scheduler.execute.${bindings.scheduleName}`,
      attributes: {
        'scheduler.schedule_id': bindings.scheduleId,
        'scheduler.schedule_name': bindings.scheduleName,
        'scheduler.scope_type': bindings.scopeType,
        'scheduler.tenant_id': bindings.tenantId ?? 'system',
        'scheduler.organization_id': bindings.organizationId ?? 'system',
        'scheduler.target_type': bindings.targetType,
        'scheduler.target_ref': bindings.targetRef ?? 'unknown',
        'scheduler.trigger_source': bindings.triggerSource,
      },
    },
    fn,
  )
}
