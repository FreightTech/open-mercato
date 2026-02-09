'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
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
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface ProductRow {
  id: string
  name: string
  chargeCode: string | null
  chargeUnit: string | null
  transportMode: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
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

const CHARGE_UNIT_OPTIONS = [
  { value: 'container', label: 'Container' },
  { value: 'file', label: 'File' },
  { value: 'weight_measure', label: 'Weight Measure' },
  { value: 'cargo_value_percent', label: 'Cargo Value %' },
]

const TRANSPORT_MODE_OPTIONS = [
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'rail', label: 'Rail' },
]

const CHARGE_UNIT_COLORS: Record<string, { bg: string; text: string }> = {
  container: { bg: '#dbeafe', text: '#1e40af' },
  file: { bg: '#fef3c7', text: '#92400e' },
  weight_measure: { bg: '#e0e7ff', text: '#3730a3' },
  cargo_value_percent: { bg: '#fce7f3', text: '#9d174d' },
}

const TRANSPORT_MODE_COLORS: Record<string, { bg: string; text: string }> = {
  sea: { bg: '#dbeafe', text: '#1e40af' },
  air: { bg: '#f3e8ff', text: '#6b21a8' },
  rail: { bg: '#fef3c7', text: '#92400e' },
}

function PillRenderer({ value, options, colors }: {
  value: unknown
  options: { value: string; label: string }[]
  colors: Record<string, { bg: string; text: string }>
}) {
  const str = value as string
  if (!str) return null
  const opt = options.find((o) => o.value === str)
  const color = colors[str] ?? { bg: '#f1f5f9', text: '#475569' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: 500,
      backgroundColor: color.bg,
      color: color.text,
      lineHeight: '20px',
    }}>
      {opt?.label ?? str}
    </span>
  )
}

const PRODUCT_COLUMNS: ColumnDef[] = [
  {
    data: 'name',
    title: 'Product Name',
    width: 280,
    type: 'text',
  },
  {
    data: 'chargeCode',
    title: 'Charge Code',
    width: 130,
    type: 'text',
  },
  {
    data: 'chargeUnit',
    title: 'Charge Unit',
    width: 130,
    type: 'dropdown',
    source: CHARGE_UNIT_OPTIONS,
    renderer: (value: unknown) => (
      <PillRenderer value={value} options={CHARGE_UNIT_OPTIONS} colors={CHARGE_UNIT_COLORS} />
    ),
  },
  {
    data: 'transportMode',
    title: 'Transport Mode',
    width: 130,
    type: 'dropdown',
    source: TRANSPORT_MODE_OPTIONS,
    renderer: (value: unknown) => (
      <PillRenderer value={value} options={TRANSPORT_MODE_OPTIONS} colors={TRANSPORT_MODE_COLORS} />
    ),
  },
  {
    data: 'isActive',
    title: 'Active',
    width: 70,
    type: 'boolean',
  },
]

export default function ProductsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [rowToDelete, setRowToDelete] = useState<ProductRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_products'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>(
        '/api/perspectives/fms_products'
      )
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
    queryKey: ['fms_products', queryParams],
    queryFn: async () => {
      const call = await apiCall<{
        items: ProductRow[]
        total: number
        totalPages?: number
      }>(`/api/fms_products/products?${queryParams}`)
      if (!call.ok) throw new Error('Failed to load products')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => {
    return data?.items ?? []
  }, [data?.items])

  const columns = PRODUCT_COLUMNS

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

  const handleConfirmDelete = useCallback(async () => {
    if (!rowToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall<{ error?: string }>(
        `/api/fms_products/products/${rowToDelete.id}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        flash('Product deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_products'] })
        setRowToDelete(null)
      } else {
        flash(response.result?.error || 'Failed to delete product', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete product', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [rowToDelete, queryClient])

  const actionsRenderer = useCallback((_rowData: unknown, _rowIndex: number) => {
    const row = _rowData as ProductRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setRowToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete Product"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete product', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as ProductRow
    if (actionId === 'delete' && row.id) {
      setRowToDelete(row)
    }
  }, [])

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  const handleCellEditSave = useCallback(
    async (payload: CellEditSaveEvent) => {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
      } as CellSaveStartEvent)

      try {
        const rowData = tableData[payload.rowIndex] as ProductRow | undefined
        if (!rowData) {
          throw new Error('Row data not found')
        }

        const apiUrl = `/api/fms_products/products/${rowData.id}`
        const updatePayload = { [payload.prop]: payload.newValue }

        const response = await apiCall<{ error?: string }>(apiUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })

        if (response.ok) {
          flash('Product updated', 'success')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
          queryClient.invalidateQueries({ queryKey: ['fms_products'] })
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
    [tableData, queryClient]
  )

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: handleCellEditSave,

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        try {
          const response = await apiCall<{ id: string; error?: string }>(
            '/api/fms_products/products',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: payload.rowData.name || 'New Product',
                chargeCode: payload.rowData.chargeCode || null,
                chargeUnit: payload.rowData.chargeUnit || null,
                transportMode: payload.rowData.transportMode || null,
                isActive: payload.rowData.isActive !== false,
              }),
            }
          )

          if (response.ok && response.result) {
            flash('Product created', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...payload.rowData, id: response.result.id },
            })
            queryClient.invalidateQueries({ queryKey: ['fms_products'] })
          } else {
            const error = response.result?.error || 'Failed to create product'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error,
            } as NewRowSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create product'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
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
        const response = await apiCall('/api/perspectives/fms_products', {
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
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products'] })
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
          const response = await apiCall('/api/perspectives/fms_products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const url = payload.hardDelete
          ? `/api/perspectives/fms_products/${payload.id}?hardDelete=true`
          : `/api/perspectives/fms_products/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products'] })
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

  if (dataLoading && !data) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={5} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Products"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          stretchColumns={true}
          actionsRenderer={actionsRenderer}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          uiConfig={{
            enableFullscreen: true,
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
        <Dialog open={!!rowToDelete} onOpenChange={(open) => !open && setRowToDelete(null)}>
          <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); tableRef.current?.focus() }}>
            <DialogHeader>
              <DialogTitle>Delete Product</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{rowToDelete?.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRowToDelete(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
