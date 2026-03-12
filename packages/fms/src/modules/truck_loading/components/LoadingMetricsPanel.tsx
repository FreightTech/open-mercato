'use client'

import React from 'react'
import type { LoadingMetrics } from '../lib/types'

interface LoadingMetricsPanelProps {
  metrics: LoadingMetrics
}

function MetricBadge({ label, value, total, unit, percent }: {
  label: string
  value: number
  total: number
  unit: string
  percent: number
}) {
  const clampedPercent = Math.min(percent, 100)
  const barColor = clampedPercent > 90 ? 'bg-red-500' : clampedPercent > 70 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className="flex flex-col gap-0.5 w-28">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
        <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
          {value}/{total}{unit}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  )
}

export function LoadingMetricsPanel({ metrics }: LoadingMetricsPanelProps) {
  return (
    <div className="flex items-center justify-between w-full">
      <MetricBadge
        label="Area"
        value={metrics.floorAreaUsed}
        total={metrics.floorAreaTotal}
        unit="m²"
        percent={metrics.floorAreaPercent}
      />
      <MetricBadge
        label="LDM"
        value={metrics.ldmUsed}
        total={metrics.ldmTotal}
        unit="m"
        percent={metrics.ldmPercent}
      />
      <MetricBadge
        label="Weight"
        value={metrics.weightLoaded}
        total={metrics.weightCapacity}
        unit="kg"
        percent={metrics.weightPercent}
      />
      <MetricBadge
        label="Volume"
        value={metrics.volumeUsed}
        total={metrics.volumeTotal}
        unit="m³"
        percent={metrics.volumePercent}
      />
      <MetricBadge
        label="Items"
        value={metrics.itemsPlaced}
        total={metrics.itemsTotal}
        unit=""
        percent={metrics.itemsTotal > 0 ? (metrics.itemsPlaced / metrics.itemsTotal) * 100 : 0}
      />
    </div>
  )
}
