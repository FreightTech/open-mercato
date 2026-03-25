'use client'

import type { DerivedStatus } from '../data/mock'

const STATUS_CONFIG: Record<DerivedStatus, { className: string }> = {
  'Empty': { className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'Planning': { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  'Ready': { className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  'In Transit': { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  'Delivered': { className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  'Partially Delivered': { className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
}

export function StatusBadge({ status }: { status: DerivedStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['Empty']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {status}
    </span>
  )
}
