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
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
    on_hold: 'On Hold',
  }
  return labels[status] || status
}

function buildProjectUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/frc-projects/${encodeURIComponent(id)}`
}

function buildProjectPresenter(
  record: Record<string, unknown>,
): SearchResultPresenter {
  const projectNumber = pickString(record.project_number, record.projectNumber)
  const title = projectNumber ?? (record.id as string | undefined) ?? 'Project'

  const status = formatStatus(record.status)
  const currency = pickString(record.currency_code, record.currencyCode)

  return {
    title: String(title),
    subtitle: formatSubtitle(status, currency),
    icon: 'folder',
    badge: 'Project',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'frc_projects:frc_project',
      enabled: true,
      priority: 6,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Project Number', record.project_number ?? record.projectNumber)
        appendLine(lines, 'Status', formatStatus(record.status))
        appendLine(lines, 'Currency', record.currency_code ?? record.currencyCode)
        appendLine(lines, 'Notes', record.notes)

        // Include AWB numbers if present
        const awbNumbers = record.awb_numbers ?? record.awbNumbers
        if (Array.isArray(awbNumbers) && awbNumbers.length > 0) {
          appendLine(lines, 'AWB Numbers', awbNumbers.join(', '))
        }

        if (!lines.length) return null

        const presenter = buildProjectPresenter(record)

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
        return buildProjectPresenter(ctx.record)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildProjectUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['project_number', 'status', 'notes', 'awb_numbers'],
        hashOnly: [],
        excluded: [
          'total_value',
          'rfq_id',
          'offer_id',
          'account_id',
          'origin_airport_id',
          'destination_airport_id',
        ],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
