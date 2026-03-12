export type PendingResponseOffersSettings = Record<string, never>

export const DEFAULT_SETTINGS: PendingResponseOffersSettings = {}

export function hydratePendingResponseOffersSettings(_raw: unknown): PendingResponseOffersSettings {
  return {}
}
