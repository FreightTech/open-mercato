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

function buildPresetPresenter(record: Record<string, unknown>): SearchResultPresenter {
  const name = pickString(record.name)
  const width = record.width as number | undefined
  const length = record.length as number | undefined
  const height = record.height as number | undefined
  const volume = record.volume as number | undefined

  const title = name ?? 'Truck Preset'
  const subtitle =
    width && length && height
      ? `${width}x${length}x${height}cm, ${volume ?? '?'}m³`
      : undefined

  return {
    title,
    subtitle,
    icon: 'truck',
    badge: 'Preset',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'frc_trucks:frc_truck_preset',
      enabled: true,
      priority: 6,
      strategies: ['fulltext', 'tokens'],

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        if (record.name) lines.push(`Name: ${record.name}`)
        if (record.width && record.length && record.height) {
          lines.push(`Dimensions: ${record.width}x${record.length}x${record.height}cm`)
        }
        if (record.volume) lines.push(`Volume: ${record.volume}m³`)
        if (record.maxWeight) lines.push(`Max Weight: ${record.maxWeight}kg`)

        if (!lines.length) return null

        const presenter = buildPresetPresenter(record)

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
        return buildPresetPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        if (!id) return null
        return `/backend/frc-trucks?presetId=${encodeURIComponent(id)}`
      },

      fieldPolicy: {
        searchable: ['name'],
        hashOnly: [],
        excluded: [],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
