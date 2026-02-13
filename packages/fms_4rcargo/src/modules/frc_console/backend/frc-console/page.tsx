'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  FilterRow,
  ColumnDef,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

interface FrcConsoleRow {
  id: string
  name: string
  date: string
  status: string
  truckPresetId: string
  projectId: string | null
  project: { id: string; projectNumber: string } | null
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  createdAt: string
  updatedAt: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.charAt(0).toUpperCase() + value.slice(1)
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{new Date(value).toLocaleDateString()}</span>
}

const RouteRenderer = ({ value, rowData }: { value: unknown; rowData: FrcConsoleRow }) => {
  const origin = rowData.originAirport?.code ?? '?'
  const dest = rowData.destinationAirport?.code ?? '?'
  return <span>{origin} - {dest}</span>
}

const ProjectRenderer = ({ value, rowData }: { value: unknown; rowData: FrcConsoleRow }) => {
  if (!rowData.project) return <span className="text-muted-foreground">-</span>
  return (
    <span className="font-mono text-xs text-blue-600">
      {rowData.project.projectNumber}
    </span>
  )
}

const RENDERERS: Record<string, (value: any, rowData?: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  RouteRenderer: (value, rowData) => <RouteRenderer value={value} rowData={rowData} />,
  ProjectRenderer: (value, rowData) => <ProjectRenderer value={value} rowData={rowData} />,
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 200, type: 'text', readOnly: true },
  { data: 'date', title: 'Date', width: 100, type: 'text', readOnly: true, renderer: RENDERERS.DateRenderer },
  { data: 'truckName', title: 'Truck', width: 120, type: 'text', readOnly: true },
  { data: 'route', title: 'Route', width: 120, type: 'text', readOnly: true, renderer: RENDERERS.RouteRenderer },
  { data: 'status', title: 'Status', width: 100, type: 'text', readOnly: true, renderer: RENDERERS.StatusRenderer },
  { data: 'truckPresetId', title: 'Preset', width: 100, type: 'text', readOnly: true },
  { data: 'projectNumber', title: 'Project', width: 120, type: 'text', readOnly: true, renderer: RENDERERS.ProjectRenderer },
]

export default function FrcConsolePage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('offset', String((page - 1) * limit))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('q', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data, isLoading } = useQuery({
    queryKey: ['frc_console', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcConsoleRow[]; total: number }>(
        `/api/frc_console/console?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load consoles')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Transform data to include flat fields for rendering
  const tableData = useMemo(() => {
    return (data?.items ?? []).map((item) => ({
      ...item,
      truckName: item.truck?.name ?? '-',
      route: `${item.originAirport?.code ?? '?'} - ${item.destinationAirport?.code ?? '?'}`,
      projectNumber: item.project?.projectNumber ?? null,
    }))
  }, [data?.items])

  const handleViewConsole = useCallback((consoleId: string) => {
    router.push(`/backend/frc-console/${consoleId}`)
  }, [router])

  // Actions renderer with Eye icon
  const actionsRenderer = useCallback((rowData: FrcConsoleRow & { truckName: string; route: string; projectNumber: string | null }, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleViewConsole(rowData.id)
        }}
        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
        title="View Console"
      >
        <Eye className="h-4 w-4" />
      </button>
    )
  }, [handleViewConsole])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View console', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcConsoleRow) => {
    if (actionId === 'view' && rowData.id) {
      handleViewConsole(rowData.id)
    }
  }, [handleViewConsole])

  useEventHandlers(
    {
      [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
        setSortField(payload.columnName)
        setSortDir(payload.direction || 'desc')
        setPage(1)
      },

      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearch(payload.query)
        setPage(1)
      },

      [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
        setFilters(payload.filters)
        setPage(1)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (isLoading && !data) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={7} />
      </div>
    )
  }

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Truck Loading Console"
        idColumnName="id"
        height="calc(100vh - 110px)"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={true}
        actionsRenderer={actionsRenderer}
        keyboardShortcuts={keyboardShortcuts}
        onRowAction={handleRowAction}
        uiConfig={{
          hideAddRowButton: true,
          readOnlyStyle: 'normal',
        }}
        pagination={{
          currentPage: page,
          totalPages: Math.ceil((data?.total || 0) / limit),
          limit,
          limitOptions: [25, 50, 100],
          onPageChange: setPage,
          onLimitChange: (l) => {
            setLimit(l)
            setPage(1)
          },
        }}
      />
    </div>
  )
}
