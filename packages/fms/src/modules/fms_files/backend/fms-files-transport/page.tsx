'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'
import { useDynamicTablePage } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AlertTriangle, Ship, Truck, Train, Plane } from 'lucide-react'
import type { DerivedStatus, CargoType, LegType } from '../../data/mock'

// ─── Renderers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Empty': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  'Planning': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  'Ready': { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-700 dark:text-indigo-300' },
  'In Transit': { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-300' },
  'Delivered': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300' },
  'Partially Delivered': { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300' },
}

const LEG_TYPE_COLORS: Record<string, string> = {
  TRUCK: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SHIP: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  RAIL: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  AIR: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
}

const LEG_TYPE_ICONS: Record<string, React.ElementType> = {
  TRUCK: Truck,
  SHIP: Ship,
  RAIL: Train,
  AIR: Plane,
}

const RENDERERS: Record<string, (value: unknown, rowData: Record<string, unknown>) => React.ReactNode> = {
  referenceNumber: (value) =>
    React.createElement('span', { className: 'font-mono text-xs text-foreground' }, value as string),

  status: (value) => {
    const status = value as DerivedStatus
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS['Empty']
    return React.createElement('span', {
      className: `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${colors.bg} ${colors.text}`,
    }, status)
  },

  cargoType: (value) => {
    const ct = value as CargoType
    const color = ct === 'FCL'
      ? 'text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700'
      : 'text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700'
    return React.createElement('span', {
      className: `inline-flex px-1.5 rounded text-[10px] font-semibold border ${color}`,
    }, ct)
  },

  shipmentType: (value) =>
    React.createElement('span', {
      className: 'inline-flex px-1.5 rounded text-[10px] font-medium border border-border text-muted-foreground',
    }, value as string),

  containerCommodity: (_value, rowData) => {
    const containerNumber = rowData.containerNumber as string | null
    const commodity = rowData.commodityDescription as string | null
    const cargoType = rowData.cargoType as CargoType

    if (cargoType === 'FCL') {
      return React.createElement('span', { className: 'font-mono text-xs text-foreground' }, containerNumber ?? '(TBD)')
    }
    const text = commodity ?? '-'
    const truncated = text.length > 35 ? text.substring(0, 35) + '...' : text
    return React.createElement('span', { className: 'text-xs text-foreground', title: text }, truncated)
  },

  legType: (value) => {
    if (!value) {
      return React.createElement('span', {
        className: 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      }, 'UNASSIGNED')
    }
    const type = value as LegType
    const colorClass = LEG_TYPE_COLORS[type] ?? LEG_TYPE_COLORS.TRUCK
    const IconComponent = LEG_TYPE_ICONS[type] ?? Truck
    return React.createElement('span', {
      className: `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`,
    },
      React.createElement(IconComponent, { className: 'w-3 h-3' }),
      type,
    )
  },

  etaWithCount: (value, rowData) => {
    const count = rowData.etaUpdateCount as number
    if (!value) return React.createElement('span', { className: 'text-xs text-muted-foreground' }, '-')
    return React.createElement('span', { className: 'text-xs' },
      value as string,
      count > 1 ? React.createElement('span', { key: 'c', className: 'ml-1 text-amber-500 text-[10px]' }, `(${count}x)`) : null,
    )
  },

  weight: (value, rowData) => {
    const weight = value as number | null
    const unit = rowData.weightUnit as string | null
    if (weight != null) {
      return React.createElement('span', { className: 'text-xs text-foreground' }, `${weight.toLocaleString()} ${unit ?? 'kg'}`)
    }
    return React.createElement('span', { className: 'text-xs text-muted-foreground' }, '-')
  },

  volume: (value, rowData) => {
    const vol = value as number | null
    const unit = rowData.volumeUnit as string | null
    if (vol != null) {
      return React.createElement('span', { className: 'text-xs text-foreground' }, `${vol} ${unit ?? ''}`)
    }
    return null
  },

  hazardous: (value) => {
    if (value) {
      return React.createElement(AlertTriangle, { className: 'w-3.5 h-3.5 text-amber-500' })
    }
    return null
  },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FmsFilesTransportPage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)

  // Fetch table config from API
  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fms-files-transport-table-config'],
    queryFn: async () => {
      const response = await apiCall<{ columns: Array<{ data: string; title: string; width: number; type?: string; readOnly?: boolean; renderer?: string }> }>('/api/fms_files/transport/table-config')
      if (!response.ok) throw new Error('Failed to load table config')
      return response.result
    },
  })

  // Build columns with renderers
  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col) => {
      const renderer = col.renderer ? RENDERERS[col.renderer] : undefined
      return {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
        renderer,
      } as ColumnDef
    })
  }, [tableConfig])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open file', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: Record<string, unknown>) => {
    if (actionId === 'view') {
      const fileId = rowData.fileId as string
      if (fileId) {
        router.push(`/backend/fms-files/${fileId}`)
      }
    }
  }, [router])

  // useDynamicTablePage for data fetching + pagination + perspectives
  const table = useDynamicTablePage({
    source: '/api/fms_files/transport',
    columns,
    tableName: 'FMS Transport (New)',
    perspectives: 'fms-files-transport',
    defaultSort: { field: 'containerNumber', direction: 'asc' },
    defaultPageSize: 100,
    queryKey: 'fms-files-transport',
    tableProps: {
      height: 'fill',
      keyboardShortcuts,
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        borderless: true,
      },
    },
  })

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading table configuration...</p>
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        onRowAction={handleRowAction}
        pagination={{
          ...table.props.pagination!,
          limitOptions: [50, 100, 200],
        }}
      />
    </div>
  )
}
