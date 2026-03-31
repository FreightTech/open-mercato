"use client"

import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'

const statusStyles: Record<string, { label: string; color: string }> = {
  none: { label: '-', color: 'text-muted-foreground' },
  queued: { label: 'Queued', color: 'text-blue-600' },
  submitted: { label: 'Submitted', color: 'text-yellow-600' },
  processing: { label: 'Processing', color: 'text-yellow-600' },
  accepted: { label: 'Accepted', color: 'text-green-600' },
  upo_downloaded: { label: 'UPO', color: 'text-green-700' },
  rejected: { label: 'Rejected', color: 'text-red-600' },
  error: { label: 'Error', color: 'text-red-600' },
  cancelled: { label: 'Cancelled', color: 'text-muted-foreground' },
}

export default function KsefStatusColumnWidget({ data }: InjectionWidgetComponentProps) {
  const ksef = (data as Record<string, unknown>)?._ksef as {
    status?: string
    ksefNumber?: string | null
  } | null

  if (!ksef) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  const style = statusStyles[ksef.status ?? 'none'] ?? statusStyles.none

  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs font-medium ${style.color}`}>
        {style.label}
      </span>
      {ksef.ksefNumber && (
        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]" title={ksef.ksefNumber}>
          {ksef.ksefNumber}
        </span>
      )}
    </div>
  )
}
