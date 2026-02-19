import { z } from 'zod'

export const dateRangeSchema = z.enum(['last7', 'last30', 'last90', 'thisMonth', 'thisQuarter'])
export type DateRangePreset = z.infer<typeof dateRangeSchema>

export type PipelineSettings = {
  dateRange: DateRangePreset
  showComparison: boolean
}

export const DEFAULT_SETTINGS: PipelineSettings = {
  dateRange: 'last30',
  showComparison: true,
}

export function hydratePipelineSettings(raw: unknown): PipelineSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_SETTINGS
  }
  const obj = raw as Record<string, unknown>
  
  const dateRangeResult = dateRangeSchema.safeParse(obj.dateRange)
  const dateRange = dateRangeResult.success ? dateRangeResult.data : DEFAULT_SETTINGS.dateRange
  
  const showComparison = typeof obj.showComparison === 'boolean' ? obj.showComparison : DEFAULT_SETTINGS.showComparison

  return { dateRange, showComparison }
}

export function dehydratePipelineSettings(settings: PipelineSettings): Record<string, unknown> {
  return {
    dateRange: settings.dateRange,
    showComparison: settings.showComparison,
  }
}
