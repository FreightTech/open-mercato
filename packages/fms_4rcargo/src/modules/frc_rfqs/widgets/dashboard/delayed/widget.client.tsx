"use client"

import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydrateDelayedShipmentsSettings, type DelayedShipmentsSettings } from './config'
import { AlertTriangle, Clock, Truck } from 'lucide-react'

type DelayedData = {
  count: number
  byStatus: {
    isDelayed: number
    inTransitDelayed: number
  }
  oldest: {
    id: string
    name: string
    daysDelayed: number
  } | null
  totalValue: number | null
  currencyCode: string | null
}

async function loadDelayedData(): Promise<DelayedData> {
  const call = await apiCall<DelayedData>('/api/frc_rfqs/dashboard/widgets/delayed')
  if (!call.ok) {
    const message =
      typeof (call.result as Record<string, unknown> | null)?.error === 'string'
        ? ((call.result as Record<string, unknown>).error as string)
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  return call.result ?? {
    count: 0,
    byStatus: { isDelayed: 0, inTransitDelayed: 0 },
    oldest: null,
    totalValue: null,
    currencyCode: null,
  }
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const DelayedShipmentsWidget: React.FC<DashboardWidgetComponentProps<DelayedShipmentsSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydrateDelayedShipmentsSettings(settings), [settings])
  const [data, setData] = React.useState<DelayedData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadDelayedData()
      setData(result)
    } catch (err) {
      console.error('Failed to load delayed shipments widget data', err)
      setError(t('frc_rfqs.widgets.delayed.error', 'Failed to load data'))
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
        <p className="text-muted-foreground">{t('frc_rfqs.widgets.delayed.noSettings', 'No configuration options for this widget.')}</p>
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

  const hasDelays = data && data.count > 0
  const countColor = hasDelays ? 'text-red-600' : 'text-green-600'

  return (
    <Link href="/backend/frc-rfqs?isDelayed=true" className="block hover:opacity-80 transition-opacity">
      <div className="grid grid-cols-2 gap-3 min-h-12">
        {(loading || !data) && (
          <div className="col-span-2 flex items-center justify-center">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        {!loading && data && (
          <>
            {/* Column 1: Count */}
            <div className="flex items-center gap-2 border-r pr-3">
              <div className={`text-5xl font-bold leading-none ${countColor}`}>{data.count}</div>
              <div className="flex flex-col gap-0.5 text-xs">
                <div className="text-muted-foreground leading-tight flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  <span>
                    {data.count === 1 ? t('frc_rfqs.widgets.delayed.delayedSingular', 'delayed') : t('frc_rfqs.widgets.delayed.delayedPlural', 'delayed')}
                    <br />
                    {data.count === 1 ? t('frc_rfqs.widgets.delayed.shipmentSingular', 'shipment') : t('frc_rfqs.widgets.delayed.shipmentPlural', 'shipments')}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: Details */}
            <div className="flex flex-col justify-center space-y-1 text-xs">
              {hasDelays ? (
                <>
                  {/* Breakdown */}
                  {data.byStatus.isDelayed > 0 && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-orange-600" />
                      <span className="text-muted-foreground">{t('frc_rfqs.widgets.delayed.marked', 'Marked')}:</span>
                      <span className="font-medium text-orange-600">{data.byStatus.isDelayed}</span>
                    </div>
                  )}
                  {data.byStatus.inTransitDelayed > 0 && (
                    <div className="flex items-center gap-1">
                      <Truck className="h-3 w-3 text-red-600" />
                      <span className="text-muted-foreground">{t('frc_rfqs.widgets.delayed.inTransit', 'In transit')}:</span>
                      <span className="font-medium text-red-600">{data.byStatus.inTransitDelayed}</span>
                    </div>
                  )}
                  {/* Oldest */}
                  {data.oldest && (
                    <div className="flex items-start gap-1 mt-1">
                      <span className="text-muted-foreground">{t('frc_rfqs.widgets.delayed.oldest', 'Oldest')}:</span>
                      <span className="font-medium text-red-600">{data.oldest.daysDelayed}d</span>
                    </div>
                  )}
                  {/* Total Value */}
                  {data.totalValue !== null && data.totalValue > 0 && data.currencyCode && (
                    <div className="flex items-start gap-1">
                      <span className="text-muted-foreground">{t('frc_rfqs.widgets.delayed.value', 'Value')}:</span>
                      <span className="font-medium">{formatCurrency(data.totalValue, data.currencyCode)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-green-600 flex items-center gap-1">
                  <span className="font-medium">{t('frc_rfqs.widgets.delayed.allOnTime', 'All on time')}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Link>
  )
}

export default DelayedShipmentsWidget
