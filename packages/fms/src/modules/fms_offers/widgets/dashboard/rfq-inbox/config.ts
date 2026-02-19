export type RfqInboxSettings = Record<string, never>

export const DEFAULT_SETTINGS: RfqInboxSettings = {}

export function hydrateRfqInboxSettings(_raw: unknown): RfqInboxSettings {
  return {}
}
