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

interface FrcTruckRow {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface FrcTruckPresetRow {
  id: string
  name: string
  width: number
  length: number
  height: number
  maxWeight: number
  volume: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 300, type: 'text' },
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean' },
]

const PRESET_COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 200, type: 'text' },
  { data: 'width', title: 'Width (cm)', width: 100, type: 'numeric' },
  { data: 'length', title: 'Length (cm)', width: 100, type: 'numeric' },
  { data: 'height', title: 'Height (cm)', width: 100, type: 'numeric' },
  { data: 'maxWeight', title: 'Max Weight (kg)', width: 120, type: 'numeric' },
  { data: 'volume', title: 'Volume (m3)', width: 100, type: 'numeric', readOnly: true },
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
let onTruckDeleteHandler: ((truck: FrcTruckRow) => void) | null = null
let onPresetDeleteHandler: ((preset: FrcTruckPresetRow) => void) | null = null

function setTruckDeleteHandler(handler: ((truck: FrcTruckRow) => void) | null) {
  onTruckDeleteHandler = handler
}

function setPresetDeleteHandler(handler: ((preset: FrcTruckPresetRow) => void) | null) {
  onPresetDeleteHandler = handler
}

const DeleteButton = ({ row }: { row: FrcTruckRow }) => {
  if (!row.id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onTruckDeleteHandler) {
          onTruckDeleteHandler(row)
        }
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete Truck"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

const PresetDeleteButton = ({ row }: { row: FrcTruckPresetRow }) => {
  if (!row.id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onPresetDeleteHandler) {
          onPresetDeleteHandler(row)
        }
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete Preset"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

export default function FrcTrucksPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const presetsTableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Trucks table state
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Presets table state
  const [presetsPage, setPresetsPage] = useState(1)
  const [presetsLimit, setPresetsLimit] = useState(50)
  const [presetsSortField, setPresetsSortField] = useState('name')
  const [presetsSortDir, setPresetsSortDir] = useState<'asc' | 'desc'>('asc')
  const [presetsSearch, setPresetsSearch] = useState('')
  const [presetsFilters, setPresetsFilters] = useState<FilterRow[]>([])

  // Delete dialog state (shared for both trucks and presets)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [truckToDelete, setTruckToDelete] = useState<FrcTruckRow | null>(null)
  const [presetToDelete, setPresetToDelete] = useState<FrcTruckPresetRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Register delete handler for truck action renderer
  const openTruckDeleteDialog = useCallback((truck: FrcTruckRow) => {
    setPresetToDelete(null)
    setTruckToDelete(truck)
    setDeleteDialogOpen(true)
  }, [])

  // Register delete handler for preset action renderer
  const openPresetDeleteDialog = useCallback((preset: FrcTruckPresetRow) => {
    setTruckToDelete(null)
    setPresetToDelete(preset)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setTruckDeleteHandler(openTruckDeleteDialog)
    setPresetDeleteHandler(openPresetDeleteDialog)
    return () => {
      setTruckDeleteHandler(null)
      setPresetDeleteHandler(null)
    }
  }, [openTruckDeleteDialog, openPresetDeleteDialog])

  const handleDeleteConfirm = useCallback(async () => {
    if (truckToDelete) {
      setIsDeleting(true)
      try {
        const response = await apiCall(`/api/frc_trucks/trucks/${truckToDelete.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Truck deleted', 'success')
          setDeleteDialogOpen(false)
          setTruckToDelete(null)
          queryClient.invalidateQueries({ queryKey: ['frc_trucks'] })
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
    } else if (presetToDelete) {
      setIsDeleting(true)
      try {
        const response = await apiCall(`/api/frc_trucks/presets/${presetToDelete.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Preset deleted', 'success')
          setDeleteDialogOpen(false)
          setPresetToDelete(null)
          queryClient.invalidateQueries({ queryKey: ['frc_truck_presets'] })
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
    }
  }, [truckToDelete, presetToDelete, queryClient])

  const actionsRenderer = useCallback((rowData: FrcTruckRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return <DeleteButton row={rowData} />
  }, [])

  const presetsActionsRenderer = useCallback((rowData: FrcTruckPresetRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return <PresetDeleteButton row={rowData} />
  }, [])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete truck', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const presetKeyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete preset', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcTruckRow) => {
    if (actionId === 'delete' && rowData.id) {
      openTruckDeleteDialog(rowData)
    }
  }, [openTruckDeleteDialog])

  const handlePresetRowAction = useCallback((actionId: string, rowData: FrcTruckPresetRow) => {
    if (actionId === 'delete' && rowData.id) {
      openPresetDeleteDialog(rowData)
    }
  }, [openPresetDeleteDialog])

  // Trucks query params
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

  // Presets query params
  const presetsQueryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('offset', String((presetsPage - 1) * presetsLimit))
    params.set('limit', String(presetsLimit))
    params.set('sortField', presetsSortField)
    params.set('sortDir', presetsSortDir)
    if (presetsSearch) params.set('q', presetsSearch)
    if (presetsFilters.length) params.set('filters', JSON.stringify(presetsFilters))
    return params.toString()
  }, [presetsPage, presetsLimit, presetsSortField, presetsSortDir, presetsSearch, presetsFilters])

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

  // Fetch presets
  const { data: presetsData, isLoading: presetsLoading } = useQuery({
    queryKey: ['frc_truck_presets', presetsQueryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcTruckPresetRow[]; total: number }>(
        `/api/frc_trucks/presets?${presetsQueryParams}`
      )
      if (!call.ok) throw new Error('Failed to load presets')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'frc_trucks'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/frc_trucks')
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
  const presetsTableData = useMemo(() => presetsData?.items ?? [], [presetsData?.items])

  // Handle inline row creation
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    const { rowIndex, rowData } = payload

    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      const truckData = {
        name: rowData.name?.trim() || '',
        isActive: rowData.isActive !== false,
      }

      if (!truckData.name) {
        throw new Error('Truck name is required')
      }

      const createResponse = await apiCall<{ id: string; error?: string }>(
        '/api/frc_trucks/trucks',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(truckData),
        }
      )

      if (!createResponse.ok || !createResponse.result?.id) {
        const error = createResponse.result?.error || 'Failed to create truck'
        throw new Error(error)
      }

      flash('Truck created successfully', 'success')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...truckData, id: createResponse.result.id },
      })

      queryClient.invalidateQueries({ queryKey: ['frc_trucks'] })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create truck'
      flash(errorMessage, 'error')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex,
        error: errorMessage,
      })
    }
  }, [queryClient])

  // Handle inline preset creation
  const handlePresetNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    const { rowIndex, rowData } = payload

    dispatch(presetsTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      const presetData = {
        name: rowData.name?.trim() || '',
        width: Number(rowData.width) || 245,
        length: Number(rowData.length) || 1360,
        height: Number(rowData.height) || 280,
        maxWeight: Number(rowData.maxWeight) || 24000,
        isActive: rowData.isActive !== false,
      }

      if (!presetData.name) {
        throw new Error('Preset name is required')
      }

      const createResponse = await apiCall<{ id: string; volume: number; error?: string }>(
        '/api/frc_trucks/presets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(presetData),
        }
      )

      if (!createResponse.ok || !createResponse.result?.id) {
        const error = createResponse.result?.error || 'Failed to create preset'
        throw new Error(error)
      }

      flash('Preset created successfully', 'success')

      dispatch(presetsTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...presetData, id: createResponse.result.id, volume: createResponse.result.volume },
      })

      queryClient.invalidateQueries({ queryKey: ['frc_truck_presets'] })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create preset'
      flash(errorMessage, 'error')

      dispatch(presetsTableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
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

      // Perspective events
      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const apiSettings = dynamicTableToApi(payload.perspective)
        const response = await apiCall<{ id: string }>('/api/perspectives/frc_trucks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_trucks'] })
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
          setSortField('name')
          setSortDir('asc')
        }
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const response = await apiCall(`/api/perspectives/frc_trucks/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_trucks'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/frc_trucks/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_trucks'] })
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

  // Presets table event handlers
  useEventHandlers(
    {
      [TableEvents.NEW_ROW_SAVE]: handlePresetNewRowSave,

      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(presetsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const response = await apiCall<{ error?: string; volume?: number }>(
            `/api/frc_trucks/presets/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Preset updated', 'success')
            dispatch(presetsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_truck_presets'] })
          } else {
            const error = response.result?.error || 'Update failed'
            flash(error, 'error')
            dispatch(presetsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error,
            } as CellSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(presetsTableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },

      [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
        setPresetsSortField(payload.columnName)
        setPresetsSortDir(payload.direction || 'asc')
        setPresetsPage(1)
      },

      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setPresetsSearch(payload.query)
        setPresetsPage(1)
      },

      [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
        setPresetsFilters(payload.filters)
        setPresetsPage(1)
      },
    },
    presetsTableRef as React.RefObject<HTMLElement>
  )

  if (isLoading && !data) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={2} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Trucks Table */}
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Trucks"
        idColumnName="id"
        height="calc(100vh - 400px)"
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

      {/* Trailer Presets Table */}
      {presetsLoading && !presetsData ? (
        <div style={{ height: '300px' }}>
          <TableSkeleton rows={5} columns={7} />
        </div>
      ) : (
        <DynamicTable
          tableRef={presetsTableRef}
          data={presetsTableData}
          columns={PRESET_COLUMNS}
          tableName="Trailer Presets"
          idColumnName="id"
          height="350px"
          stretchColumns={true}
          colHeaders={true}
          rowHeaders={true}
          actionsRenderer={presetsActionsRenderer}
          keyboardShortcuts={presetKeyboardShortcuts}
          onRowAction={handlePresetRowAction}
          uiConfig={{
            hideAddRowButton: false,
            hideFilterButton: true,
            hideBottomBar: true,
          }}
          pagination={{
            currentPage: presetsPage,
            totalPages: Math.ceil((presetsData?.total || 0) / presetsLimit),
            limit: presetsLimit,
            limitOptions: [25, 50, 100],
            onPageChange: setPresetsPage,
            onLimitChange: (l) => {
              setPresetsLimit(l)
              setPresetsPage(1)
            },
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={truckToDelete?.name || presetToDelete?.name}
        itemType={truckToDelete ? 'truck' : 'preset'}
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (truckToDelete) {
            tableRef.current?.focus()
          } else {
            presetsTableRef.current?.focus()
          }
        }}
      />
    </div>
  )
}
