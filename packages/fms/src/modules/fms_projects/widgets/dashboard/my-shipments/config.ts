export type MyShipmentsSettings = Record<string, never>

export const DEFAULT_SETTINGS: MyShipmentsSettings = {}

export function hydrateMyShipmentsSettings(_raw: unknown): MyShipmentsSettings {
  return {}
}
