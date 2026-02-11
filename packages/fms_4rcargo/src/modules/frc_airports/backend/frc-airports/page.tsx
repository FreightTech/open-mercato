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

interface FrcAirportRow {
  id: string
  code: string
  longCode: string
  city?: string | null
  country?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const COLUMNS: ColumnDef[] = [
  { data: 'code', title: 'Code', width: 100, type: 'text' },
  { data: 'longCode', title: 'Name', width: 250, type: 'text' },
  { data: 'city', title: 'City', width: 150, type: 'text' },
  { data: 'country', title: 'Country', width: 120, type: 'text' },
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean', readOnly: true },
]

export default function FrcAirportsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
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
    queryKey: ['frc_airports', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcAirportRow[]; total: number }>(
        `/api/frc_airports/airports?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load airports')
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
            `/api/frc_airports/airports/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Airport updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_airports'] })
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
        <TableSkeleton rows={10} columns={5} />
      </div>
    )
  }

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled>
        <Plus className="h-4 w-4 mr-1" />
        Add Airport
      </Button>
    </div>
  )

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Airports"
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
