import type {
  SearchModuleConfig,
  SearchBuildContext,
  SearchResultPresenter,
  SearchResultLink,
  SearchIndexSource,
} from '@open-mercato/shared/modules/search'

// =============================================================================
// Helper Functions
// =============================================================================

function pickString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length) {
      return candidate.trim()
    }
  }
  return null
}

// =============================================================================
// User Search Configuration
// =============================================================================

function resolveUserPresenter(record: Record<string, unknown>): SearchResultPresenter {
  const name = pickString(record.name, record.display_name, record.displayName)
  const email = pickString(record.email, record.primary_email, record.primaryEmail)

  // Use name as title, fall back to email if no name
  const title = name ?? email ?? 'User'

  // Only show email as subtitle if we have a name as title
  const subtitle = name && email ? email : undefined

  return {
    title,
    subtitle,
    icon: 'user',
    badge: 'User',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'auth:user',
      enabled: true,
      priority: 5,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        // Add searchable text
        const name = record.name ?? record.display_name ?? record.displayName
        const email = record.email ?? record.primary_email ?? record.primaryEmail

        if (name) lines.push(`Name: ${name}`)
        if (email) lines.push(`Email: ${email}`)

        if (!lines.length) return null

        return {
          text: lines,
          presenter: resolveUserPresenter(record),
          checksumSource: {
            name: record.name,
            email: record.email,
          },
        }
      },

      formatResult: async (ctx: SearchBuildContext): Promise<SearchResultPresenter | null> => {
        return resolveUserPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id
        if (!id) return null
        return `/backend/settings/users/${encodeURIComponent(String(id))}`
      },

      resolveLinks: async (ctx: SearchBuildContext): Promise<SearchResultLink[] | null> => {
        const id = ctx.record.id
        if (!id) return null
        return [
          {
            href: `/backend/settings/users/${encodeURIComponent(String(id))}/edit`,
            label: 'Edit',
            kind: 'secondary',
          },
        ]
      },

      fieldPolicy: {
        searchable: ['name', 'email'],
        hashOnly: ['email_hash', 'emailHash'],
        excluded: ['password_hash', 'passwordHash'],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
