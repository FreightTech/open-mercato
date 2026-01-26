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

function buildChargeCodeUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-products/charge-codes?id=${encodeURIComponent(id)}`
}

function buildCarrierUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-products/carriers?id=${encodeURIComponent(id)}`
}

function buildPriceTypeUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-products/price-types?id=${encodeURIComponent(id)}`
}

function formatCarrierType(type: unknown): string | null {
  const typeMap: Record<string, string> = {
    sea: 'Sea',
    air: 'Air',
    rail: 'Rail',
    road: 'Road',
  }
  if (typeof type === 'string' && type in typeMap) {
    return typeMap[type]
  }
  if (typeof type === 'string' && type.trim()) {
    return type.trim()
  }
  return null
}

function buildCarrierPresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>,
): SearchResultPresenter {
  const code = pickString(record.code, customFields.code)
  const name = pickString(record.name, customFields.name)
  const title = name ?? code ?? (record.id as string | undefined) ?? 'Carrier'

  const carrierType = formatCarrierType(record.carrier_type ?? record.carrierType)
  const isActive = record.is_active ?? record.isActive
  const status = typeof isActive === 'boolean'
    ? (isActive ? 'Active' : 'Inactive')
    : undefined

  return {
    title: String(title),
    subtitle: formatSubtitle(code !== title ? code : null, carrierType, status),
    icon: 'ship',
    badge: 'Carrier',
  }
}

function buildPriceTypePresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>,
): SearchResultPresenter {
  const code = pickString(record.code, customFields.code)
  const name = pickString(record.name, customFields.name)
  const description = pickString(record.description, customFields.description)
  const title = name ?? code ?? (record.id as string | undefined) ?? 'Price Type'

  const isActive = record.is_active ?? record.isActive
  const status = typeof isActive === 'boolean'
    ? (isActive ? 'Active' : 'Inactive')
    : undefined

  return {
    title: String(title),
    subtitle: formatSubtitle(code !== title ? code : null, description, status),
    icon: 'dollar-sign',
    badge: 'Price Type',
  }
}

function formatChargeUnit(unit: unknown): string | null {
  const unitMap: Record<string, string> = {
    container: 'Per Container',
    file: 'Per File',
    weight_measure: 'Weight/Measure',
    cargo_value_percent: '% of Value',
  }
  if (typeof unit === 'string' && unit in unitMap) {
    return unitMap[unit]
  }
  if (typeof unit === 'string' && unit.trim()) {
    return unit.trim()
  }
  return null
}

function formatUsage(usage: unknown): string | null {
  const usageMap: Record<string, string> = {
    most_common: 'Most Common',
    common: 'Common',
    rare: 'Rare',
  }
  if (typeof usage === 'string' && usage in usageMap) {
    return usageMap[usage]
  }
  return null
}

function buildChargeCodePresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>,
): SearchResultPresenter {
  const code = pickString(record.code, customFields.code)
  const name = pickString(record.name, customFields.name)
  const description = pickString(record.description, customFields.description)
  // Use name as title if available, otherwise code
  const title = name ?? code ?? (record.id as string | undefined) ?? 'Charge Code'

  const chargeUnit = formatChargeUnit(record.charge_unit ?? record.chargeUnit)
  const usage = formatUsage(record.usage)
  const isActive = record.is_active ?? record.isActive
  const status = typeof isActive === 'boolean'
    ? (isActive ? 'Active' : 'Inactive')
    : undefined

  return {
    title: String(title),
    subtitle: formatSubtitle(code !== title ? code : null, description, chargeUnit, usage, status),
    icon: 'tag',
    badge: 'Charge Code',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'fms_products:fms_charge_code',
      enabled: true,
      priority: 7,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Code', record.code)
        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Description', record.description)
        appendLine(lines, 'Charge Unit', formatChargeUnit(record.charge_unit ?? record.chargeUnit))
        appendLine(lines, 'Usage', formatUsage(record.usage))
        appendLine(lines, 'Status', (record.is_active ?? record.isActive) ? 'Active' : 'Inactive')

        // Add keywords for search
        const keywords = record.keywords as string[] | undefined
        if (Array.isArray(keywords) && keywords.length > 0) {
          appendLine(lines, 'Keywords', keywords.join(', '))
        }

        if (!lines.length) return null

        const presenter = buildChargeCodePresenter(record, ctx.customFields)

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
        return buildChargeCodePresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildChargeCodeUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['code', 'name', 'description', 'charge_unit', 'keywords', 'usage'],
        hashOnly: [],
        excluded: [],
      },
    },
    // FmsCarrier - Shipping lines and airlines
    {
      entityId: 'fms_products:fms_carrier',
      enabled: true,
      priority: 6,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Code', record.code)
        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Carrier Type', formatCarrierType(record.carrier_type ?? record.carrierType))
        appendLine(lines, 'Status', (record.is_active ?? record.isActive) ? 'Active' : 'Inactive')

        if (!lines.length) return null

        const presenter = buildCarrierPresenter(record, ctx.customFields)

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
        return buildCarrierPresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildCarrierUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['code', 'name', 'carrier_type'],
        hashOnly: [],
        excluded: [],
      },
    },
    // FmsPriceType - Bundle/pricing model types
    {
      entityId: 'fms_products:fms_price_type',
      enabled: true,
      priority: 5,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Code', record.code)
        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Description', record.description)
        appendLine(lines, 'Status', (record.is_active ?? record.isActive) ? 'Active' : 'Inactive')

        if (!lines.length) return null

        const presenter = buildPriceTypePresenter(record, ctx.customFields)

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
        return buildPriceTypePresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildPriceTypeUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['code', 'name', 'description'],
        hashOnly: [],
        excluded: [],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
