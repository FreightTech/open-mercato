"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import type { NeedsAttentionSettings } from './config'
import { AlertTriangle, FileWarning, Clock, Truck } from 'lucide-react'

type AttentionItem = {
  id: string
  title: string
  reason: string
  severity: 'critical' | 'warning'
  icon: 'doc' | 'clock' | 'truck'
  age: string
}

const DUMMY_ITEMS: AttentionItem[] = [
  { id: '1', title: 'PRJ-1042 — Hamburg → Warsaw', reason: 'Missing customs docs', severity: 'critical', icon: 'doc', age: '2h ago' },
  { id: '2', title: 'PRJ-1038 — Rotterdam → Prague', reason: 'Carrier unresponsive (48h)', severity: 'critical', icon: 'clock', age: '1d ago' },
  { id: '3', title: 'PRJ-1051 — Gdansk → Berlin', reason: 'Delivery delayed', severity: 'warning', icon: 'truck', age: '4h ago' },
  { id: '4', title: 'PRJ-1047 — Antwerp → Vienna', reason: 'Invoice mismatch', severity: 'warning', icon: 'doc', age: '6h ago' },
]

const iconMap = {
  doc: FileWarning,
  clock: Clock,
  truck: Truck,
}

const NeedsAttentionWidget: React.FC<DashboardWidgetComponentProps<NeedsAttentionSettings>> = ({ mode }) => {
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">No configuration options for this widget.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y">
      {DUMMY_ITEMS.map((item) => {
        const Icon = iconMap[item.icon]
        return (
          <li key={item.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <div className={`mt-0.5 flex-shrink-0 rounded p-1 ${item.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{item.title}</span>
                <span className="flex-shrink-0 text-xs text-muted-foreground">{item.age}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {item.severity === 'critical' && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                <span className={`text-xs ${item.severity === 'critical' ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                  {item.reason}
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default NeedsAttentionWidget
