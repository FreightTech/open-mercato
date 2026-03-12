export type TodaysTasksSettings = Record<string, never>

export const DEFAULT_SETTINGS: TodaysTasksSettings = {}

export function hydrateTodaysTasksSettings(_raw: unknown): TodaysTasksSettings {
  return {}
}
