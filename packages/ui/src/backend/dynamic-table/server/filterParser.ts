import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'

export interface DynamicTableFilterRow {
  field: string
  operator: string
  values: unknown[]
}

/**
 * Parse a single DynamicTable FilterRow into a MikroORM Where clause.
 * Returns null if the row cannot be parsed (unknown field, missing value, etc.)
 *
 * Supports 12 operators: is_any_of, is_not_any_of, contains, is_empty,
 * is_not_empty, equals, not_equals, is_true, is_false, greater_than, less_than
 */
export function parseFilterRow(
  row: DynamicTableFilterRow,
  fieldMap: Record<string, string>
): Record<string, unknown> | null {
  const field = fieldMap[row.field]
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
      return { [field]: { $ilike: `%${escapeLikePattern(String(val))}%` } }
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
 * Convert an array of DynamicTable FilterRows into MikroORM Where clauses.
 * Filters out rows that cannot be parsed (unknown field, missing value, etc.)
 */
export function parseDynamicTableFilters(
  filterRows: DynamicTableFilterRow[],
  fieldMap: Record<string, string>
): Record<string, unknown>[] {
  return filterRows
    .map((row) => parseFilterRow(row, fieldMap))
    .filter((f): f is Record<string, unknown> => f !== null)
}
