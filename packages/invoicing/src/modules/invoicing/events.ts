import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // Invoice CRUD
  { id: 'invoicing.invoice.created', label: 'Invoice Created', entity: 'invoicing_invoice', category: 'crud' },
  { id: 'invoicing.invoice.updated', label: 'Invoice Updated', entity: 'invoicing_invoice', category: 'crud' },
  { id: 'invoicing.invoice.deleted', label: 'Invoice Deleted', entity: 'invoicing_invoice', category: 'crud' },

  // Business lifecycle
  { id: 'invoicing.invoice.approved', label: 'Invoice Approved', entity: 'invoicing_invoice', category: 'lifecycle' },
  { id: 'invoicing.invoice.rejected', label: 'Invoice Rejected', entity: 'invoicing_invoice', category: 'lifecycle' },

  // KSeF lifecycle
  { id: 'invoicing.ksef.queued', label: 'KSeF Submission Queued', entity: 'invoicing_invoice', category: 'lifecycle' },
  { id: 'invoicing.ksef.submitted', label: 'KSeF Invoice Submitted', entity: 'invoicing_invoice', category: 'lifecycle' },
  { id: 'invoicing.ksef.accepted', label: 'KSeF Invoice Accepted', entity: 'invoicing_invoice', category: 'lifecycle' },
  { id: 'invoicing.ksef.rejected', label: 'KSeF Invoice Rejected', entity: 'invoicing_invoice', category: 'lifecycle' },
  { id: 'invoicing.ksef.error', label: 'KSeF Submission Error', entity: 'invoicing_invoice', category: 'lifecycle' },
  { id: 'invoicing.ksef.upo_downloaded', label: 'KSeF UPO Downloaded', entity: 'invoicing_invoice', category: 'lifecycle' },

  // Received invoices
  { id: 'invoicing.ksef.received', label: 'KSeF Invoice Received', entity: 'invoicing_invoice', category: 'lifecycle' },

  // Session lifecycle
  { id: 'invoicing.ksef.session_opened', label: 'KSeF Session Opened', entity: 'invoicing_ksef_session', category: 'lifecycle' },
  { id: 'invoicing.ksef.session_closed', label: 'KSeF Session Closed', entity: 'invoicing_ksef_session', category: 'lifecycle' },
  { id: 'invoicing.ksef.session_error', label: 'KSeF Session Error', entity: 'invoicing_ksef_session', category: 'lifecycle' },

  // Import lifecycle
  { id: 'invoicing.import.completed', label: 'Invoice Import Completed', category: 'lifecycle' },
  { id: 'invoicing.import.failed', label: 'Invoice Import Failed', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'invoicing',
  events,
})

export const emitInvoicingEvent = eventsConfig.emit

export type InvoicingEventId = (typeof events)[number]['id']

export interface InvoiceEventPayload {
  id: string
  tenantId: string
  organizationId: string
  invoiceNumber: string
  direction?: string
  sourceType?: string
  [key: string]: unknown
}

export interface KsefSessionEventPayload {
  id: string
  tenantId: string
  organizationId: string
  sessionType: string
  nip: string
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
