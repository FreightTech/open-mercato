'use client'

import type { UnitLegStatus } from '../data/types'

const UNIT_LEG_STATUS_CONFIG: Record<UnitLegStatus, { label: string; className: string }> = {
  'PENDING': { label: 'Pending', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'PLANNED': { label: 'Planned', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  'ESTIMATED': { label: 'Estimated', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  'DEPARTED': { label: 'Departed', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'PRE_ARRIVAL': { label: 'Pre-Arrival', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  'ARRIVED': { label: 'Arrived', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

const FALLBACK = { label: 'Unknown', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' }

export function StatusBadge({ status }: { status: string }) {
  const config = UNIT_LEG_STATUS_CONFIG[status as UnitLegStatus] ?? FALLBACK
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
