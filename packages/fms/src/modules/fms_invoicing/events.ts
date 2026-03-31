import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // Invoice CRUD
  { id: 'fms_invoicing.invoice.created', label: 'Invoice Created', entity: 'fms_invoicing_invoice', category: 'crud' },
  { id: 'fms_invoicing.invoice.updated', label: 'Invoice Updated', entity: 'fms_invoicing_invoice', category: 'crud' },
  { id: 'fms_invoicing.invoice.deleted', label: 'Invoice Deleted', entity: 'fms_invoicing_invoice', category: 'crud' },

  // Business lifecycle
  { id: 'fms_invoicing.invoice.approved', label: 'Invoice Approved', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.invoice.rejected', label: 'Invoice Rejected', entity: 'fms_invoicing_invoice', category: 'lifecycle' },

  // Import lifecycle
  { id: 'fms_invoicing.import.completed', label: 'Invoice Import Completed', category: 'lifecycle' },
  { id: 'fms_invoicing.import.failed', label: 'Invoice Import Failed', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'fms_invoicing',
  events,
})

export const emitFmsInvoicingEvent = eventsConfig.emit

export type FmsInvoicingEventId = (typeof events)[number]['id']

export interface InvoiceEventPayload {
  id: string
  tenantId: string
  organizationId: string
  invoiceNumber: string
  direction?: string
  sourceType?: string
  [key: string]: unknown
}

export interface ImportEventPayload {
  tenantId: string
  organizationId: string
  count: number
  sourceType: string
  errorMessage?: string
  [key: string]: unknown
}

export default eventsConfig
