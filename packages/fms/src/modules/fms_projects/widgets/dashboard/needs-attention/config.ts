export type NeedsAttentionSettings = Record<string, never>

export const DEFAULT_SETTINGS: NeedsAttentionSettings = {}

export function hydrateNeedsAttentionSettings(_raw: unknown): NeedsAttentionSettings {
  return {}
}
