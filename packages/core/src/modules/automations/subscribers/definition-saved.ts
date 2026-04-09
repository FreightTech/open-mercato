import { syncScheduleTriggers } from '../lib/schedule-sync'

export const metadata = {
  event: 'automations.definition.updated',
  persistent: true,
  id: 'automations:definition-saved-schedule-sync',
}

export default async function handler(
  payload: Record<string, unknown>,
  ctx: { resolve: <T>(name: string) => T }
) {
  const definitionId = payload.id as string
  if (!definitionId) return

  await syncScheduleTriggers(ctx, definitionId)
}
