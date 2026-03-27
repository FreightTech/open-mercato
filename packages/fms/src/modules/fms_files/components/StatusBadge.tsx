'use client'

import type { UnitLegStatus, TransportStatus, FinancialStatus, DocumentationStatus } from '../data/types'

type StatusConfig = { label: string; className: string }

const UNIT_LEG_STATUS_CONFIG: Record<UnitLegStatus, StatusConfig> = {
  'PENDING': { label: 'Pending', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'PLANNED': { label: 'Planned', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  'ESTIMATED': { label: 'Estimated', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  'DEPARTED': { label: 'Departed', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'PRE_ARRIVAL': { label: 'Pre-Arrival', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  'ARRIVED': { label: 'Arrived', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

const TRANSPORT_STATUS_CONFIG: Record<TransportStatus, StatusConfig> = {
  'EMPTY': { label: 'Empty', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'PLANNING': { label: 'Planning', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  'READY': { label: 'Ready', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  'IN_TRANSIT': { label: 'In Transit', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'PARTIALLY_DELIVERED': { label: 'Partial', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  'DELIVERED': { label: 'Delivered', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

const FINANCIAL_STATUS_CONFIG: Record<FinancialStatus, StatusConfig> = {
  'NO_LINES': { label: 'No Lines', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'ESTIMATED': { label: 'Estimated', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  'PARTIALLY_INVOICED': { label: 'Partial', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'INVOICED': { label: 'Invoiced', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  'SETTLED': { label: 'Settled', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

const DOCUMENTATION_STATUS_CONFIG: Record<DocumentationStatus, StatusConfig> = {
  'PENDING': { label: 'Pending', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'PARTIAL': { label: 'Partial', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  'REVIEW_NEEDED': { label: 'Review', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'COMPLETE': { label: 'Complete', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

const CONFIG_BY_KIND: Record<string, Record<string, StatusConfig>> = {
  unitLeg: UNIT_LEG_STATUS_CONFIG,
  transport: TRANSPORT_STATUS_CONFIG,
  financial: FINANCIAL_STATUS_CONFIG,
  documentation: DOCUMENTATION_STATUS_CONFIG,
}

const FALLBACK: StatusConfig = { label: 'Unknown', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' }

export type StatusBadgeKind = 'unitLeg' | 'transport' | 'financial' | 'documentation'

export function StatusBadge({ status, kind = 'unitLeg' }: { status: string; kind?: StatusBadgeKind }) {
  const configMap = CONFIG_BY_KIND[kind] ?? UNIT_LEG_STATUS_CONFIG
  const config = configMap[status] ?? FALLBACK
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
