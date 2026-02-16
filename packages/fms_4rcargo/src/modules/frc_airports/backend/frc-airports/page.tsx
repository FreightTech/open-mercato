'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
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
  NewRowSaveEvent,
  KeyboardShortcutsConfig,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
  SortRule,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'

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
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean' },
]

// Transform API perspective format to DynamicTable format
function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig {
  const { columnOrder = [], columnVisibility = {} } = dto.settings

  const visible =
    columnOrder.length > 0
      ? columnOrder.filter((col) => columnVisibility[col] !== false)
      : allColumns
  const hidden = allColumns.filter((col) => !visible.includes(col))

  const apiFilters = dto.settings.filters as Record<string, unknown> | undefined
  const filters: FilterRow[] = Array.isArray(apiFilters)
    ? (apiFilters as FilterRow[])
    : ((apiFilters?.rows as FilterRow[]) ?? [])
  const color = apiFilters?._color as PerspectiveConfig['color']

  const sorting: SortRule[] = (dto.settings.sorting ?? []).map((s) => ({
    id: s.id,
    field: s.id,
    direction: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc',
  }))

  return { id: dto.id, name: dto.name, color, columns: { visible, hidden }, filters, sorting }
}

// Transform DynamicTable perspective format to API format
function dynamicTableToApi(config: PerspectiveConfig): PerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach((col) => (columnVisibility[col] = true))
  config.columns.hidden.forEach((col) => (columnVisibility[col] = false))

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map((s) => ({
      id: s.field,
      desc: s.direction === 'desc',
    })),
  }
}

// Global ref for delete handler
let onAirportDeleteHandler: ((airport: FrcAirportRow) => void) | null = null

function setAirportDeleteHandler(handler: ((airport: FrcAirportRow) => void) | null) {
  onAirportDeleteHandler = handler
}

const DeleteButton = ({ row }: { row: FrcAirportRow }) => {
  if (!row.id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onAirportDeleteHandler) {
          onAirportDeleteHandler(row)
        }
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete Airport"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

export default function FrcAirportsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [airportToDelete, setAirportToDelete] = useState<FrcAirportRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Register delete handler for action renderer
  const openDeleteDialog = useCallback((airport: FrcAirportRow) => {
    setAirportToDelete(airport)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setAirportDeleteHandler(openDeleteDialog)
    return () => setAirportDeleteHandler(null)
  }, [openDeleteDialog])

  const handleDeleteConfirm = useCallback(async () => {
    if (!airportToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_airports/airports/${airportToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Airport deleted', 'success')
        setDeleteDialogOpen(false)
        setAirportToDelete(null)
        queryClient.invalidateQueries({ queryKey: ['frc_airports'] })
      } else {
        const error = (response.result as { error?: string })?.error ?? 'Delete failed'
        flash(error, 'error')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [airportToDelete, queryClient])

  const actionsRenderer = useCallback((rowData: FrcAirportRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return <DeleteButton row={rowData} />
  }, [])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete airport', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcAirportRow) => {
    if (actionId === 'delete' && rowData.id) {
      openDeleteDialog(rowData)
    }
  }, [openDeleteDialog])

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

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'frc_airports'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/frc_airports')
      return response.ok ? response.result : null
    },
  })

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && COLUMNS.length > 0) {
      const allCols = COLUMNS.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, activePerspectiveId])

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  // Handle inline row creation
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    const { rowIndex, rowData } = payload

    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      const airportData = {
        code: rowData.code?.trim() || '',
        longCode: rowData.longCode?.trim() || '',
        city: rowData.city?.trim() || null,
        country: rowData.country?.trim() || null,
        isActive: rowData.isActive !== false,
      }

      if (!airportData.code) {
        throw new Error('Airport code is required')
      }

      const createResponse = await apiCall<{ id: string; error?: string }>(
        '/api/frc_airports/airports',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(airportData),
        }
      )

      if (!createResponse.ok || !createResponse.result?.id) {
        const error = createResponse.result?.error || 'Failed to create airport'
        throw new Error(error)
      }

      flash('Airport created successfully', 'success')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...airportData, id: createResponse.result.id },
      })

      queryClient.invalidateQueries({ queryKey: ['frc_airports'] })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create airport'
      flash(errorMessage, 'error')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex,
        error: errorMessage,
      })
    }
  }, [queryClient])

  useEventHandlers(
    {
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,

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

      // Perspective events
      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const apiSettings = dynamicTableToApi(payload.perspective)
        const response = await apiCall<{ id: string }>('/api/perspectives/frc_airports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_airports'] })
        } else {
          flash('Failed to save perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_SELECT]: (payload: PerspectiveSelectEvent) => {
        setActivePerspectiveId(payload.id)
        if (payload.config) {
          setFilters(payload.config.filters)
          if (payload.config.sorting.length > 0) {
            setSortField(payload.config.sorting[0].field)
            setSortDir(payload.config.sorting[0].direction)
          }
        } else {
          // Reset to default when "All" is selected
          setFilters([])
          setSortField('code')
          setSortDir('asc')
        }
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const response = await apiCall(`/api/perspectives/frc_airports/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_airports'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/frc_airports/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_airports'] })
        } else {
          flash('Failed to delete perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        if (payload.config.filters) {
          setFilters(payload.config.filters)
        }
        if (payload.config.sorting && payload.config.sorting.length > 0) {
          setSortField(payload.config.sorting[0].field)
          setSortDir(payload.config.sorting[0].direction)
        }
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
        actionsRenderer={actionsRenderer}
        keyboardShortcuts={keyboardShortcuts}
        onRowAction={handleRowAction}
        savedPerspectives={savedPerspectives}
        activePerspectiveId={activePerspectiveId}
        uiConfig={{
          hideAddRowButton: false,
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
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={airportToDelete?.code}
        itemType="airport"
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          tableRef.current?.focus()
        }}
      />
    </div>
  )
}
