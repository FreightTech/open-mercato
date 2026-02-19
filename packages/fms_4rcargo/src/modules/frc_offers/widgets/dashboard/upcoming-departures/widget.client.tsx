"use client"

import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydrateUpcomingDeparturesSettings, type UpcomingDeparturesSettings, type DaysAhead } from './config'
import { Plane, Calendar, Clock } from 'lucide-react'

type DepartureItem = {
  offerId: string
  offerName: string
  routingId: string
  origin: string
  destination: string
  departureDate: string
  departureTime: string | null
  flightNumber: string | null
  accountName: string | null
}

type UpcomingDeparturesData = {
  departures: DepartureItem[]
  totalCount: number
}

async function loadDeparturesData(settings: UpcomingDeparturesSettings): Promise<UpcomingDeparturesData> {
  const params = new URLSearchParams({
    daysAhead: String(settings.daysAhead),
    maxItems: String(settings.maxItems),
  })
  const call = await apiCall<UpcomingDeparturesData>(`/api/frc_offers/dashboard/widgets/upcoming-departures?${params}`)
  if (!call.ok) {
    const message =
      typeof (call.result as Record<string, unknown> | null)?.error === 'string'
        ? ((call.result as Record<string, unknown>).error as string)
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  return call.result ?? { departures: [], totalCount: 0 }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const isToday = dateStr === today.toISOString().split('T')[0]
  const isTomorrow = dateStr === tomorrow.toISOString().split('T')[0]

  if (isToday) return 'Today'
  if (isTomorrow) return 'Tomorrow'

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const DAYS_AHEAD_OPTIONS: { value: DaysAhead; label: string }[] = [
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
]

const UpcomingDeparturesWidget: React.FC<DashboardWidgetComponentProps<UpcomingDeparturesSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  onSettingsChange,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydrateUpcomingDeparturesSettings(settings), [settings])
  const [data, setData] = React.useState<UpcomingDeparturesData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadDeparturesData(hydrated)
      setData(result)
    } catch (err) {
      console.error('Failed to load upcoming departures widget data', err)
      setError(t('frc_offers.widgets.upcomingDepartures.error', 'Failed to load data'))
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
          <label className="text-sm font-medium">{t('frc_offers.widgets.upcomingDepartures.settings.daysAhead', 'Days Ahead')}</label>
          <select
            value={hydrated.daysAhead}
            onChange={(e) => onSettingsChange({ ...hydrated, daysAhead: Number(e.target.value) as DaysAhead })}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {DAYS_AHEAD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('frc_offers.widgets.upcomingDepartures.settings.maxItems', 'Max Items')}</label>
          <input
            type="number"
            min={1}
            max={10}
            value={hydrated.maxItems}
            onChange={(e) => onSettingsChange({ ...hydrated, maxItems: Math.min(10, Math.max(1, parseInt(e.target.value) || 5)) })}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
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

  return (
    <div className="space-y-3">
      {(loading || !data) ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : data.departures.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Plane className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">{t('frc_offers.widgets.upcomingDepartures.noDepartures', 'No upcoming departures')}</p>
        </div>
      ) : (
        <>
          {data.departures.map((departure) => (
            <Link
              key={departure.routingId}
              href={`/backend/frc-offers?id=${departure.offerId}`}
              className="block rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-medium">
                  <span className="text-sm">{departure.origin}</span>
                  <Plane className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm">{departure.destination}</span>
                </div>
                {departure.flightNumber && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {departure.flightNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(departure.departureDate)}</span>
                </div>
                {departure.departureTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{departure.departureTime}</span>
                  </div>
                )}
              </div>
              {departure.accountName && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {departure.accountName}
                </div>
              )}
            </Link>
          ))}
        </>
      )}
    </div>
  )
}

export default UpcomingDeparturesWidget
