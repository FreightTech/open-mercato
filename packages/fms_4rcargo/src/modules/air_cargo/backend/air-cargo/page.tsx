'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Trash2, Eye, ExternalLink } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
  KeyboardShortcutsConfig,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
  SortRule,
  NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AirCargoDrawer } from '../../components/AirCargoDrawer'
import { FRC_STACKABLE_TYPES } from '../../../../lib/types'

interface AirCargoRow {
  id: string
  name: string
  rfqId?: string | null
  rfqName?: string | null
  numberOfPieces: number
  stackableType: string
  lengthCm?: string | null
  widthCm?: string | null
  heightCm?: string | null
  volumeM3: string
  actualWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
  createdAt: string
  updatedAt: string
}

const STACKABLE_OPTIONS = FRC_STACKABLE_TYPES.map((type) => ({
  value: type,
  label: type === 'fully_stackable' ? 'Fully Stackable' : 'Non-Stackable',
}))

const STACKABLE_COLORS: Record<string, { bg: string; text: string }> = {
  fully_stackable: { bg: '#dcfce7', text: '#166534' },
  non_stackable: { bg: '#fef3c7', text: '#92400e' },
}

const StackableRenderer = ({ value }: { value: string }) => {
  // Show default 'fully_stackable' when empty (for new rows)
  const displayValue = value || 'fully_stackable'
  const colors = STACKABLE_COLORS[displayValue] || { bg: '#f3f4f6', text: '#374151' }
  const label = displayValue === 'fully_stackable' ? 'Fully Stackable' : 'Non-Stackable'
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const RfqNameRenderer = (value: string, rowData: any) => {
  if (!value) return <span>-</span>
  
  // Try to parse as JSON (from EntitySearchEditor for new rows)
  let displayName = value
  let rfqId = rowData?.rfqId
  
  try {
    const parsed = JSON.parse(value)
    displayName = parsed.name || value
    rfqId = parsed.id || rfqId
  } catch {
    // Plain string from API - use as-is
  }
  
  // If we have an rfqId, make it a link
  if (rfqId) {
    return (
      <Link
        href={`/backend/frc-rfqs/${rfqId}`}
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
        <ExternalLink className="h-3 w-3" />
      </Link>
    )
  }
  
  return <span>{displayName}</span>
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{new Date(value).toLocaleDateString()}</span>
}

const NumberRenderer = ({ value }: { value: string | number }) => {
  if (value === null || value === undefined) return <span>-</span>
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return <span>-</span>
  return <span className="font-mono text-right">{num.toFixed(2)}</span>
}

const RENDERERS: Record<string, (value: any, rowData?: any) => React.ReactNode> = {
  StackableRenderer: (value) => <StackableRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  NumberRenderer: (value) => <NumberRenderer value={value} />,
  RfqNameRenderer: (value, rowData) => RfqNameRenderer(value, rowData),
}

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

export default function AirCargoPage() {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Drawer state - only for viewing details
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // EntitySearchEditor config for RFQ selection
  const rfqEditorConfig = useMemo(
    () => ({
      entityType: 'frc_rfqs:frc_rfq',
      extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
        JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
        }),
      placeholder: 'Search RFQs...',
      minQueryLength: 2,
    }),
    []
  )

  // Define columns with RFQ EntitySearchEditor
  const columns = useMemo(
    (): ColumnDef[] => [
      { data: 'name', title: 'Name', width: 200, type: 'text' },
      {
        data: 'rfqName',
        title: 'RFQ',
        width: 200,
        type: 'text',
        editor: createEntitySearchEditor(rfqEditorConfig),
        renderer: RENDERERS.RfqNameRenderer,
      },
      { data: 'numberOfPieces', title: 'Pieces', width: 80, type: 'numeric' },
      {
        data: 'stackableType',
        title: 'Stackable',
        width: 140,
        type: 'dropdown',
        source: STACKABLE_OPTIONS,
        renderer: RENDERERS.StackableRenderer,
      },
      { data: 'lengthCm', title: 'L (cm)', width: 90, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      { data: 'widthCm', title: 'W (cm)', width: 90, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      { data: 'heightCm', title: 'H (cm)', width: 90, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      {
        data: 'volumeM3',
        title: 'Volume (m³)',
        width: 110,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.NumberRenderer,
      },
      { data: 'actualWeightKg', title: 'Weight (kg)', width: 110, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      {
        data: 'chargeableWeightKg',
        title: 'Chargeable (kg)',
        width: 130,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.NumberRenderer,
      },
      {
        data: 'loadingMetres',
        title: 'LDM',
        width: 90,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.NumberRenderer,
      },
      {
        data: 'createdAt',
        title: 'Created',
        width: 120,
        type: 'date',
        readOnly: true,
        renderer: RENDERERS.DateRenderer,
      },
    ],
    [rfqEditorConfig]
  )

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
    queryKey: ['air_cargo', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: AirCargoRow[]; total: number }>(
        `/api/air_cargo/air-cargo?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load air cargo')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'air_cargo'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/air_cargo')
      return response.ok ? response.result : null
    },
  })

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns, activePerspectiveId])

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  // Open drawer to view cargo details
  const handleViewDetails = useCallback((id: string) => {
    setViewingId(id)
    setDrawerOpen(true)
  }, [])

  const handleConfirmDelete = useCallback((id: string) => {
    setDeletingId(id)
    setDeleteDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingId) return

    try {
      const response = await apiCall(`/api/air_cargo/air-cargo/${deletingId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash(t('air_cargo.messages.deleted', 'Air cargo deleted successfully'), 'success')
        queryClient.invalidateQueries({ queryKey: ['air_cargo'] })
      } else {
        const error = (response.result as any)?.error ?? 'Delete failed'
        flash(error, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      flash(message, 'error')
    } finally {
      setDeleteDialogOpen(false)
      setDeletingId(null)
    }
  }, [deletingId, t, queryClient])

  // Actions renderer with View and Delete icons
  const actionsRenderer = useCallback(
    (rowData: AirCargoRow, _rowIndex: number) => {
      if (!rowData.id) return null
      return (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleViewDetails(rowData.id)
            }}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title={t('air_cargo.actions.view', 'View Details')}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleConfirmDelete(rowData.id)
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title={t('air_cargo.actions.delete', 'Delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    },
    [handleViewDetails, handleConfirmDelete, t]
  )

  // Keyboard shortcuts - Shift+Enter for view details, Cmd+D for delete
  const keyboardShortcuts = useMemo(
    (): KeyboardShortcutsConfig => ({
      rowActions: [
        { id: 'view', label: 'View details', key: 'Enter', shift: true },
        { id: 'delete', label: 'Delete cargo', key: 'd', ctrlOrCmd: true },
      ],
    }),
    []
  )

  const handleRowAction = useCallback(
    (actionId: string, rowData: AirCargoRow) => {
      if (actionId === 'view' && rowData.id) {
        handleViewDetails(rowData.id)
      } else if (actionId === 'delete' && rowData.id) {
        handleConfirmDelete(rowData.id)
      }
    },
    [handleViewDetails, handleConfirmDelete]
  )

  // Handle inline row creation
  const handleNewRowSave = useCallback(
    async (payload: NewRowSaveEvent) => {
      const { rowIndex, rowData } = payload

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

      try {
        // Parse RFQ from EntitySearchEditor JSON (if provided)
        let rfqId: string | null = null
        if (rowData.rfqName) {
          try {
            const parsed = JSON.parse(rowData.rfqName)
            rfqId = parsed.id || null
          } catch {
            // Not JSON, ignore
            rfqId = null
          }
        }

        // Build cargo data - convert numeric values to strings for API
        const cargoData = {
          rfqId,
          name: rowData.name?.trim() || 'Air Cargo',
          numberOfPieces: parseInt(rowData.numberOfPieces) || 1,
          stackableType: rowData.stackableType || 'fully_stackable',
          lengthCm: rowData.lengthCm != null && rowData.lengthCm !== '' ? String(rowData.lengthCm) : null,
          widthCm: rowData.widthCm != null && rowData.widthCm !== '' ? String(rowData.widthCm) : null,
          heightCm: rowData.heightCm != null && rowData.heightCm !== '' ? String(rowData.heightCm) : null,
          actualWeightKg: rowData.actualWeightKg != null && rowData.actualWeightKg !== '' ? String(rowData.actualWeightKg) : '0',
        }

        // Validate name
        if (!cargoData.name) {
          throw new Error('Name is required')
        }

        const response = await apiCall<{ id: string; error?: string }>('/api/air_cargo/air-cargo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cargoData),
        })

        if (response.ok && response.result?.id) {
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
            rowIndex,
            savedRowData: { ...cargoData, id: response.result.id },
          })
          queryClient.invalidateQueries({ queryKey: ['air_cargo'] })
          flash(t('air_cargo.messages.created', 'Air cargo created'), 'success')
        } else {
          throw new Error(response.result?.error || 'Failed to create air cargo')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        flash(errorMessage, 'error')
        dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
          rowIndex,
          error: errorMessage,
        })
      }
    },
    [queryClient, t]
  )

  useEventHandlers(
    {
      // Handle inline cell editing for existing rows
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Handle RFQ field specially - extract ID from JSON
          let updateValue = payload.newValue
          if (payload.prop === 'rfqName' && payload.newValue) {
            try {
              const parsed = JSON.parse(payload.newValue)
              // Send rfqId instead of rfqName for the update
              const response = await apiCall<{ error?: string }>(
                `/api/air_cargo/air-cargo/${payload.id}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rfqId: parsed.id }),
                }
              )

              if (response.ok) {
                flash(t('air_cargo.messages.updated', 'Air cargo updated'), 'success')
                dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
                  rowIndex: payload.rowIndex,
                  colIndex: payload.colIndex,
                } as CellSaveSuccessEvent)
                queryClient.invalidateQueries({ queryKey: ['air_cargo'] })
              } else {
                throw new Error(response.result?.error || 'Update failed')
              }
              return
            } catch (parseError) {
              // If not JSON, clear the RFQ link
              updateValue = null
            }
          }

          const response = await apiCall<{ error?: string }>(
            `/api/air_cargo/air-cargo/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: updateValue }),
            }
          )

          if (response.ok) {
            flash(t('air_cargo.messages.updated', 'Air cargo updated'), 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['air_cargo'] })
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

      // Handle new row save (inline creation)
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,

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

      // Perspective events
      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const apiSettings = dynamicTableToApi(payload.perspective)
        const response = await apiCall<{ id: string }>('/api/perspectives/air_cargo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash(t('air_cargo.messages.perspectiveSaved', 'Perspective saved'), 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'air_cargo'] })
        } else {
          flash(t('air_cargo.messages.perspectiveSaveFailed', 'Failed to save perspective'), 'error')
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
          setSortField('createdAt')
          setSortDir('desc')
        }
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const response = await apiCall(`/api/perspectives/air_cargo/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash(t('air_cargo.messages.perspectiveRenamed', 'Perspective renamed'), 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'air_cargo'] })
        } else {
          flash(t('air_cargo.messages.perspectiveRenameFailed', 'Failed to rename perspective'), 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/air_cargo/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash(t('air_cargo.messages.perspectiveDeleted', 'Perspective deleted'), 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'air_cargo'] })
        } else {
          flash(t('air_cargo.messages.perspectiveDeleteFailed', 'Failed to delete perspective'), 'error')
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
        <TableSkeleton rows={10} columns={columns.length} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">{t('air_cargo.title', 'Air Cargo')}</h1>
      </div>

      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Air Cargo"
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
          hideAddRowButton: false, // Enable inline row creation
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

      {/* Air Cargo Detail Drawer */}
      <AirCargoDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        airCargoId={viewingId}
        mainTableRef={tableRef as React.RefObject<HTMLElement>}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('air_cargo.delete.title', 'Delete Air Cargo')}</DialogTitle>
            <DialogDescription>
              {t(
                'air_cargo.delete.description',
                'Are you sure you want to delete this air cargo? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('air_cargo.actions.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('air_cargo.actions.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
