export type UnsentOffersSettings = Record<string, never>

export const DEFAULT_SETTINGS: UnsentOffersSettings = {}

export function hydrateUnsentOffersSettings(_raw: unknown): UnsentOffersSettings {
  return {}
}
