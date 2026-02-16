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

function buildAirportPresenter(record: Record<string, unknown>): SearchResultPresenter {
  const code = pickString(record.code)
  const name = pickString(record.name)
  const city = pickString(record.city)
  const country = pickString(record.country)

  // Title: "CODE - Name" or just "CODE"
  const title = code && name ? `${code} - ${name}` : code ?? name ?? 'Airport'

  // Subtitle: "City, Country"
  const subtitle = [city, country].filter(Boolean).join(', ') || undefined

  return {
    title,
    subtitle,
    icon: 'plane',
    badge: 'Airport',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'frc_airports:frc_airport',
      enabled: true,
      priority: 7,
      strategies: ['fulltext', 'tokens'],

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        if (record.code) lines.push(`Code: ${record.code}`)
        if (record.name) lines.push(`Name: ${record.name}`)
        if (record.city) lines.push(`City: ${record.city}`)
        if (record.country) lines.push(`Country: ${record.country}`)

        if (!lines.length) return null

        const presenter = buildAirportPresenter(record)

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
        return buildAirportPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        if (!id) return null
        return `/backend/frc-airports?id=${encodeURIComponent(id)}`
      },

      fieldPolicy: {
        searchable: ['code', 'name', 'city', 'country'],
        hashOnly: [],
        excluded: [],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
