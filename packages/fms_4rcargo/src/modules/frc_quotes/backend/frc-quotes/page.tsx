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

interface FrcQuoteRow {
  id: string
  quoteNumber: string
  rfqId: string
  rfqNumber?: string | null
  totalAmount?: number | null
  currency: string
  status: string
  validUntil?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

const COLUMNS: ColumnDef[] = [
  { data: 'quoteNumber', title: 'Quote #', width: 120, type: 'text', readOnly: true },
  { data: 'rfqNumber', title: 'RFQ', width: 120, type: 'text', readOnly: true },
  { data: 'totalAmount', title: 'Total Amount', width: 120, type: 'numeric' },
  { data: 'currency', title: 'Currency', width: 80, type: 'text' },
  { data: 'status', title: 'Status', width: 100, type: 'text' },
  { data: 'validUntil', title: 'Valid Until', width: 120, type: 'date' },
  { data: 'notes', title: 'Notes', width: 200, type: 'text' },
]

export default function FrcQuotesPage() {
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
    queryKey: ['frc_quotes', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcQuoteRow[]; total: number }>(
        `/api/frc_quotes/quotes?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load quotes')
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
            `/api/frc_quotes/quotes/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Quote updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_quotes'] })
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
        setSortDir(payload.direction || 'asc')
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

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled>
        <Plus className="h-4 w-4 mr-1" />
        New Quote
      </Button>
    </div>
  )

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Quotes"
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
