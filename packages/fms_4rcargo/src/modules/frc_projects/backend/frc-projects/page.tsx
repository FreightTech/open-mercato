'use client'

import * as React from 'react'
import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  FilterRow,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

interface FrcProjectRow {
  id: string
  projectNumber: string
  rfqName?: string | null
  quoteName?: string | null
  status: string
  totalValue?: string | null
  currencyCode: string
  createdAt: string
  updatedAt: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#dcfce7', text: '#166534' },
  completed: { bg: '#dbeafe', text: '#1e40af' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
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

const RENDERERS: Record<string, (value: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
}

const COLUMNS: ColumnDef[] = [
  { data: 'projectNumber', title: 'Project #', width: 150, type: 'text', readOnly: true },
  { data: 'rfqName', title: 'RFQ', width: 200, type: 'text', readOnly: true },
  { data: 'quoteName', title: 'Quote', width: 200, type: 'text', readOnly: true },
  { data: 'status', title: 'Status', width: 100, type: 'text', renderer: RENDERERS.StatusRenderer, readOnly: true },
  { data: 'totalValue', title: 'Total Value', width: 120, type: 'numeric', readOnly: true },
  { data: 'currencyCode', title: 'Currency', width: 80, type: 'text', readOnly: true },
]

export default function FrcProjectsPage() {
  const tableRef = useRef<HTMLDivElement>(null)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
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
    queryKey: ['frc_projects', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcProjectRow[]; total: number }>(
        `/api/frc_projects/projects?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load projects')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

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
        <TableSkeleton rows={10} columns={6} />
      </div>
    )
  }

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Projects"
        idColumnName="id"
        height="calc(100vh - 110px)"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={true}
        uiConfig={{
          hideAddRowButton: true,
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
