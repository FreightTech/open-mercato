/**
 * Generic bridge helper for any invoicing module integration.
 *
 * When a source invoicing module is co-installed, bridge code can sync
 * invoices to KSeF for submission. All bridge code guards with this check.
 */

const moduleCache = new Map<string, boolean>()

export function isSourceModuleAvailable(moduleId: string): boolean {
  const cached = moduleCache.get(moduleId)
  if (cached !== undefined) return cached

  try {
    const { getModules } = require('@open-mercato/shared/lib/modules/registry')
    const modules = getModules()
    const available = modules.some((m: { id: string }) => m.id === moduleId)
    moduleCache.set(moduleId, available)
    return available
  } catch {
    moduleCache.set(moduleId, false)
    return false
  }
}

export function resetModuleCache(moduleId?: string): void {
  if (moduleId) {
    moduleCache.delete(moduleId)
  } else {
    moduleCache.clear()
  }
}
