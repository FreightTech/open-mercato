'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Plus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
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
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  FilterRow,
  ColumnDef,
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
import { useTableConfig } from '../../components/useTableConfig'
import { ImportDialog } from '../../components/ImportDialog'
import { LocationDrawer } from '../../components/LocationDrawer'
import type { LocationType } from '../../data/types'

interface FmsLocationRow {
  id: string
  code: string
  name: string
  type: LocationType
  portId?: string | null
  locode?: string | null
  lat?: number | null
  lng?: number | null
  city?: string | null
  country?: string | null
  createdAt: string
  updatedAt: string
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  port: { bg: '#dbeafe', text: '#1e40af' },           // blue
  terminal: { bg: '#ffedd5', text: '#c2410c' },       // orange
  contractor_office: { bg: '#e0e7ff', text: '#3730a3' },   // indigo
  contractor_warehouse: { bg: '#dcfce7', text: '#166534' }, // green
  contractor_billing: { bg: '#f3e8ff', text: '#7c3aed' },   // purple
  contractor_shipping: { bg: '#cffafe', text: '#0e7490' },  // cyan
  contractor_other: { bg: '#f3f4f6', text: '#374151' },     // gray
}

const getTypeColor = (type: string) => {
  return TYPE_COLORS[type] || { bg: '#f3f4f6', text: '#374151' }
}

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    port: 'Port',
    terminal: 'Terminal',
    contractor_office: 'Office',
    contractor_warehouse: 'Warehouse',
    contractor_billing: 'Billing',
    contractor_shipping: 'Shipping',
    contractor_other: 'Other',
  }
  return labels[type] || type
}

const CodeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span className="font-mono text-sm font-medium">
      {value}
    </span>
  )
}

const TypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = getTypeColor(value)
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {getTypeLabel(value)}
    </span>
  )
}

// Store edit handler ref for use in renderer
let editHandlerRef: ((row: FmsLocationRow) => void) | null = null

const NameRenderer = ({ value, rowData }: { value: string; rowData: FmsLocationRow }) => {
  if (!value) return <span>-</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        editHandlerRef?.(rowData)
      }}
      className="text-left text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
    >
      {value}
    </button>
  )
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CodeRenderer: (value) => <CodeRenderer value={value} />,
  TypeRenderer: (value) => <TypeRenderer value={value} />,
  NameRenderer: (value, rowData) => <NameRenderer value={value} rowData={rowData} />,
}

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

export default function FmsLocationsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [locationToDelete, setLocationToDelete] = useState<FmsLocationRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Location drawer state
  const [isLocationDrawerOpen, setIsLocationDrawerOpen] = useState(false)
  const [locationDrawerMode, setLocationDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [selectedLocationType, setSelectedLocationType] = useState<LocationType | undefined>(undefined)

  const { data: tableConfig, isLoading: configLoading } = useTableConfig('fms_locations')

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_locations'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/fms_locations')
      return response.ok ? response.result : null
    },
  })

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('q', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['fms_locations', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FmsLocationRow[]; total: number; totalPages?: number }>(
        `/api/fms_locations/locations?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load locations')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => {
    return data?.items ?? []
  }, [data?.items])

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col) => ({
      ...col,
      type: col.type === 'checkbox' ? 'boolean' : col.type,
      renderer: col.renderer ? RENDERERS[col.renderer] : undefined,
    })) as ColumnDef[]
  }, [tableConfig])

  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns])

  const handleLocationCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fms_locations'] })
  }, [queryClient])

  const handleAddLocation = useCallback((type?: LocationType) => {
    setLocationDrawerMode('create')
    setSelectedLocationId(null)
    setSelectedLocationType(type || 'port')
    setIsLocationDrawerOpen(true)
  }, [])

  const handleEditLocation = useCallback((location: FmsLocationRow) => {
    setLocationDrawerMode('edit')
    setSelectedLocationId(location.id)
    setSelectedLocationType(location.type)
    setIsLocationDrawerOpen(true)
  }, [])

  // Set handler ref for NameRenderer
  useEffect(() => {
    editHandlerRef = handleEditLocation
    return () => {
      editHandlerRef = null
    }
  }, [handleEditLocation])

  const handleLocationSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fms_locations'] })
  }, [queryClient])

  const handleConfirmDelete = useCallback(async () => {
    if (!locationToDelete) return

    setIsDeleting(true)
    // Use unified API for all location types
    const endpoint = `/api/fms_locations/unified/${locationToDelete.id}`

    try {
      const response = await apiCall<{ error?: string }>(endpoint, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Location deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_locations'] })
        setLocationToDelete(null)
      } else {
        flash(response.result?.error || 'Failed to delete location', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete location', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [locationToDelete, queryClient])

  const actionsRenderer = useCallback((rowData: any, _rowIndex: number) => {
    const row = rowData as FmsLocationRow
    if (!row.id) return null
    return (
      <div className="flex items-center justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setLocationToDelete(row)
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        const rowData = tableData[payload.rowIndex] as FmsLocationRow | undefined
        if (!rowData) return

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        const endpoint = rowData.type === 'port'
          ? `/api/fms_locations/ports/${payload.id}`
          : `/api/fms_locations/terminals/${payload.id}`

        try {
          const response = await apiCall<{ error?: string }>(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [payload.prop]: payload.newValue }),
          })

          if (response.ok) {
            flash('Location updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
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

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        const { rowIndex, rowData } = payload

        if (!rowData.type || !rowData.code || !rowData.name) {
          flash('Type, Code and Name are required', 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: 'Type, Code and Name are required',
          } as NewRowSaveErrorEvent)
          return
        }

        const endpoint = rowData.type === 'port'
          ? '/api/fms_locations/ports'
          : '/api/fms_locations/terminals'

        try {
          const response = await apiCall<{ id: string; error?: string }>(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: rowData.code,
              name: rowData.name,
              locode: rowData.locode || null,
              lat: rowData.lat ? parseFloat(rowData.lat) : null,
              lng: rowData.lng ? parseFloat(rowData.lng) : null,
              city: rowData.city || null,
              country: rowData.country || null,
            }),
          })

          if (response.ok && response.result?.id) {
            flash('Location created', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex,
              savedRowData: { ...rowData, id: response.result.id },
            } as NewRowSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['fms_locations'] })
          } else {
            const error = response.result?.error || 'Failed to create location'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex,
              error,
            } as NewRowSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
        }
      },

      [TableEvents.COLUMN_SORT]: (payload: {
        columnName: string
        direction: 'asc' | 'desc' | null
      }) => {
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

      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const settings = dynamicTableToApi(payload.perspective)
        const existingPerspective = savedPerspectives.find(
          (p) => p.name === payload.perspective.name
        )
        const response = await apiCall('/api/perspectives/fms_locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingPerspective?.id,
            name: payload.perspective.name,
            settings,
          }),
        })
        if (response.ok) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_locations'] })
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
          setPage(1)
        } else {
          setFilters([])
          setSortField('name')
          setSortDir('asc')
          setPage(1)
        }
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const perspective = savedPerspectives.find((p) => p.id === payload.id)
        if (perspective) {
          const settings = dynamicTableToApi(perspective)
          const response = await apiCall('/api/perspectives/fms_locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_locations'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const url = payload.hardDelete
          ? `/api/perspectives/fms_locations/${payload.id}?hardDelete=true`
          : `/api/perspectives/fms_locations/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_locations'] })
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
            setFilters([])
            setSortField('name')
            setSortDir('asc')
          }
        } else {
          flash('Failed to delete perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        if (payload.config.sorting) {
          if (payload.config.sorting.length > 0) {
            const firstSort = payload.config.sorting[0]
            setSortField(firstSort.field)
            setSortDir(firstSort.direction)
          } else {
            setSortField('name')
            setSortDir('asc')
          }
          setPage(1)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (configLoading || (dataLoading && !data)) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={5} />
      </div>
    )
  }

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button onClick={() => handleAddLocation()} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        Add Location
      </Button>
      <Button onClick={() => setIsImportDialogOpen(true)} size="sm" variant="outline">
        <Upload className="h-4 w-4 mr-1" />
        Import
      </Button>
    </div>
  )

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Locations"
        idColumnName="id"
        height="calc(100vh - 110px)"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={true}
        savedPerspectives={savedPerspectives}
        activePerspectiveId={activePerspectiveId}
        actionsRenderer={actionsRenderer}
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
      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImported={handleLocationCreated}
      />
      <Dialog open={!!locationToDelete} onOpenChange={(open) => !open && setLocationToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{locationToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLocationToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LocationDrawer
        open={isLocationDrawerOpen}
        onOpenChange={setIsLocationDrawerOpen}
        mode={locationDrawerMode}
        locationType={selectedLocationType}
        locationId={selectedLocationId ?? undefined}
        onSaved={handleLocationSaved}
      />
    </div>
  )
}
