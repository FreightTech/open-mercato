export type DelayedShipmentsSettings = Record<string, never>

export const DEFAULT_SETTINGS: DelayedShipmentsSettings = {}

export function hydrateDelayedShipmentsSettings(_raw: unknown): DelayedShipmentsSettings {
  return {}
}
