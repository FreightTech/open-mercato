"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import type { InvoiceDiscrepanciesSettings } from './config'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

type DiscrepancyItem = {
  id: string
  invoiceNo: string
  carrier: string
  expected: number
  invoiced: number
  currency: string
}

const DUMMY_ITEMS: DiscrepancyItem[] = [
  { id: '1', invoiceNo: 'INV-2024-0891', carrier: 'Trans-Europa GmbH', expected: 2400, invoiced: 2750, currency: 'EUR' },
  { id: '2', invoiceNo: 'INV-2024-0887', carrier: 'Baltic Logistics', expected: 1800, invoiced: 2100, currency: 'EUR' },
  { id: '3', invoiceNo: 'INV-2024-0882', carrier: 'Nordspeed Sp. z o.o.', expected: 3200, invoiced: 2900, currency: 'EUR' },
  { id: '4', invoiceNo: 'INV-2024-0879', carrier: 'Central Freight AG', expected: 1500, invoiced: 1680, currency: 'EUR' },
]

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const InvoiceDiscrepanciesWidget: React.FC<DashboardWidgetComponentProps<InvoiceDiscrepanciesSettings>> = ({ mode }) => {
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">No configuration options for this widget.</p>
      </div>
    )
  }

  const totalDiff = DUMMY_ITEMS.reduce((sum, item) => sum + (item.invoiced - item.expected), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{DUMMY_ITEMS.length} discrepancies</span>
        <span className={`font-medium ${totalDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {totalDiff > 0 ? '+' : ''}{formatCurrency(totalDiff, 'EUR')} net
        </span>
      </div>
      <ul className="divide-y">
        {DUMMY_ITEMS.map((item) => {
          const diff = item.invoiced - item.expected
          const isOver = diff > 0
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.invoiceNo}</span>
                </div>
                <span className="text-xs text-muted-foreground">{item.carrier}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <div className="flex items-center gap-1">
                  {isOver ? (
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                  )}
                  <span className={`text-sm font-medium ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                    {isOver ? '+' : ''}{formatCurrency(diff, item.currency)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(item.expected, item.currency)} expected
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default InvoiceDiscrepanciesWidget
