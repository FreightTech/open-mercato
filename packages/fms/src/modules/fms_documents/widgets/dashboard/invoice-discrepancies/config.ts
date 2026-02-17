export type InvoiceDiscrepanciesSettings = Record<string, never>

export const DEFAULT_SETTINGS: InvoiceDiscrepanciesSettings = {}

export function hydrateInvoiceDiscrepanciesSettings(_raw: unknown): InvoiceDiscrepanciesSettings {
  return {}
}
