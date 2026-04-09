import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import { AutomationDefinition, AutomationRun } from '../data/entities'
import { executeAutomation } from '../lib/execution-engine'

export const metadata = {
  queue: 'automation-runs',
  id: 'automations:run-executor',
  concurrency: 5,
}

interface AutomationRunJob {
  runId: string
  definitionId: string
  triggerData?: Record<string, unknown>
  tenantId: string
  organizationId: string
}

export default async function handler(
  payload: AutomationRunJob,
  ctx: { resolve: <T>(name: string) => T }
) {
  const em = ctx.resolve<EntityManager>('em').fork()
  const container = ctx.resolve<AwilixContainer>('container')

  const run = await em.findOne(AutomationRun, { id: payload.runId })
  if (!run) {
    console.error(`[automations:worker] Run not found: ${payload.runId}`)
    return
  }

  if (run.status !== 'RUNNING') {
    console.log(`[automations:worker] Run ${payload.runId} is ${run.status}, skipping`)
    return
  }

  const definition = await em.findOne(AutomationDefinition, { id: payload.definitionId })
  if (!definition) {
    run.status = 'FAILED'
    run.errorMessage = `Definition not found: ${payload.definitionId}`
    run.completedAt = new Date()
    await em.flush()
    return
  }

  try {
    await executeAutomation(
      em,
      container,
      run,
      definition.definition,
      payload.triggerData ?? {}
    )
  } catch (error) {
    run.status = 'FAILED'
    run.errorMessage = error instanceof Error ? error.message : String(error)
    run.completedAt = new Date()
    await em.flush()
  }
}
