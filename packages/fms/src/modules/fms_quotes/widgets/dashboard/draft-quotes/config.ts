export type DraftQuotesSettings = Record<string, never>

export const DEFAULT_SETTINGS: DraftQuotesSettings = {}

export function hydrateDraftQuotesSettings(_raw: unknown): DraftQuotesSettings {
  return {}
}
