import type {
  SearchModuleConfig,
  SearchBuildContext,
  SearchResultPresenter,
  SearchIndexSource,
} from '@open-mercato/shared/modules/search'

function pickString(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function appendLine(lines: string[], label: string, value: unknown) {
  if (value === null || value === undefined) return
  const text = typeof value === 'object' && !Array.isArray(value)
    ? JSON.stringify(value)
    : String(value)
  if (!text.trim()) return
  lines.push(`${label}: ${text}`)
}

function buildTransportPresenter(
  record: Record<string, unknown>,
): SearchResultPresenter {
  const internalRef = pickString(record.internal_reference, record.internalReference)
  const bookingNumber = pickString(record.booking_number, record.bookingNumber)
  const title = internalRef ?? bookingNumber ?? (record.id as string | undefined) ?? 'Transport'

  const status = pickString(record.status)
  const destPort = pickString(record.destination_port, record.destinationPort)
  const subtitle = [status, destPort].filter(Boolean).join(' → ') || undefined

  return {
    title: String(title),
    subtitle,
    icon: 'package',
    badge: 'Transport',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'transports:transport',
      enabled: false, // Aggregate view — no backing ORM entity/table
      priority: 8,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Reference', record.internal_reference ?? record.internalReference)
        appendLine(lines, 'Client Ref', record.client_reference ?? record.clientReference)
        appendLine(lines, 'Booking', record.booking_number ?? record.bookingNumber)
        appendLine(lines, 'BOL', record.bol_number ?? record.bolNumber)
        appendLine(lines, 'Container', record.container_number ?? record.containerNumber)
        appendLine(lines, 'Carrier', record.carrier)
        appendLine(lines, 'Status', record.status)
        appendLine(lines, 'From', record.origin_port ?? record.originPort)
        appendLine(lines, 'To', record.destination_port ?? record.destinationPort)

        if (!lines.length) return null

        const presenter = buildTransportPresenter(record)

        return {
          text: lines,
          presenter,
          checksumSource: {
            record: ctx.record,
            customFields: ctx.customFields,
          },
        }
      },

      formatResult: async (ctx: SearchBuildContext): Promise<SearchResultPresenter | null> => {
        return buildTransportPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        if (!id) return null
        return `/backend/transports?id=${encodeURIComponent(id)}`
      },

      fieldPolicy: {
        searchable: ['internal_reference', 'client_reference', 'booking_number', 'container_number', 'bol_number'],
        hashOnly: [],
        excluded: ['tenant_id', 'organization_id', 'deleted_at'],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
