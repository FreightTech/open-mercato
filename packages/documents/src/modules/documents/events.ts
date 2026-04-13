import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Documents Module Events
 *
 * Declares all events that can be emitted by the documents module.
 */
const events = [
  // Document lifecycle
  {
    id: 'documents.document.processed',
    label: 'Document Processed',
    description: 'Emitted when a document has been successfully processed with AI extraction',
    entity: 'document',
    category: 'lifecycle',
  },
  {
    id: 'documents.document.identifiers_updated',
    label: 'Document Identifiers Updated',
    description: 'Emitted when document shipping identifiers (bookingNumber, blNumber, mblNumber) are manually updated via API',
    entity: 'document',
    category: 'lifecycle',
  },

  // Document CRUD
  {
    id: 'documents.document.created',
    label: 'Document Created',
    entity: 'document',
    category: 'crud',
  },
  {
    id: 'documents.document.updated',
    label: 'Document Updated',
    entity: 'document',
    category: 'crud',
  },
  {
    id: 'documents.document.deleted',
    label: 'Document Deleted',
    entity: 'document',
    category: 'crud',
  },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'documents',
  events,
})

/** Type-safe event emitter for documents module */
export const emitDocumentsEvent = eventsConfig.emit

/** Event IDs that can be emitted by the documents module */
export type DocumentsEventId = (typeof events)[number]['id']

/** Payload for documents.document.processed event */
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

/**
 * Payload for documents.document.identifiers_updated event
 * Emitted when shipping identifiers are manually updated via PATCH API.
 * Note: containerNumbers is excluded as it can be reused across shipments.
 */
export interface DocumentIdentifiersUpdatedPayload {
  id: string
  tenantId: string
  organizationId: string
  category: string
  bookingNumber?: string
  blNumber?: string
  mblNumber?: string
}

export default eventsConfig
