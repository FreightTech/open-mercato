'use client'

import * as React from 'react'
import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface FrcRfqRow {
  id: string
  name: string
  salesStage: string
  deliveryStatus: string
  probability: number
  amount?: string | null
  currencyCode: string
  totalPieces: number
  totalChargeableWeight: string
  requestDate: string
  createdAt: string
  updatedAt: string
}

const SALES_STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  received: { bg: '#dbeafe', text: '#1e40af' },
  quote_sent: { bg: '#fef3c7', text: '#92400e' },
  quote_accepted: { bg: '#dcfce7', text: '#166534' },
  closed_lost: { bg: '#fee2e2', text: '#991b1b' },
}

const SalesStageRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = SALES_STAGE_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
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
  SalesStageRenderer: (value) => <SalesStageRenderer value={value} />,
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 250, type: 'text' },
  { data: 'salesStage', title: 'Sales Stage', width: 120, type: 'text', renderer: RENDERERS.SalesStageRenderer },
  { data: 'deliveryStatus', title: 'Delivery', width: 100, type: 'text' },
  { data: 'probability', title: 'Probability %', width: 100, type: 'numeric' },
  { data: 'totalPieces', title: 'Pieces', width: 80, type: 'numeric', readOnly: true },
  { data: 'totalChargeableWeight', title: 'Chg. Weight', width: 100, type: 'numeric', readOnly: true },
  { data: 'amount', title: 'Amount', width: 100, type: 'numeric' },
  { data: 'currencyCode', title: 'Currency', width: 80, type: 'text', readOnly: true },
]

export default function FrcRfqsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

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
    queryKey: ['frc_rfqs', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcRfqRow[]; total: number }>(
        `/api/frc_rfqs/rfqs?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load RFQs')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const response = await apiCall<{ error?: string }>(
            `/api/frc_rfqs/rfqs/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('RFQ updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_rfqs'] })
          } else {
            const error = response.result?.error || 'Update failed'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error,
            } as CellSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },

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
        <TableSkeleton rows={10} columns={8} />
      </div>
    )
  }

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled>
        <Plus className="h-4 w-4 mr-1" />
        New RFQ
      </Button>
    </div>
  )

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="RFQs (Opportunities)"
        idColumnName="id"
        height="calc(100vh - 110px)"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={true}
        uiConfig={{
          hideAddRowButton: true,
          topBarEnd: topBarButtons,
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
