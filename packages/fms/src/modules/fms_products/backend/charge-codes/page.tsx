'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Upload } from 'lucide-react'
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
  PerspectiveChangeEvent,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  SortRule,
  KeyboardShortcutsConfig,
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

interface FmsChargeCodeRow {
  id: string
  code: string
  name: string | null
  description: string | null
  chargeUnit: 'container' | 'file' | 'weight_measure' | 'cargo_value_percent'
  keywords: string[] | null
  usage: 'most_common' | 'common' | 'rare' | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const getChargeUnitColor = (unit: string) => {
  const colors: Record<string, string> = {
    container: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    file: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    weight_measure: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    cargo_value_percent: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  }
  return colors[unit] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
}

const getChargeUnitLabel = (unit: string) => {
  const labels: Record<string, string> = {
    container: 'Per Container',
    file: 'Per File',
    weight_measure: 'Weight/Measure',
    cargo_value_percent: '% of Value',
  }
  return labels[unit] || unit
}

const getUsageColor = (usage: string) => {
  const colors: Record<string, string> = {
    most_common: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    common: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    rare: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }
  return colors[usage] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
}

const getUsageLabel = (usage: string) => {
  const labels: Record<string, string> = {
    most_common: 'Most Common',
    common: 'Common',
    rare: 'Rare',
  }
  return labels[usage] || usage
}

const CodeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span className="font-mono text-sm font-medium">
      {value}
    </span>
  )
}

const ChargeUnitRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span
      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getChargeUnitColor(value)}`}
    >
      {getChargeUnitLabel(value)}
    </span>
  )
}

const KeywordsRenderer = ({ value }: { value: string[] | null }) => {
  if (!value || value.length === 0) return <span className="text-gray-400">-</span>
  return (
    <div className="flex flex-wrap gap-1 max-w-[300px]">
      {value.slice(0, 3).map((keyword, idx) => (
        <span
          key={idx}
          className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded"
        >
          {keyword}
        </span>
      ))}
      {value.length > 3 && (
        <span className="px-1.5 py-0.5 text-xs text-gray-500">
          +{value.length - 3}
        </span>
      )}
    </div>
  )
}

const UsageRenderer = ({ value }: { value: string }) => {
  if (!value) return <span className="text-gray-400">-</span>
  return (
    <span
      className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${getUsageColor(value)}`}
    >
      {getUsageLabel(value)}
    </span>
  )
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CodeRenderer: (value) => <CodeRenderer value={value} />,
  ChargeUnitRenderer: (value) => <ChargeUnitRenderer value={value} />,
  KeywordsRenderer: (value) => <KeywordsRenderer value={value} />,
  UsageRenderer: (value) => <UsageRenderer value={value} />,
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

export default function ChargeCodesPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [chargeCodeToDelete, setChargeCodeToDelete] = useState<FmsChargeCodeRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  const { data: tableConfig, isLoading: configLoading } = useTableConfig('fms_products')

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_products_charge_codes'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/fms_products_charge_codes')
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
    queryKey: ['fms_charge_codes', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FmsChargeCodeRow[]; total: number; totalPages?: number }>(
        `/api/fms_products/charge-codes?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load charge codes')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectivesData, columns])

  const handleChargeCodeCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fms_charge_codes'] })
  }, [queryClient])

  const handleConfirmDelete = useCallback(async () => {
    if (!chargeCodeToDelete) return

    setIsDeleting(true)
    const endpoint = `/api/fms_products/charge-codes/${chargeCodeToDelete.id}`

    try {
      const response = await apiCall<{ error?: string }>(endpoint, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Charge code deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_charge_codes'] })
        setChargeCodeToDelete(null)
      } else {
        flash(response.result?.error || 'Failed to delete charge code', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete charge code', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [chargeCodeToDelete, queryClient])

  const actionsRenderer = useCallback((rowData: any, _rowIndex: number) => {
    const row = rowData as FmsChargeCodeRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setChargeCodeToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete charge code', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FmsChargeCodeRow
    if (actionId === 'delete' && row.id) {
      setChargeCodeToDelete(row)
    }
  }, [])

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        const rowData = tableData[payload.rowIndex] as FmsChargeCodeRow | undefined
        if (!rowData) return

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        const endpoint = `/api/fms_products/charge-codes/${payload.id}`

        try {
          const response = await apiCall<{ error?: string }>(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [payload.prop]: payload.newValue }),
          })

          if (response.ok) {
            flash('Charge code updated', 'success')
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

        if (!rowData.code || !rowData.chargeUnit) {
          flash('Code and Charge Unit are required', 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: 'Code and Charge Unit are required',
          } as NewRowSaveErrorEvent)
          return
        }

        const endpoint = '/api/fms_products/charge-codes'

        try {
          const response = await apiCall<{ id: string; error?: string }>(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: rowData.code,
              name: rowData.name || null,
              description: rowData.description || null,
              chargeUnit: rowData.chargeUnit,
              keywords: rowData.keywords || null,
              usage: rowData.usage || null,
              isActive: rowData.isActive === true
            }),
          })

          if (response.ok && response.result?.id) {
            flash('Charge code created', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex,
              savedRowData: { ...rowData, id: response.result.id },
            } as NewRowSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['fms_charge_codes'] })
          } else {
            const error = response.result?.error || 'Failed to create charge code'
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

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        // Handle sort rules change from column header clicks
        if (payload.config.sorting) {
          if (payload.config.sorting.length > 0) {
            const firstSort = payload.config.sorting[0]
            setSortField(firstSort.field)
            setSortDir(firstSort.direction)
          } else {
            // Reset to default when all sorts removed
            setSortField('code')
            setSortDir('asc')
          }
          setPage(1)
        }
      },

      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const settings = dynamicTableToApi(payload.perspective)
        const existingPerspective = savedPerspectives.find(
          (p) => p.name === payload.perspective.name
        )
        const response = await apiCall('/api/perspectives/fms_products_charge_codes', {
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
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products_charge_codes'] })
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
          setSortField('code')
          setSortDir('asc')
          setPage(1)
        }
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const perspective = savedPerspectives.find((p) => p.id === payload.id)
        if (perspective) {
          const settings = dynamicTableToApi(perspective)
          const response = await apiCall('/api/perspectives/fms_products_charge_codes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products_charge_codes'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const url = payload.hardDelete
          ? `/api/perspectives/fms_products_charge_codes/${payload.id}?hardDelete=true`
          : `/api/perspectives/fms_products_charge_codes/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products_charge_codes'] })
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
            setFilters([])
            setSortField('code')
            setSortDir('asc')
          }
        } else {
          flash('Failed to delete perspective', 'error')
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Only show skeleton on initial load, not during refetches
  if (configLoading || (dataLoading && !data)) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={5} />
      </div>
    )
  }

  const importButton = (
    <Button onClick={() => setIsImportDialogOpen(true)} size="sm" variant="outline">
      <Upload className="h-4 w-4 mr-1" />
      Import
    </Button>
  )

  return (
    <div>
      <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Charge Codes"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          actionsRenderer={actionsRenderer}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          uiConfig={{
            hideAddRowButton: false,
            topBarEnd: importButton,
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
      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImported={handleChargeCodeCreated}
      />
      <Dialog open={!!chargeCodeToDelete} onOpenChange={(open) => !open && setChargeCodeToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Charge Code</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{chargeCodeToDelete?.code}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChargeCodeToDelete(null)}
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
    </div>
  )
}
