import type { SearchModuleConfig } from '@open-mercato/shared/modules/search'
import { createHash } from 'crypto'

function pickString(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function appendLine(lines: string[], prefix: string, value: unknown): void {
  if (value != null && String(value).trim().length > 0) {
    lines.push(`${prefix}: ${value}`)
  }
}

function appendArrayLine(lines: string[], prefix: string, value: unknown): void {
  if (Array.isArray(value) && value.length > 0) {
    lines.push(`${prefix}: ${value.join(', ')}`)
  }
}

function walkDocumentData(data: unknown, lines: string[], maxDepth = 3, depth = 0): void {
  if (depth >= maxDepth || data == null) return
  if (typeof data === 'string' && data.trim()) {
    lines.push(data.trim())
  } else if (typeof data === 'number') {
    lines.push(String(data))
  } else if (Array.isArray(data)) {
    for (const item of data) {
      walkDocumentData(item, lines, maxDepth, depth + 1)
    }
  } else if (typeof data === 'object') {
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (key.startsWith('_')) continue
      if (typeof val === 'string' && val.trim()) {
        lines.push(val.trim())
      } else if (typeof val === 'number') {
        lines.push(String(val))
      } else {
        walkDocumentData(val, lines, maxDepth, depth + 1)
      }
    }
  }
}

function hashJson(data: unknown): string {
  if (data == null) return ''
  return createHash('md5').update(JSON.stringify(data)).digest('hex')
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'documents:document',
      enabled: true,
      priority: 8,

      buildSource: async (ctx) => {
        const { record } = ctx
        const lines: string[] = []

        // Basic fields
        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Category', record.category)
        appendLine(lines, 'Description', record.description)
        appendLine(lines, 'Document Type', record.document_type)

        // Real columns — searchable identifiers
        appendLine(lines, 'Document Number', record.document_number)
        appendLine(lines, 'B/L Number', record.bl_number)
        appendLine(lines, 'Booking Number', record.booking_number)
        appendArrayLine(lines, 'Containers', record.container_numbers)
        appendLine(lines, 'Vessel', record.vessel_name)
        appendLine(lines, 'Voyage', record.voyage_number)
        appendLine(lines, 'Port of Loading', record.port_of_loading)
        appendLine(lines, 'Port of Discharge', record.port_of_discharge)
        appendLine(lines, 'Currency', record.currency)
        appendLine(lines, 'Seller', record.seller_name)
        appendLine(lines, 'Buyer', record.buyer_name)

        // Walk documentData for additional searchable values
        if (record.document_data && typeof record.document_data === 'object') {
          const dataLines: string[] = []
          walkDocumentData(record.document_data, dataLines)
          for (const line of dataLines) {
            if (!lines.includes(line)) lines.push(line)
          }
        }

        const title = pickString(record.name) ?? 'Untitled Document'
        const subtitle = pickString(record.document_type, record.category) ?? undefined

        const checksumSource = [
          record.name,
          record.category,
          record.description,
          record.document_number,
          record.bl_number,
          record.booking_number,
          record.vessel_name,
          record.seller_name,
          record.buyer_name,
          record.document_type,
          hashJson(record.document_data),
        ]
          .filter(Boolean)
          .join('|')

        return {
          text: lines,
          presenter: {
            title,
            subtitle,
            icon: 'file-text',
            badge: pickString(record.document_type, record.category) ?? undefined,
          },
          checksumSource,
        }
      },

      formatResult: async (ctx) => {
        const { record } = ctx

        return {
          title: pickString(record.name) ?? 'Untitled Document',
          subtitle: pickString(record.document_type, record.category) ?? undefined,
          icon: 'file-text',
          badge: pickString(record.document_type, record.category) ?? undefined,
        }
      },

      resolveUrl: async (ctx) => {
        return `/backend/documents?id=${ctx.record.id}`
      },

      fieldPolicy: {
        searchable: [
          'name',
          'category',
          'description',
          'document_type',
          'document_number',
          'bl_number',
          'booking_number',
          'vessel_name',
          'voyage_number',
          'port_of_loading',
          'port_of_discharge',
          'currency',
          'seller_name',
          'buyer_name',
        ],
        hashOnly: [],
        excluded: [
          'id',
          'organization_id',
          'tenant_id',
          'attachment_id',
          'related_entity_id',
          'related_entity_type',
          'extracted_data',
          'document_data',
          'raw_text',
          'processing_result',
          'processed_at',
          'created_by',
          'updated_by',
          'edited_by',
          'deleted_at',
          'parent_document_id',
        ],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
