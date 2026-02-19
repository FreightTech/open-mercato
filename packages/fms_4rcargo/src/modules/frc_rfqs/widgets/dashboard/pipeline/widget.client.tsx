"use client"

import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydratePipelineSettings, type PipelineSettings, type DateRangePreset } from './config'
import { TrendingUp, TrendingDown, Minus, FileText, Send, CheckCircle, XCircle } from 'lucide-react'

type StageData = {
  stage: 'received' | 'offer_sent' | 'offer_accepted' | 'closed_lost'
  count: number
  totalValue: number
}

type PipelineData = {
  stages: StageData[]
  totals: { count: number; value: number }
  currencyCode: string | null
  comparison?: {
    previousCount: number
    change: number
    direction: 'up' | 'down' | 'stable'
  }
}

async function loadPipelineData(settings: PipelineSettings): Promise<PipelineData> {
  const params = new URLSearchParams({
    dateRange: settings.dateRange,
    showComparison: String(settings.showComparison),
  })
  const call = await apiCall<PipelineData>(`/api/frc_rfqs/dashboard/widgets/pipeline?${params}`)
  if (!call.ok) {
    const message =
      typeof (call.result as Record<string, unknown> | null)?.error === 'string'
        ? ((call.result as Record<string, unknown>).error as string)
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  return call.result ?? {
    stages: [],
    totals: { count: 0, value: 0 },
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

const STAGE_CONFIG: Record<string, { icon: React.FC<{ className?: string }>; color: string; label: string }> = {
  received: { icon: FileText, color: 'text-blue-600 bg-blue-100 dark:bg-blue-950/40', label: 'Received' },
  offer_sent: { icon: Send, color: 'text-orange-600 bg-orange-100 dark:bg-orange-950/40', label: 'Offer Sent' },
  offer_accepted: { icon: CheckCircle, color: 'text-green-600 bg-green-100 dark:bg-green-950/40', label: 'Accepted' },
  closed_lost: { icon: XCircle, color: 'text-red-600 bg-red-100 dark:bg-red-950/40', label: 'Lost' },
}

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisQuarter', label: 'This quarter' },
]

const PipelineWidget: React.FC<DashboardWidgetComponentProps<PipelineSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  onSettingsChange,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydratePipelineSettings(settings), [settings])
  const [data, setData] = React.useState<PipelineData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadPipelineData(hydrated)
      setData(result)
    } catch (err) {
      console.error('Failed to load RFQ pipeline widget data', err)
      setError(t('frc_rfqs.widgets.pipeline.error', 'Failed to load data'))
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
          <label className="text-sm font-medium">{t('frc_rfqs.widgets.pipeline.settings.dateRange', 'Date Range')}</label>
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
            {t('frc_rfqs.widgets.pipeline.settings.showComparison', 'Show comparison to previous period')}
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

  return (
    <div className="space-y-4">
      {/* Header with totals */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-2xl font-bold">{data?.totals.count ?? '-'}</div>
            <div className="text-xs text-muted-foreground">{t('frc_rfqs.widgets.pipeline.totalRfqs', 'Total Opportunities')}</div>
          </div>
          {data?.totals.value && data.currencyCode && (
            <div className="border-l pl-4">
              <div className="text-lg font-semibold">{formatCurrency(data.totals.value, data.currencyCode)}</div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.widgets.pipeline.pipelineValue', 'Pipeline Value')}</div>
            </div>
          )}
        </div>
        {data?.comparison && (
          <div className="flex items-center gap-1 text-sm">
            {data.comparison.direction === 'up' && (
              <>
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-green-600 font-medium">+{data.comparison.change}</span>
              </>
            )}
            {data.comparison.direction === 'down' && (
              <>
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-red-600 font-medium">-{data.comparison.change}</span>
              </>
            )}
            {data.comparison.direction === 'stable' && (
              <>
                <Minus className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">0</span>
              </>
            )}
            <span className="text-muted-foreground ml-1">{t('frc_rfqs.widgets.pipeline.vsPrevious', 'vs previous')}</span>
          </div>
        )}
      </div>

      {/* Pipeline stages */}
      {(loading || !data) ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {data.stages.map((stage) => {
            const config = STAGE_CONFIG[stage.stage]
            const Icon = config.icon
            return (
              <Link
                key={stage.stage}
                href={`/backend/frc-rfqs?salesStage=${stage.stage}`}
                className={`rounded-lg p-3 transition-opacity hover:opacity-80 ${config.color.split(' ')[1]}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${config.color.split(' ')[0]}`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t(`frc_rfqs.widgets.pipeline.stages.${stage.stage}`, config.label)}
                  </span>
                </div>
                <div className={`text-2xl font-bold ${config.color.split(' ')[0]}`}>{stage.count}</div>
                {stage.totalValue > 0 && data.currencyCode && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(stage.totalValue, data.currencyCode)}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PipelineWidget
