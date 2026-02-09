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

function buildProductUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-products?id=${encodeURIComponent(id)}`
}

function buildCarrierUrl(id: string | null): string | null {
  if (!id) return null
  return `/backend/fms-products/carriers?id=${encodeURIComponent(id)}`
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

function formatTransportMode(mode: unknown): string | null {
  const modeMap: Record<string, string> = {
    sea: 'Sea',
    air: 'Air',
    rail: 'Rail',
  }
  if (typeof mode === 'string' && mode in modeMap) {
    return modeMap[mode]
  }
  if (typeof mode === 'string' && mode.trim()) {
    return mode.trim()
  }
  return null
}

function buildProductPresenter(
  record: Record<string, unknown>,
  customFields: Record<string, unknown>,
): SearchResultPresenter {
  const name = pickString(record.name, customFields.name)
  const chargeCode = pickString(record.charge_code, record.chargeCode, customFields.chargeCode)
  const title = name ?? chargeCode ?? (record.id as string | undefined) ?? 'Product'

  const chargeUnit = formatChargeUnit(record.charge_unit ?? record.chargeUnit)
  const transportMode = formatTransportMode(record.transport_mode ?? record.transportMode)
  const isActive = record.is_active ?? record.isActive
  const status = typeof isActive === 'boolean'
    ? (isActive ? 'Active' : 'Inactive')
    : undefined

  return {
    title: String(title),
    subtitle: formatSubtitle(chargeCode, chargeUnit, transportMode, status),
    icon: 'package',
    badge: 'Product',
  }
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'fms_products:fms_product',
      enabled: true,
      priority: 7,

      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        appendLine(lines, 'Name', record.name)
        appendLine(lines, 'Charge Code', record.charge_code ?? record.chargeCode)
        appendLine(lines, 'Charge Unit', formatChargeUnit(record.charge_unit ?? record.chargeUnit))
        appendLine(lines, 'Transport Mode', formatTransportMode(record.transport_mode ?? record.transportMode))
        appendLine(lines, 'Status', (record.is_active ?? record.isActive) ? 'Active' : 'Inactive')

        if (!lines.length) return null

        const presenter = buildProductPresenter(record, ctx.customFields)

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
        return buildProductPresenter(ctx.record, ctx.customFields)
      },

      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        return buildProductUrl(id ?? null)
      },

      fieldPolicy: {
        searchable: ['name', 'charge_code', 'charge_unit', 'transport_mode'],
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
  ],
}

export default searchConfig
export const config = searchConfig
