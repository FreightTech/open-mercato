'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { ArrowLeft, Plus } from 'lucide-react'
import DynamicTable from '@open-mercato/ui/backend/dynamic-table/DynamicTable'
import { useEventHandlers } from '@open-mercato/ui/backend/dynamic-table/events/events'
import type { ColumnDef, TableUIConfig, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table/types/index'
import { TableEvents } from '@open-mercato/ui/backend/dynamic-table/types/index'
import type { ProductSearchResult } from './types/quote-wizard'

type ProductSearchResponse = {
  items: ProductSearchResult[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type ProductSearchPanelProps = {
  onSelect: (product: ProductSearchResult) => void
  onClose: () => void
  defaultContainerSize?: string
  showDoneButton?: boolean
}

function formatCurrency(value: string | null, currency: string | null): string {
  if (!value || !currency) return '-'
  const num = parseFloat(value) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ProductSearchPanel({
  onSelect,
  onClose,
  defaultContainerSize,
  showDoneButton = false,
}: ProductSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const tableRef = useRef<HTMLDivElement>(null)

  // Debounce search query
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-search', debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)
      params.set('limit', '50')
      // Only show variants (products with prices), not parent products
      params.set('variantsOnly', 'true')

      const response = await apiCall<ProductSearchResponse>(
        `/api/fms_products/search?${params.toString()}`
      )
      if (!response.ok) throw new Error('Failed to search products')
      return response.result ?? { items: [], total: 0, page: 1, limit: 50, totalPages: 0 }
    },
  })

  // Transform API response to include `id` field for DynamicTable
  const tableData = useMemo(() => {
    return (data?.items ?? []).map((item, idx) => ({
      ...item,
      id: item.variantId || `${item.productId}-${idx}`,
    }))
  }, [data?.items])

  // Handle search events from DynamicTable's SearchBar
  useEventHandlers({
    [TableEvents.SEARCH]: (payload: { query: string }) => {
      setSearchQuery(payload.query)
    },
  }, tableRef)

  // Handle row action (Enter key)
  const handleRowAction = useCallback((actionId: string, rowData: any, rowIndex: number) => {
    if (actionId === 'add') {
      onSelect(rowData as ProductSearchResult)
    }
  }, [onSelect])

  // Handle row click (click anywhere on the row)
  const handleRowClick = useCallback((rowIndex: number, rowData: any, event: React.MouseEvent) => {
    onSelect(rowData as ProductSearchResult)
  }, [onSelect])

  // Actions renderer for the + button in each row
  const actionsRenderer = useCallback((rowData: any) => {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSelect(rowData as ProductSearchResult)
        }}
        className="p-1 text-muted-foreground hover:text-primary transition-colors"
        title="Add to quote"
      >
        <Plus className="h-4 w-4" />
      </button>
    )
  }, [onSelect])

  // Column definitions with custom renderers
  // readOnly: true prevents editing, readOnlyStyle: 'normal' in uiConfig removes gray background
  // Order: charge code, size, product, origin, destination, provider, price, valid until
  const columns: ColumnDef[] = useMemo(() => [
    {
      data: 'chargeCode',
      title: 'Charge',
      width: 110,
      readOnly: true,
      renderer: (value: string) => (
        <Badge variant="outline" className="font-mono text-xs">
          {value}
        </Badge>
      ),
    },
    {
      data: 'containerSize',
      title: 'Size',
      width: 80,
      readOnly: true,
      renderer: (value: string | null) =>
        value ? (
          <Badge variant="secondary" className="text-xs">
            {value}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      data: 'productName',
      title: 'Product',
      width: 280,
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-medium truncate" title={value}>
          {value}
        </span>
      ),
    },
    {
      data: 'source',
      title: 'Origin',
      width: 140,
      readOnly: true,
      renderer: (value: string | null) => (
        <span className="truncate">{value || '-'}</span>
      ),
    },
    {
      data: 'destination',
      title: 'Destination',
      width: 140,
      readOnly: true,
      renderer: (value: string | null) => (
        <span className="truncate">{value || '-'}</span>
      ),
    },
    {
      data: 'providerName',
      title: 'Provider',
      width: 140,
      readOnly: true,
      renderer: (value: string | null) => (
        <span className="truncate text-muted-foreground">{value || '-'}</span>
      ),
    },
    {
      data: 'price',
      title: 'Price',
      width: 110,
      readOnly: true,
      renderer: (value: string | null, rowData: any) => (
        <span className="font-mono">
          {formatCurrency(value, rowData.currencyCode)}
        </span>
      ),
    },
    {
      data: 'validityEnd',
      title: 'Valid Until',
      width: 120,
      readOnly: true,
      renderer: (value: string | null) => (
        <span>{formatDate(value)}</span>
      ),
    },
  ], [])

  // Keyboard shortcuts config
  const keyboardShortcuts: KeyboardShortcutsConfig = useMemo(() => ({
    rowActions: [
      { id: 'add', label: 'Add to quote', key: 'Enter' },
    ],
  }), [])

  // UI config to hide unnecessary controls
  const uiConfig: TableUIConfig = useMemo(() => ({
    hideFilterButton: true,
    hideSortButton: true,
    hideColumnsButton: true,
    hideAddRowButton: true,
    hideBottomBar: true,
    hideTitle: true,
    enableFullscreen: false,
    // Use 'normal' style for read-only cells (no gray background) since this is a selection table
    readOnlyStyle: 'normal',
    // Use default hover style (light blue) for row highlighting
    rowHoverStyle: 'default',
    topBarEnd: showDoneButton ? (
      <Button variant="default" size="sm" onClick={onClose}>
        Done Adding
      </Button>
    ) : null,
  }), [showDoneButton, onClose])

  // Determine empty message
  const emptyMessage = useMemo(() => {
    if (isLoading) return undefined
    if (error) return 'Failed to load products'
    if (debouncedQuery && tableData.length === 0) return 'No products found'
    if (!debouncedQuery) return 'Enter a search term to find products'
    return undefined
  }, [isLoading, error, debouncedQuery, tableData.length])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h2 className="text-sm font-medium">Add Product</h2>
        </div>
        {showDoneButton && (
          <Button variant="default" size="sm" onClick={onClose}>
            Done Adding
          </Button>
        )}
      </div>

      {/* DynamicTable */}
      <div className="flex-1 min-h-0">
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          height="100%"
          tableName="Products"
          emptyMessage={emptyMessage}
          uiConfig={uiConfig}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          onRowClick={handleRowClick}
          actionsRenderer={actionsRenderer}
          autoSelectOnFocus
          stretchColumns
        />
      </div>

      {/* Footer */}
      <div className="mt-3 text-xs text-muted-foreground">
        {data?.total ? `${data.total} products found` : ''}
      </div>
    </div>
  )
}
