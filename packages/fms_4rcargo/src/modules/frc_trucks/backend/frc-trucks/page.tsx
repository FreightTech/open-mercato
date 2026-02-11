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

interface FrcTruckRow {
  id: string
  truckCode: string
  licensePlate?: string | null
  carrierId?: string | null
  carrierName?: string | null
  truckType?: string | null
  maxWeight?: number | null
  maxVolume?: number | null
  driverName?: string | null
  driverPhone?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const COLUMNS: ColumnDef[] = [
  { data: 'truckCode', title: 'Code', width: 100, type: 'text' },
  { data: 'licensePlate', title: 'License Plate', width: 120, type: 'text' },
  { data: 'carrierName', title: 'Carrier', width: 150, type: 'text', readOnly: true },
  { data: 'truckType', title: 'Type', width: 100, type: 'text' },
  { data: 'maxWeight', title: 'Max Weight (kg)', width: 120, type: 'numeric' },
  { data: 'maxVolume', title: 'Max Volume (cbm)', width: 120, type: 'numeric' },
  { data: 'driverName', title: 'Driver', width: 150, type: 'text' },
  { data: 'driverPhone', title: 'Driver Phone', width: 130, type: 'text' },
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean', readOnly: true },
]

export default function FrcTrucksPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('truckCode')
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
    queryKey: ['frc_trucks', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcTruckRow[]; total: number }>(
        `/api/frc_trucks/trucks?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load trucks')
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
            `/api/frc_trucks/trucks/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Truck updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_trucks'] })
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
        <TableSkeleton rows={10} columns={9} />
      </div>
    )
  }

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled>
        <Plus className="h-4 w-4 mr-1" />
        Add Truck
      </Button>
    </div>
  )

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Trucks"
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
