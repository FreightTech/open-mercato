/**
 * Formats a date value for API submission.
 * Handles both Date objects and string values, returning ISO date string (YYYY-MM-DD).
 *
 * This is needed because DynamicTable's parseValueByType converts date strings
 * to Date objects, and using String(dateObj) produces invalid formats like
 * "Wed Feb 25 2026 01:00:00 GMT+0100..." instead of "2026-02-25".
 */
export function formatDateForApi(value: unknown): string | null {
  if (!value) return null

  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  const str = String(value)

  // If it looks like an ISO date string (YYYY-MM-DD...), extract just the date part
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.split('T')[0]
  }

  // Try to parse other date formats and reformat
  const parsed = new Date(str)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0]
}
