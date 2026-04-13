import './commands'

export const metadata = {
  name: 'documents',
  title: 'Documents',
  version: '0.1.0',
  description: 'Document management with AI-powered OCR extraction and processing',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['attachments'],
}

export { features } from './acl'
export type { Document, DocumentPage, DocumentCategory } from './data/entities'
export type {
  createDocumentSchema,
  updateDocumentSchema,
  uploadDocumentSchema,
  documentFilterSchema,
  documentListQuerySchema,
  documentCategorySchema,
} from './data/validators'
export type { DocumentsEventId, DocumentProcessedPayload, DocumentIdentifiersUpdatedPayload } from './events'
export { eventsConfig } from './events'
