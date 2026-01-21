import type { SearchResultPresenter } from '@open-mercato/shared/modules/search'

// UUID pattern to detect and filter out UUID-like values from display
// Matches: full UUIDs with dashes, UUIDs without dashes, and hex-only ID strings (8+ chars)
const UUID_WITH_DASHES = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_WITHOUT_DASHES = /^[0-9a-f]{32}$/i
const HEX_ID_PATTERN = /^[0-9a-f]{8,}$/i

function looksLikeIdOrUuid(value: string): boolean {
  // Skip if it contains any non-hex characters (allowing dashes for UUIDs)
  // This catches actual UUIDs, UUIDs without dashes, and pure hex IDs
  return UUID_WITH_DASHES.test(value) || UUID_WITHOUT_DASHES.test(value) || HEX_ID_PATTERN.test(value)
}

// Fields to check for title, in priority order
const TITLE_FIELDS = [
  'display_name', 'displayName',
  'name', 'title', 'label',
  'full_name', 'fullName',
  'brand_name', 'brandName',
  'legal_name', 'legalName',
  'first_name', 'firstName',
  'last_name', 'lastName',
  'preferred_name', 'preferredName',
  'email', 'primary_email', 'primaryEmail',
  'code', 'sku', 'reference',
  'identifier', 'slug',
]

// Fields to check for subtitle
const SUBTITLE_FIELDS = [
  'description', 'summary', 'notes',
  'email', 'primary_email', 'primaryEmail',
  'phone', 'primary_phone', 'primaryPhone',
  'status', 'type', 'kind', 'category',
]

function findFirstValue(doc: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = doc[field]
    if (value != null && String(value).trim().length > 0) {
      return String(value).trim()
    }
  }
  return null
}

function findAnyStringValue(doc: Record<string, unknown>, excludeFields: Set<string>): string | null {
  // Skip these fields as they're not meaningful for display
  const skipFields = new Set([
    'id', 'tenant_id', 'tenantId', 'organization_id', 'organizationId',
    'created_at', 'createdAt', 'updated_at', 'updatedAt', 'deleted_at', 'deletedAt',
    ...excludeFields,
  ])

  for (const [key, value] of Object.entries(doc)) {
    if (skipFields.has(key)) continue
    if (key.startsWith('cf:') || key.startsWith('cf_')) continue
    if (typeof value === 'string' && value.trim().length > 0 && value.length < 200) {
      return value.trim()
    }
  }
  return null
}

function formatEntityLabel(entityId: string): string {
  const entityName = entityId.split(':')[1] ?? entityId
  return entityName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Extract a presenter from doc fields when no search.ts config exists.
 *
 * TODO: This is a basic implementation. Future improvements could include:
 * - Entity-type specific field mappings
 * - Smarter field combination (e.g., first_name + last_name)
 * - Custom field (cf:*) inspection for user-defined display fields
 * - Configuration for default presenter fields per entity type
 */
export function extractFallbackPresenter(
  doc: Record<string, unknown>,
  entityId: string,
  recordId: string,
): SearchResultPresenter {
  const entityLabel = formatEntityLabel(entityId)

  // 1. Try common title fields
  let title = findFirstValue(doc, TITLE_FIELDS)

  // 2. If no title found, try any string field
  if (!title) {
    title = findAnyStringValue(doc, new Set(SUBTITLE_FIELDS))
  }

  // 3. Last resort: use entity label + truncated record ID
  if (!title) {
    const shortId = recordId.length > 8 ? recordId.slice(0, 8) + '...' : recordId
    title = `${entityLabel} ${shortId}`
  }

  // Build subtitle from multiple relevant fields to show more context
  const subtitleParts: string[] = []
  for (const field of SUBTITLE_FIELDS) {
    const value = doc[field]
    if (value != null && String(value).trim().length > 0 && String(value) !== title) {
      const strValue = String(value).trim()
      // Skip UUID-like values and hex IDs - they're not meaningful for display
      if (looksLikeIdOrUuid(strValue)) continue
      subtitleParts.push(strValue)
      if (subtitleParts.length >= 3) break // Limit to 3 parts
    }
  }

  return {
    title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ').slice(0, 120) : undefined,
    badge: entityLabel,
  }
}
