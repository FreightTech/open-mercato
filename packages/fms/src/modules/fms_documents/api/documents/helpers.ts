import type { z } from 'zod'
import type { documentListQuerySchema } from '../../data/validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'

// Field mapping from frontend camelCase to database field names
export const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organizationId',
  tenantId: 'tenantId',
  name: 'name',
  category: 'category',
  description: 'description',
  attachmentId: 'attachmentId',
  relatedEntityId: 'relatedEntityId',
  relatedEntityType: 'relatedEntityType',
  documentType: 'documentType',
  documentNumber: 'documentNumber',
  blNumber: 'blNumber',
  mblNumber: 'mblNumber',
  bookingNumber: 'bookingNumber',
  vesselName: 'vesselName',
  voyageNumber: 'voyageNumber',
  portOfLoading: 'portOfLoading',
  portOfDischarge: 'portOfDischarge',
  sellerName: 'sellerName',
  buyerName: 'buyerName',
  totalGrossAmount: 'totalGrossAmount',
  currency: 'currency',
  processedAt: 'processedAt',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy',
  deletedAt: 'deletedAt',
}

/**
 * Build search filters from query parameters
 */
export function buildSearchFilters(query: z.infer<typeof documentListQuerySchema>): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (!query.includeDeleted) {
    filters.deletedAt = null
  }

  if (query.category) {
    filters.category = query.category
  }

  if (query.relatedEntityId) {
    filters.relatedEntityId = query.relatedEntityId
  }

  if (query.relatedEntityType) {
    filters.relatedEntityType = query.relatedEntityType
  }

  const searchTerm = query.search || query.q
  if (searchTerm && searchTerm.trim().length > 0) {
    const term = `%${escapeLikePattern(searchTerm.trim())}%`
    filters.$or = [
      { name: { $ilike: term } },
      { description: { $ilike: term } },
      { documentNumber: { $ilike: term } },
      { blNumber: { $ilike: term } },
      { bookingNumber: { $ilike: term } },
      { vesselName: { $ilike: term } },
      { sellerName: { $ilike: term } },
      { buyerName: { $ilike: term } },
    ]
  }

  return filters
}
