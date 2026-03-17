import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // Invoice CRUD
  { id: 'fms_invoicing.invoice.created', label: 'Invoice Created', entity: 'fms_invoicing_invoice', category: 'crud' },
  { id: 'fms_invoicing.invoice.updated', label: 'Invoice Updated', entity: 'fms_invoicing_invoice', category: 'crud' },
  { id: 'fms_invoicing.invoice.deleted', label: 'Invoice Deleted', entity: 'fms_invoicing_invoice', category: 'crud' },

  // Business lifecycle
  { id: 'fms_invoicing.invoice.approved', label: 'Invoice Approved', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.invoice.rejected', label: 'Invoice Rejected', entity: 'fms_invoicing_invoice', category: 'lifecycle' },

  // KSeF lifecycle
  { id: 'fms_invoicing.ksef.queued', label: 'KSeF Submission Queued', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.submitted', label: 'KSeF Invoice Submitted', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.accepted', label: 'KSeF Invoice Accepted', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.rejected', label: 'KSeF Invoice Rejected', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.error', label: 'KSeF Submission Error', entity: 'fms_invoicing_invoice', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.upo_downloaded', label: 'KSeF UPO Downloaded', entity: 'fms_invoicing_invoice', category: 'lifecycle' },

  // Received invoices
  { id: 'fms_invoicing.ksef.received', label: 'KSeF Invoice Received', entity: 'fms_invoicing_invoice', category: 'lifecycle' },

  // Session lifecycle
  { id: 'fms_invoicing.ksef.session_opened', label: 'KSeF Session Opened', entity: 'fms_invoicing_ksef_session', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.session_closed', label: 'KSeF Session Closed', entity: 'fms_invoicing_ksef_session', category: 'lifecycle' },
  { id: 'fms_invoicing.ksef.session_error', label: 'KSeF Session Error', entity: 'fms_invoicing_ksef_session', category: 'lifecycle' },

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
