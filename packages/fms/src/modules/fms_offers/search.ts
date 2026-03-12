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

function snippet(value: unknown, max = 140): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed.length) return undefined
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 3)}...`
}

function appendLine(lines: string[], label: string, value: unknown) {
  if (value === null || value === undefined) return
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (!text.trim()) return
  lines.push(`${label}: ${text}`)
}

function formatSubtitle(...parts: Array<unknown>): string | undefined {
  const text = parts
    .map((part) => (part === null || part === undefined ? '' : String(part)))
    .map((part) => part.trim())
    .filter(Boolean)
  if (text.length === 0) return undefined
  return text.join(' · ')
}

function buildRfqUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-rfq?id=${encodeURIComponent(id)}`
}

function buildOfferUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-offers?id=${encodeURIComponent(id)}`
}

function formatStatus(status: unknown): string {
  if (typeof status !== 'string') return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function buildRfqPresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>,
): SearchResultPresenter {
  const title = pickString(
    record.title,
    record.company_name,
    record.companyName,
  ) ?? (record.id as string | undefined) ?? 'RFQ'

  const origin = pickString(record.origin)
  const destination = pickString(record.destination)
  const route = origin && destination ? `${origin} → ${destination}` : origin ?? destination ?? null
  const direction = pickString(record.direction)

  return {
    title: String(title),
    subtitle: formatSubtitle(
      record.company_name ?? record.companyName,
      route,
      direction?.toUpperCase(),
    ),
    icon: 'file-text',
    badge: 'RFQ',
  }
}

function buildOfferPresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>,
): SearchResultPresenter {
  const offerNumber = pickString(
    record.offer_number,
    record.offerNumber,
    customFields.offer_number,
  )
  const title = offerNumber ?? (record.id as string | undefined) ?? 'Offer'

  const status = formatStatus(record.status)
  const version = record.version
  const versionLabel = typeof version === 'number' && version > 1 ? `v${version}` : null
  const direction = pickString(record.direction)
  const transportMode = pickString(record.transport_mode, record.transportMode)

  return {
    title: String(title),
    subtitle: formatSubtitle(direction?.toUpperCase(), transportMode?.toUpperCase(), versionLabel, status),
    icon: 'send',
    badge: 'Offer',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    // FMS RFQ
    {
      entityId: 'fms_offers:fms_rfq',
      enabled: true,
      priority: 10,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Title', record.title)
        appendLine(lines, 'Company', record.company_name ?? record.companyName)
        appendLine(lines, 'Contact', record.contact_person ?? record.contactPerson)
        appendLine(lines, 'Origin', record.origin)
        appendLine(lines, 'Destination', record.destination)
        appendLine(lines, 'Direction', record.direction)
        appendLine(lines, 'Transport Mode', record.transport_mode ?? record.transportMode)
        appendLine(lines, 'Cargo Type', record.cargo_type ?? record.cargoType)
        appendLine(lines, 'Description', snippet(record.description))
        appendLine(lines, 'Context', snippet(record.context))

        if (!lines.length) return null

        const presenter = buildRfqPresenter(record, ctx.customFields)

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
        return buildRfqPresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildRfqUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: [
          'title',
          'company_name',
          'contact_person',
          'origin',
          'destination',
          'direction',
          'transport_mode',
          'cargo_type',
          'description',
          'context',
        ],
        hashOnly: [],
        excluded: ['container_count'],
      },
    },

    // FMS Offer
    {
      entityId: 'fms_offers:fms_offer',
      enabled: true,
      priority: 9,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Offer Number', record.offer_number ?? record.offerNumber)
        appendLine(lines, 'Status', formatStatus(record.status))
        appendLine(lines, 'Direction', record.direction)
        appendLine(lines, 'Transport Mode', record.transport_mode ?? record.transportMode)
        appendLine(lines, 'Version', record.version)
        appendLine(lines, 'Notes', snippet(record.notes))
        appendLine(lines, 'Customer Notes', snippet(record.customer_notes ?? record.customerNotes))

        if (!lines.length) return null

        const presenter = buildOfferPresenter(record, ctx.customFields)

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
        return buildOfferPresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildOfferUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: [
          'offer_number',
          'status',
          'direction',
          'transport_mode',
          'notes',
          'customer_notes',
          'payment_terms',
          'special_terms',
        ],
        hashOnly: [],
        excluded: ['valid_until', 'superseded_by_id'],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
