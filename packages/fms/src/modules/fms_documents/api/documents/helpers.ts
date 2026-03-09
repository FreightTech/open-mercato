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

export interface FilterRow {
  field: string
  operator: string
  values: unknown[]
}

/**
 * Parse DynamicTable FilterRow into MikroORM filter format
 */
export function parseFilterRow(row: FilterRow): Record<string, unknown> | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      return { [field]: { $in: row.values } }
    case 'is_not_any_of':
      if (!hasValues) return null
      return { [field]: { $nin: row.values } }
    case 'contains':
      if (!hasValue) return null
      return { [field]: { $ilike: `%${val}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
      if (!hasValue) return null
      return { [field]: { $eq: val } }
    case 'not_equals':
      if (!hasValue) return null
      return { [field]: { $ne: val } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    case 'greater_than':
      if (!hasValue) return null
      return { [field]: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { [field]: { $lt: val } }
    default:
      return null
  }
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

  if (query.search && query.search.trim().length > 0) {
    const term = `%${escapeLikePattern(query.search.trim())}%`
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
