"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydrateConversionRateSettings, type ConversionRateSettings, type DateRangePreset } from './config'
import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, Clock } from 'lucide-react'

type ConversionData = {
  booked: number
  rejected: number
  expired: number
  total: number
  rate: number
  comparison?: {
    previousRate: number
    change: number
    direction: 'up' | 'down' | 'stable'
  }
}

async function loadConversionData(settings: ConversionRateSettings): Promise<ConversionData> {
  const params = new URLSearchParams({
    dateRange: settings.dateRange,
    showComparison: String(settings.showComparison),
  })
  const call = await apiCall<ConversionData>(`/api/frc_offers/dashboard/widgets/conversion-rate?${params}`)
  if (!call.ok) {
    const message =
      typeof (call.result as Record<string, unknown> | null)?.error === 'string'
        ? ((call.result as Record<string, unknown>).error as string)
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  return call.result ?? {
    booked: 0,
    rejected: 0,
    expired: 0,
    total: 0,
    rate: 0,
  }
}

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisQuarter', label: 'This quarter' },
]

const ConversionRateWidget: React.FC<DashboardWidgetComponentProps<ConversionRateSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  onSettingsChange,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydrateConversionRateSettings(settings), [settings])
  const [data, setData] = React.useState<ConversionData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadConversionData(hydrated)
      setData(result)
    } catch (err) {
      console.error('Failed to load offer conversion rate widget data', err)
      setError(t('frc_offers.widgets.conversionRate.error', 'Failed to load data'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [hydrated, onRefreshStateChange, t])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  // Settings mode
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('frc_offers.widgets.conversionRate.settings.dateRange', 'Date Range')}</label>
          <select
            value={hydrated.dateRange}
            onChange={(e) => onSettingsChange({ ...hydrated, dateRange: e.target.value as DateRangePreset })}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hydrated.showComparison}
              onChange={(e) => onSettingsChange({ ...hydrated, showComparison: e.target.checked })}
              className="h-4 w-4 rounded border focus:ring-primary"
            />
            {t('frc_offers.widgets.conversionRate.settings.showComparison', 'Show comparison to previous period')}
          </label>
        </div>
      </div>
    )
  }

  // View mode
  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  const rateColor = data?.rate && data.rate >= 50 ? 'text-green-600' : data?.rate && data.rate >= 25 ? 'text-orange-600' : 'text-red-600'

  return (
    <div className="space-y-4">
      {(loading || !data) ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Main KPI */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold ${rateColor}`}>{data.rate}</span>
              <span className={`text-xl ${rateColor}`}>%</span>
            </div>
            {data.comparison && (
              <div className="flex items-center gap-1 text-sm">
                {data.comparison.direction === 'up' && (
                  <>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-green-600 font-medium">+{data.comparison.change}%</span>
                  </>
                )}
                {data.comparison.direction === 'down' && (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="text-red-600 font-medium">-{data.comparison.change}%</span>
                  </>
                )}
                {data.comparison.direction === 'stable' && (
                  <>
                    <Minus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">0%</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="flex items-center gap-2 rounded-md bg-green-100 dark:bg-green-950/40 p-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div>
                <div className="font-semibold text-green-600">{data.booked}</div>
                <div className="text-xs text-muted-foreground">{t('frc_offers.widgets.conversionRate.booked', 'Booked')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-red-100 dark:bg-red-950/40 p-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <div>
                <div className="font-semibold text-red-600">{data.rejected}</div>
                <div className="text-xs text-muted-foreground">{t('frc_offers.widgets.conversionRate.rejected', 'Rejected')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-gray-100 dark:bg-gray-800/40 p-2">
              <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <div>
                <div className="font-semibold text-gray-600 dark:text-gray-400">{data.expired}</div>
                <div className="text-xs text-muted-foreground">{t('frc_offers.widgets.conversionRate.expired', 'Expired')}</div>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="text-xs text-muted-foreground text-center">
            {t('frc_offers.widgets.conversionRate.totalOffers', 'Total completed offers')}: {data.total}
          </div>
        </>
      )}
    </div>
  )
}

export default ConversionRateWidget
