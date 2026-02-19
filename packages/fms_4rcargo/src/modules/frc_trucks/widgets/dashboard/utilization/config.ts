import { z } from 'zod'

export const dateRangeSchema = z.enum(['last7', 'last30', 'last90', 'thisMonth', 'thisQuarter'])
export type DateRangePreset = z.infer<typeof dateRangeSchema>

export type UtilizationSettings = {
  dateRange: DateRangePreset
}

export const DEFAULT_SETTINGS: UtilizationSettings = {
  dateRange: 'last30',
}

export function hydrateUtilizationSettings(raw: unknown): UtilizationSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_SETTINGS
  }
  const obj = raw as Record<string, unknown>
  
  const dateRangeResult = dateRangeSchema.safeParse(obj.dateRange)
  const dateRange = dateRangeResult.success ? dateRangeResult.data : DEFAULT_SETTINGS.dateRange

  return { dateRange }
}

export function dehydrateUtilizationSettings(settings: UtilizationSettings): Record<string, unknown> {
  return {
    dateRange: settings.dateRange,
  }
}
