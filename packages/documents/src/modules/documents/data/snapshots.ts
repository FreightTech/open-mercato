import type { DocumentCategory } from './entities'

/**
 * Snapshot of a Document for audit logging and undo operations
 */
export type DocumentSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  name: string
  category: DocumentCategory
  description: string | null
  attachmentId: string
  relatedEntityId: string | null
  relatedEntityType: string | null
  extractedData: Record<string, any> | null
  processedAt: Date | null
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Undo payload structure for document commands
 */
export type DocumentUndoPayload = {
  before?: DocumentSnapshot | null
  after?: DocumentSnapshot | null
}
