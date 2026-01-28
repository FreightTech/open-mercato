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
  const text =
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (!text.trim()) return
  lines.push(`${label}: ${text}`)
}

function buildTeamUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-teams?teamId=${encodeURIComponent(id)}`
}

function buildTeamPresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>
): SearchResultPresenter {
  const name = pickString(record.name, customFields.name)
  const title = name ?? (record.id as string | undefined) ?? 'Team'

  const isActive = record.is_active ?? record.isActive
  const status =
    typeof isActive === 'boolean' ? (isActive ? 'Active' : 'Inactive') : undefined

  return {
    title: String(title),
    subtitle: status,
    icon: 'users',
    badge: 'Team',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'fms_teams:team',
      enabled: true,
      priority: 8,

      buildSource: async (
        ctx: SearchBuildContext
      ): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Name', record.name ?? ctx.customFields.name)
        appendLine(
          lines,
          'Status',
          (record.is_active ?? record.isActive) ? 'Active' : 'Inactive'
        )

        if (!lines.length) return null

        const presenter = buildTeamPresenter(record, ctx.customFields)

        return {
          text: lines,
          presenter,
          checksumSource: {
            record: ctx.record,
            customFields: ctx.customFields,
          },
        }
      },

      formatResult: async (
        ctx: SearchBuildContext
      ): Promise<SearchResultPresenter | null> => {
        return buildTeamPresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildTeamUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['name'],
        hashOnly: [],
        excluded: ['organization_id', 'tenant_id'],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
