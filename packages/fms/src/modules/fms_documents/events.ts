import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * FMS Documents Module Events
 *
 * Declares all events that can be emitted by the fms_documents module.
 */
const events = [
  // Document lifecycle
  {
    id: 'fms_documents.document.processed',
    label: 'Document Processed',
    description: 'Emitted when a document has been successfully processed with AI extraction',
    entity: 'fms_document',
    category: 'lifecycle',
  },

  // Document CRUD
  {
    id: 'fms_documents.document.created',
    label: 'Document Created',
    entity: 'fms_document',
    category: 'crud',
  },
  {
    id: 'fms_documents.document.updated',
    label: 'Document Updated',
    entity: 'fms_document',
    category: 'crud',
  },
  {
    id: 'fms_documents.document.deleted',
    label: 'Document Deleted',
    entity: 'fms_document',
    category: 'crud',
  },

  // Invoice CRUD
  {
    id: 'fms_documents.invoice.created',
    label: 'Invoice Created',
    entity: 'fms_invoice',
    category: 'crud',
  },
  {
    id: 'fms_documents.invoice.updated',
    label: 'Invoice Updated',
    entity: 'fms_invoice',
    category: 'crud',
  },
  {
    id: 'fms_documents.invoice.deleted',
    label: 'Invoice Deleted',
    entity: 'fms_invoice',
    category: 'crud',
  },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'fms_documents',
  events,
})

/** Type-safe event emitter for fms_documents module */
export const emitFmsDocumentsEvent = eventsConfig.emit

/** Event IDs that can be emitted by the fms_documents module */
export type FmsDocumentsEventId = (typeof events)[number]['id']

/** Payload for fms_documents.document.processed event */
export interface DocumentProcessedPayload {
  id: string
  tenantId: string
  organizationId: string
  category: string
  bookingNumber?: string
  blNumber?: string
  mblNumber?: string
  containerNumbers?: string[]
  createdBy?: string
}

export default eventsConfig
