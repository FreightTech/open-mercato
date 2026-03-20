'use client'

import * as React from 'react'
import { useMemo, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'
import { useDynamicTablePage } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AlertTriangle, Ship, Truck, TrainFront, Plane } from 'lucide-react'

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'UNITS' | 'ALL' | 'TRUCK' | 'RAIL' | 'AIR' | 'SEA'

const LEG_TYPE_CONFIG: Record<string, { icon: React.ElementType; textClass: string; legType: string }> = {
  TRUCK: { icon: Truck,      textClass: 'text-orange-600 dark:text-orange-400', legType: 'TRUCK' },
  RAIL:  { icon: TrainFront, textClass: 'text-green-600 dark:text-green-400',  legType: 'RAIL'  },
  AIR:   { icon: Plane,      textClass: 'text-purple-600 dark:text-purple-400', legType: 'AIR'  },
  SEA:   { icon: Ship,       textClass: 'text-blue-600 dark:text-blue-400',    legType: 'SHIP'  },
}

const TYPE_TABS: TabId[] = ['TRUCK', 'RAIL', 'AIR', 'SEA']

// ─── Renderers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Empty': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  'Planning': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  'Ready': { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-700 dark:text-indigo-300' },
  'In Transit': { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-300' },
  'Delivered': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300' },
  'Partially Delivered': { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300' },
}

const LEG_TYPE_ICON_COLORS: Record<string, string> = {
  TRUCK: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SHIP: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  RAIL: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  AIR: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

const LEG_TYPE_ICONS: Record<string, React.ElementType> = {
  TRUCK: Truck,
  SHIP: Ship,
  RAIL: TrainFront,
  AIR: Plane,
}

const RENDERERS: Record<string, (value: unknown, rowData: Record<string, unknown>) => React.ReactNode> = {
  referenceNumber: (value) =>
    React.createElement('span', { className: 'font-mono text-xs text-foreground' }, value as string),

  status: (value) => {
    const status = value as string | null
    if (!status) return null
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS['Empty']
    return React.createElement('span', {
      className: `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${colors.bg} ${colors.text}`,
    }, status)
  },

  cargoType: (value) => {
    const ct = value as string | null
    if (!ct) return null
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
    const cargoType = rowData.cargoType as string | null

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
    const type = value as string
    const colorClass = LEG_TYPE_ICON_COLORS[type] ?? LEG_TYPE_ICON_COLORS.TRUCK
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

// ─── Table content (keyed per tab) ────────────────────────────────────────────

interface TransportTableProps {
  columns: ColumnDef[]
  extraParams: Record<string, string>
  topBar: React.ReactNode
  onRowAction: (actionId: string, rowData: Record<string, unknown>) => void
}

function TransportTable({ columns, extraParams, topBar, onRowAction }: TransportTableProps) {
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open file', key: 'Enter', shift: true },
    ],
  }), [])

  const table = useDynamicTablePage({
    source: '/api/fms_files/transport',
    columns,
    tableName: 'FMS Transport (New)',
    perspectives: 'fms-files-transport',
    defaultSort: { field: 'containerNumber', direction: 'asc' },
    defaultPageSize: 100,
    queryKey: 'fms-files-transport',
    extraParams,
    tableProps: {
      height: 'fill',
      keyboardShortcuts,
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        borderless: true,
        topBarStart: topBar,
      },
    },
  })

  return (
    <DynamicTable
      {...table.props}
      onRowAction={onRowAction}
      pagination={{
        ...table.props.pagination!,
        limitOptions: [50, 100, 200],
      }}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FmsFilesTransportPage() {
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState<TabId>('ALL')

  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fms-files-transport-table-config'],
    queryFn: async () => {
      const response = await apiCall<{ columns: Array<{ data: string; title: string; width: number; type?: string; readOnly?: boolean; renderer?: string }> }>('/api/fms_files/transport/table-config')
      if (!response.ok) throw new Error('Failed to load table config')
      return response.result
    },
  })

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

  const extraParams = useMemo((): Record<string, string> => {
    if (selectedTab === 'UNITS') return { view: 'units' }
    if (selectedTab === 'ALL') return {}
    return { legType: LEG_TYPE_CONFIG[selectedTab].legType }
  }, [selectedTab])

  const handleRowAction = useCallback((actionId: string, rowData: Record<string, unknown>) => {
    if (actionId === 'view') {
      const fileId = rowData.fileId as string
      if (fileId) {
        router.push(`/backend/fms-files/${fileId}`)
      }
    }
  }, [router])

  const topBar = React.createElement(
    'div',
    { className: 'flex items-center gap-0' },
    React.createElement(
      'button',
      {
        className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${selectedTab === 'UNITS' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`,
        onClick: () => setSelectedTab('UNITS'),
        type: 'button',
      },
      'Units',
    ),
    React.createElement(
      'button',
      {
        className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${selectedTab === 'ALL' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`,
        onClick: () => setSelectedTab('ALL'),
        type: 'button',
      },
      'All',
    ),
    ...TYPE_TABS.map((tabId) => {
      const cfg = LEG_TYPE_CONFIG[tabId]
      const Icon = cfg.icon
      const isActive = selectedTab === tabId
      return React.createElement(
        'button',
        {
          key: tabId,
          className: `px-2.5 py-1.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${isActive ? `border-current ${cfg.textClass}` : 'border-transparent text-muted-foreground hover:text-foreground'}`,
          onClick: () => setSelectedTab(tabId),
          type: 'button',
        },
        React.createElement(Icon, { className: 'w-3.5 h-3.5 shrink-0' }),
        tabId === 'SEA' ? 'Sea' : tabId.charAt(0) + tabId.slice(1).toLowerCase(),
      )
    }),
  )

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading table configuration...</p>
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <TransportTable
        key={selectedTab}
        columns={columns}
        extraParams={extraParams}
        topBar={topBar}
        onRowAction={handleRowAction}
      />
    </div>
  )
}
