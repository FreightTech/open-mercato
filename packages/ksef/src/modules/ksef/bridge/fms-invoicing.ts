/**
 * Bridge helper for optional fms_invoicing integration.
 *
 * When fms_invoicing is co-installed, bridge code can sync data between
 * the two modules. All bridge code guards with this check.
 */

let cachedResult: boolean | null = null

export function isFmsInvoicingAvailable(): boolean {
  if (cachedResult !== null) return cachedResult

  try {
    const { getModules } = require('@open-mercato/shared/lib/modules/registry')
    const modules = getModules()
    cachedResult = modules.some((m: { id: string }) => m.id === 'fms_invoicing')
  } catch {
    cachedResult = false
  }

  return cachedResult
}

export function resetFmsInvoicingCache(): void {
  cachedResult = null
}
