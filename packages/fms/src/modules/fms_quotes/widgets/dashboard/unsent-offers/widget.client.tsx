"use client"

import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydrateUnsentOffersSettings, type UnsentOffersSettings } from './config'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'

type UnsentOffersData = {
  count: number
  maxLagMs: number | null
  maxLagOfferId: string | null
  totalValue: number | null
  currencyCode: string | null
  previousCount: number
  trend: 'up' | 'down' | 'stable'
}

async function loadUnsentOffers(): Promise<UnsentOffersData> {
  const call = await apiCall<UnsentOffersData>('/api/fms_quotes/dashboard/widgets/unsent-offers')
  if (!call.ok) {
    const message =
      typeof (call.result as Record<string, unknown> | null)?.error === 'string'
        ? ((call.result as Record<string, unknown>).error as string)
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  return call.result ?? {
    count: 0,
    maxLagMs: null,
    maxLagOfferId: null,
    totalValue: null,
    currencyCode: null,
    previousCount: 0,
    trend: 'stable' as const,
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (weeks > 0) {
    const remainingDays = days % 7
    return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`
  }
  if (days > 0) {
    const remainingHours = hours % 24
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const LAG_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours
const LAG_WARNING_MS = 12 * 60 * 60 * 1000 // 12 hours

const UnsentOffersWidget: React.FC<DashboardWidgetComponentProps<UnsentOffersSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydrateUnsentOffersSettings(settings), [settings])
  const [data, setData] = React.useState<UnsentOffersData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadUnsentOffers()
      setData(result)
    } catch (err) {
      console.error('Failed to load unsent offers widget data', err)
      setError(t('fms_quotes.widgets.unsentOffers.error'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [onRefreshStateChange, t])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  // Settings mode (no settings for this widget)
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">No configuration options for this widget.</p>
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

  if (loading || !data) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    )
  }

  const lagLevel =
    data.maxLagMs && data.maxLagMs >= LAG_THRESHOLD_MS
      ? 'critical'
      : data.maxLagMs && data.maxLagMs >= LAG_WARNING_MS
        ? 'warning'
        : 'normal'

  const countColor =
    lagLevel === 'critical' ? 'text-red-600' : lagLevel === 'warning' ? 'text-orange-600' : 'text-foreground'

  const trendChange = Math.abs(data.count - data.previousCount)

  return (
    <Link href="/backend/fms-offers?sent=false" className="block hover:opacity-80 transition-opacity">
      <div className="grid grid-cols-2 gap-3">
        {/* Column 1: Count */}
        <div className="flex items-center gap-2 border-r pr-3">
          <div className={`text-5xl font-bold leading-none ${countColor}`}>{data.count}</div>
          <div className="flex flex-col gap-0.5 text-xs">
            <div className="text-muted-foreground leading-tight">
              {data.count === 1 ? 'unsent' : 'unsent'}
              <br />
              {data.count === 1 ? 'offer' : 'offers'}
            </div>
            {/* Trend */}
            <div className="flex items-center gap-0.5">
              {data.trend === 'up' && (
                <>
                  <TrendingUp className="h-3 w-3 text-orange-600" />
                  <span className="text-orange-600 font-medium">+{trendChange}</span>
                </>
              )}
              {data.trend === 'down' && (
                <>
                  <TrendingDown className="h-3 w-3 text-green-600" />
                  <span className="text-green-600 font-medium">-{trendChange}</span>
                </>
              )}
              {data.trend === 'stable' && (
                <>
                  <Minus className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">0</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Details */}
        <div className="flex flex-col justify-center space-y-1 text-xs">
          {/* Lag Time */}
          {data.maxLagMs !== null && data.maxLagMs > 0 ? (
            <>
              <div className="flex items-start gap-1">
                <span className="text-muted-foreground">Oldest:</span>
                <span className={`font-medium ${countColor}`}>{formatDuration(data.maxLagMs)}</span>
              </div>
              {lagLevel !== 'normal' && (
                <div className={`flex items-center gap-1 ${countColor}`}>
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  <span className="font-medium">
                    {lagLevel === 'critical' ? 'Send soon' : 'Ready to send'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">All offers sent</div>
          )}
          
          {/* Total Value */}
          {data.totalValue !== null && data.totalValue > 0 && data.currencyCode && (
            <div className="flex items-start gap-1">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">{formatCurrency(data.totalValue, data.currencyCode)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default UnsentOffersWidget
