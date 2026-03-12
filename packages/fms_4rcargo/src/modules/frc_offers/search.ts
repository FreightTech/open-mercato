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

function formatStatus(status: unknown): string {
  if (typeof status !== 'string') return ''
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    booked: 'Booked',
    rejected: 'Rejected',
    expired: 'Expired',
  }
  return labels[status] || status
}

function buildOfferUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/frc-offers/${encodeURIComponent(id)}`
}

function buildOfferPresenter(
  record: Record<string, unknown>,
): SearchResultPresenter {
  const name = pickString(record.name)
  const title = name ?? (record.id as string | undefined) ?? 'Offer'

  const status = formatStatus(record.status)
  const currency = pickString(record.currency_code, record.currencyCode)
  const awb = pickString(record.awb_number, record.awbNumber)

  return {
    title: String(title),
    subtitle: formatSubtitle(status, currency, awb),
    icon: 'send',
    badge: 'Offer',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'frc_offers:frc_offer',
      enabled: true,
      priority: 7,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Status', formatStatus(record.status))
        appendLine(lines, 'AWB Number', record.awb_number ?? record.awbNumber)
        appendLine(lines, 'Currency', record.currency_code ?? record.currencyCode)

        if (!lines.length) return null

        const presenter = buildOfferPresenter(record)

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
        return buildOfferPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildOfferUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['name', 'awb_number', 'status'],
        hashOnly: [],
        excluded: [
          'total_rate',
          'total_rate_per_kg',
          'connection_rate_per_kg',
          'connection_rate_total',
          'airfreight_rate_per_kg',
          'airfreight_rate_total',
          'rfq_id',
          'carrier_id',
          'assigned_to_id',
          'project_id',
        ],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
