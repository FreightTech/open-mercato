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

function formatSalesStage(stage: unknown): string {
  if (typeof stage !== 'string') return ''
  const labels: Record<string, string> = {
    received: 'Received',
    offer_sent: 'Offer Sent',
    offer_accepted: 'Accepted',
    closed_lost: 'Lost',
  }
  return labels[stage] || stage
}

function buildRfqUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/frc-rfqs/${encodeURIComponent(id)}`
}

function buildRfqPresenter(
  record: Record<string, unknown>,
): SearchResultPresenter {
  const name = pickString(record.name)
  const title = name ?? (record.id as string | undefined) ?? 'Opportunity'

  const salesStage = formatSalesStage(record.sales_stage ?? record.salesStage)
  const commodity = pickString(record.commodity)
  const product = pickString(record.product)

  return {
    title: String(title),
    subtitle: formatSubtitle(salesStage, commodity, product),
    icon: 'file-text',
    badge: 'Opportunity',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'frc_rfqs:frc_rfq',
      enabled: true,
      priority: 8,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Commodity', record.commodity)
        appendLine(lines, 'Product', record.product)
        appendLine(lines, 'Description', record.description)
        appendLine(lines, 'Sales Stage', formatSalesStage(record.sales_stage ?? record.salesStage))

        if (!lines.length) return null

        const presenter = buildRfqPresenter(record)

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
        return buildRfqPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildRfqUrl(id ?? null)
      },

      fieldPolicy: {
        // Include fields needed for auto-population in offers (amount, shipment_ready_date, currency_code)
        searchable: ['name', 'commodity', 'product', 'description', 'amount', 'shipment_ready_date', 'currency_code'],
        hashOnly: [],
        excluded: ['assigned_to_id', 'account_id', 'contact_id', 'origin_airport_id', 'destination_airport_id'],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
