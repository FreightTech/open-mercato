import type {
  SearchModuleConfig,
  SearchBuildContext,
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

function formatSubtitle(...parts: Array<unknown>): string | undefined {
  const text = parts
    .map((part) => (part === null || part === undefined ? '' : String(part)))
    .map((part) => part.trim())
    .filter(Boolean)
  if (text.length === 0) return undefined
  return text.join(' · ')
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'air_cargo:frc_air_cargo',
      enabled: true,
      priority: 7,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        if (record.name) lines.push(`Name: ${record.name}`)
        if (record.number_of_pieces) lines.push(`Pieces: ${record.number_of_pieces}`)
        if (record.stackable_type) lines.push(`Stackable: ${record.stackable_type}`)
        if (record.actual_weight_kg) lines.push(`Weight: ${record.actual_weight_kg} kg`)
        if (record.volume_m3) lines.push(`Volume: ${record.volume_m3} m³`)

        if (!lines.length) return null

        const pieces = record.number_of_pieces || 1
        const weight = record.actual_weight_kg || '0'
        const volume = record.volume_m3 || '0'

        return {
          text: lines,
          presenter: {
            title: pickString(record.name) ?? 'Air Cargo',
            subtitle: formatSubtitle(
              `${pieces} pcs`,
              `${weight} kg`,
              `${volume} m³`
            ),
            icon: 'package',
            badge: 'Air Cargo',
          },
        }
      },

      formatResult: async (ctx: SearchBuildContext) => {
        const record = ctx.record
        const pieces = record.number_of_pieces || 1
        const weight = record.actual_weight_kg || '0'

        return {
          title: pickString(record.name) ?? 'Air Cargo',
          subtitle: formatSubtitle(`${pieces} pcs`, `${weight} kg`),
          icon: 'package',
          badge: 'Air Cargo',
        }
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        if (!id) return null
        return `/backend/air-cargo?id=${encodeURIComponent(id)}`
      },

      fieldPolicy: {
        searchable: ['name'],
        hashOnly: [],
        excluded: ['deleted_at', 'rfq_id'],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
