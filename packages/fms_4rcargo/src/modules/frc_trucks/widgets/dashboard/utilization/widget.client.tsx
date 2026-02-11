"use client"

import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydrateUtilizationSettings, type UtilizationSettings, type DateRangePreset } from './config'
import { Truck, TrendingUp, TrendingDown, Scale } from 'lucide-react'

type TruckData = {
  id: string
  name: string
  bookingCount: number
  profitLoss: number
  chargeableWeight: number
}

type UtilizationData = {
  trucks: TruckData[]
  totals: {
    bookings: number
    profitLoss: number
    chargeableWeight: number
  }
  currencyCode: string | null
}

async function loadUtilizationData(settings: UtilizationSettings): Promise<UtilizationData> {
  const params = new URLSearchParams({
    dateRange: settings.dateRange,
  })
  const call = await apiCall<UtilizationData>(`/api/frc_trucks/dashboard/widgets/utilization?${params}`)
  if (!call.ok) {
    const message =
      typeof (call.result as Record<string, unknown> | null)?.error === 'string'
        ? ((call.result as Record<string, unknown>).error as string)
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  return call.result ?? {
    trucks: [],
    totals: { bookings: 0, profitLoss: 0, chargeableWeight: 0 },
    currencyCode: null,
  }
}

function formatCurrency(value: number, currency: string): string {
  const prefix = value >= 0 ? '+' : ''
  return prefix + new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatWeight(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}t`
  }
  return `${Math.round(value)}kg`
}

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisQuarter', label: 'This quarter' },
]

const UtilizationWidget: React.FC<DashboardWidgetComponentProps<UtilizationSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  onSettingsChange,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydrateUtilizationSettings(settings), [settings])
  const [data, setData] = React.useState<UtilizationData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadUtilizationData(hydrated)
      setData(result)
    } catch (err) {
      console.error('Failed to load truck utilization widget data', err)
      setError(t('frc_trucks.widgets.utilization.error', 'Failed to load data'))
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
          <label className="text-sm font-medium">{t('frc_trucks.widgets.utilization.settings.dateRange', 'Date Range')}</label>
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

  const plColor = data?.totals.profitLoss && data.totals.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="space-y-4">
      {(loading || !data) ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-semibold">{data.totals.bookings}</div>
                <div className="text-xs text-muted-foreground">{t('frc_trucks.widgets.utilization.bookings', 'Bookings')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
              {data.totals.profitLoss >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <div>
                <div className={`font-semibold ${plColor}`}>
                  {data.currencyCode ? formatCurrency(data.totals.profitLoss, data.currencyCode) : '-'}
                </div>
                <div className="text-xs text-muted-foreground">{t('frc_trucks.widgets.utilization.profitLoss', 'P/L')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-semibold">{formatWeight(data.totals.chargeableWeight)}</div>
                <div className="text-xs text-muted-foreground">{t('frc_trucks.widgets.utilization.weight', 'CHW')}</div>
              </div>
            </div>
          </div>

          {/* Trucks list */}
          {data.trucks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Truck className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t('frc_trucks.widgets.utilization.noTrucks', 'No trucks found')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-auto">
              {data.trucks.slice(0, 5).map((truck) => {
                const truckPlColor = truck.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                return (
                  <Link
                    key={truck.id}
                    href={`/backend/frc-trucks?id=${truck.id}`}
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{truck.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">{truck.bookingCount} bookings</span>
                      {data.currencyCode && (
                        <span className={truckPlColor}>{formatCurrency(truck.profitLoss, data.currencyCode)}</span>
                      )}
                    </div>
                  </Link>
                )
              })}
              {data.trucks.length > 5 && (
                <div className="text-xs text-muted-foreground text-center pt-2">
                  +{data.trucks.length - 5} {t('frc_trucks.widgets.utilization.moreTrucks', 'more trucks')}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default UtilizationWidget
