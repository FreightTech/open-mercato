import type { DocumentCategory } from './entities'

/**
 * Snapshot of an FmsDocument for audit logging and undo operations
 */
export type FmsDocumentSnapshot = {
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
  before?: FmsDocumentSnapshot | null
  after?: FmsDocumentSnapshot | null
}
