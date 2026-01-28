'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus } from 'lucide-react'
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
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ProductWizardDrawer } from '../../components/ProductWizard'
import { isProductField, isVariantField, parseRowId } from '../../lib/fieldClassification'
import type { FlatTableColumnConfig } from '../../api/products/flat/table-config/route'

/**
 * Flat product-variant row structure.
 * Each row represents a variant with its parent product info.
 * Products without variants show as a single row with null variant fields.
 */
interface ProductVariantRow {
  // Row identifiers
  rowId: string
  productId: string
  variantId: string | null

  // Product fields
  name: string
  productType: string
  chargeCodeId: string | null
  chargeCodeCode: string | null
  chargeCodeName: string | null
  carrierId: string | null
  carrierName: string | null
  carrierCode: string | null
  loop: string | null
  sourceId: string | null
  sourceName: string | null
  destinationId: string | null
  destinationName: string | null
  locationId: string | null
  locationName: string | null
  transitTime: number | null
  description: string | null
  internalNotes: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null

  // Variant fields (null if product has no variants)
  validityStart: string | null
  validityEnd: string | null
  price: string | null
  currencyCode: string
  priceTypeId: string | null
  priceTypeName: string | null
  priceTypeCode: string | null
  providerId: string | null
  providerName: string | null
  reference: string | null
  containerSize: string | null
  variantIsActive: boolean | null
}

interface FlatTableConfigResponse {
  columns: FlatTableColumnConfig[]
  meta: {
    entity: string
    totalColumns: number
    productColumnCount: number
    variantColumnCount: number
    generatedAt: string
  }
}

const getProductTypeColor = (productType: string) => {
  const colors: Record<string, string> = {
    GFRT: 'bg-blue-100 text-blue-800',
    GTHC: 'bg-green-100 text-green-800',
    GBAF: 'bg-orange-100 text-orange-800',
    GBAF_PIECE: 'bg-orange-100 text-orange-800',
    GBOL: 'bg-purple-100 text-purple-800',
    GCUS: 'bg-yellow-100 text-yellow-800',
    CUSTOM: 'bg-gray-100 text-gray-800',
  }
  return colors[productType] || 'bg-gray-100 text-gray-800'
}

const getProductTypeLabel = (productType: string) => {
  const labels: Record<string, string> = {
    GFRT: 'Freight',
    GTHC: 'THC',
    GBAF: 'BAF',
    GBAF_PIECE: 'BAF Piece',
    GBOL: 'B/L',
    GCUS: 'Customs',
    CUSTOM: 'Custom',
  }
  return labels[productType] || productType
}

const ProductTypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span
      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getProductTypeColor(value)}`}
    >
      {getProductTypeLabel(value)}
    </span>
  )
}

const ChargeCodeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span className="font-mono text-sm font-medium">{value}</span>
}

const ProductNameRenderer = ({ value }: { value: string }) => {
  return <span className="font-medium">{value || '(unnamed)'}</span>
}

const RENDERERS: Record<string, (value: unknown, rowData: unknown) => React.ReactNode> = {
  ProductTypeRenderer: (value) => <ProductTypeRenderer value={value as string} />,
  ChargeCodeRenderer: (value) => <ChargeCodeRenderer value={value as string} />,
  ProductNameRenderer: (value) => <ProductNameRenderer value={value as string} />,
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

export default function ProductsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [rowToDelete, setRowToDelete] = useState<ProductVariantRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showProductWizard, setShowProductWizard] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Use the flat table config
  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['table-config', 'fms_products_flat'],
    queryFn: async () => {
      const response = await apiCall<FlatTableConfigResponse>(
        '/api/fms_products/products/flat/table-config'
      )
      if (!response.ok) {
        throw new Error('Failed to load table configuration')
      }
      return response.result
    },
    staleTime: 1000 * 60 * 5,
  })

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_products_flat'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>(
        '/api/perspectives/fms_products_flat'
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

  // Use the flat API endpoint
  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['fms_products_flat', queryParams],
    queryFn: async () => {
      const call = await apiCall<{
        items: ProductVariantRow[]
        total: number
        totalPages?: number
      }>(`/api/fms_products/products/flat?${queryParams}`)
      if (!call.ok) throw new Error('Failed to load products')
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
  }, [perspectivesData, columns, activePerspectiveId])

  const handleConfirmDelete = useCallback(async () => {
    if (!rowToDelete) return

    setIsDeleting(true)
    try {
      // Delete the product (this will cascade delete variants)
      const response = await apiCall<{ error?: string }>(
        `/api/fms_products/products/${rowToDelete.productId}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        flash('Product deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_products_flat'] })
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
    const row = _rowData as ProductVariantRow
    if (!row.productId) return null
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

  /**
   * Smart edit handler that routes updates to the correct API based on field type.
   * - Product fields -> /api/fms_products/products/{productId}
   * - Variant fields -> /api/fms_products/products/{productId}/variants/{variantId}
   */
  const handleCellEditSave = useCallback(
    async (payload: CellEditSaveEvent) => {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
      } as CellSaveStartEvent)

      try {
        // The row ID in flat view is the composite rowId, but we need productId/variantId
        const rowData = tableData[payload.rowIndex] as ProductVariantRow | undefined
        if (!rowData) {
          throw new Error('Row data not found')
        }

        const { productId, variantId } = parseRowId(rowData.rowId)
        const fieldName = payload.prop

        let apiUrl: string
        let updatePayload: Record<string, unknown>

        if (isProductField(fieldName)) {
          // Update product
          apiUrl = `/api/fms_products/products/${productId}`
          updatePayload = { [fieldName]: payload.newValue }
        } else if (isVariantField(fieldName)) {
          // Update variant
          if (!variantId) {
            // Product has no variants - cannot edit variant fields
            flash('Cannot edit variant fields for products without variants', 'warning')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error: 'No variant to update',
            } as CellSaveErrorEvent)
            return
          }
          apiUrl = `/api/fms_products/products/${productId}/variants/${variantId}`
          updatePayload = { [fieldName]: payload.newValue }
        } else {
          // Unknown field - fall back to product update
          apiUrl = `/api/fms_products/products/${productId}`
          updatePayload = { [fieldName]: payload.newValue }
        }

        const response = await apiCall<{ error?: string }>(apiUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })

        if (response.ok) {
          const entityType = isVariantField(fieldName) ? 'Variant' : 'Product'
          flash(`${entityType} updated`, 'success')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
          // Invalidate to refresh any related rows
          queryClient.invalidateQueries({ queryKey: ['fms_products_flat'] })
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
        // For products, use the drawer instead of inline creation
        flash('Please use the "Add Product" button to create products', 'info')
        dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
          rowIndex: payload.rowIndex,
          error: 'Use the Add Product button',
        } as NewRowSaveErrorEvent)
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
        const response = await apiCall('/api/perspectives/fms_products_flat', {
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
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products_flat'] })
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
          const response = await apiCall('/api/perspectives/fms_products_flat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products_flat'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const url = payload.hardDelete
          ? `/api/perspectives/fms_products_flat/${payload.id}?hardDelete=true`
          : `/api/perspectives/fms_products_flat/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_products_flat'] })
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
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={12} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Products"
          idColumnName="rowId"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          actionsRenderer={actionsRenderer}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
            topBarEnd: (
              <Button size="sm" onClick={() => setShowProductWizard(true)} className="h-7">
                <Plus className="h-4 w-4 mr-1" />
                Add Product
              </Button>
            ),
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
        <Dialog open={!!rowToDelete} onOpenChange={(open) => !open && setRowToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Product</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{rowToDelete?.name}&quot;? This will also
                delete all variants. This action cannot be undone.
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

        <ProductWizardDrawer
          open={showProductWizard}
          onClose={() => setShowProductWizard(false)}
          onProductCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['fms_products_flat'] })
          }}
        />
      </PageBody>
    </Page>
  )
}
