import { z } from 'zod'

export const daysAheadSchema = z.union([z.literal(3), z.literal(7), z.literal(14)])
export type DaysAhead = z.infer<typeof daysAheadSchema>

export type UpcomingDeparturesSettings = {
  daysAhead: DaysAhead
  maxItems: number
}

export const DEFAULT_SETTINGS: UpcomingDeparturesSettings = {
  daysAhead: 7,
  maxItems: 5,
}

export function hydrateUpcomingDeparturesSettings(raw: unknown): UpcomingDeparturesSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_SETTINGS
  }
  const obj = raw as Record<string, unknown>
  
  const daysAheadResult = daysAheadSchema.safeParse(obj.daysAhead)
  const daysAhead = daysAheadResult.success ? daysAheadResult.data : DEFAULT_SETTINGS.daysAhead
  
  const maxItems = typeof obj.maxItems === 'number' && obj.maxItems >= 1 && obj.maxItems <= 10 
    ? obj.maxItems 
    : DEFAULT_SETTINGS.maxItems

  return { daysAhead, maxItems }
}

export function dehydrateUpcomingDeparturesSettings(settings: UpcomingDeparturesSettings): Record<string, unknown> {
  return {
    daysAhead: settings.daysAhead,
    maxItems: settings.maxItems,
  }
}
