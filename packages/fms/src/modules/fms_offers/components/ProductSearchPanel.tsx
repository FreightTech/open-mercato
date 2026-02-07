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

export type ProductSearchResult = {
  productId: string
  productName: string
  chargeCode: string
  chargeCodeName: string
  chargeUnit?: string | null
}

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
  showDoneButton?: boolean
}

export function ProductSearchPanel({
  onSelect,
  onClose,
  showDoneButton = false,
}: ProductSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const tableRef = useRef<HTMLDivElement>(null)

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

      const response = await apiCall<ProductSearchResponse>(
        `/api/fms_products/search?${params.toString()}`
      )
      if (!response.ok) throw new Error('Failed to search products')
      return response.result ?? { items: [], total: 0, page: 1, limit: 50, totalPages: 0 }
    },
  })

  const tableData = useMemo(() => {
    return (data?.items ?? []).map((item, idx) => ({
      ...item,
      id: `${item.productId}-${idx}`,
    }))
  }, [data?.items])

  useEventHandlers({
    [TableEvents.SEARCH]: (payload: { query: string }) => {
      setSearchQuery(payload.query)
    },
  }, tableRef)

  const handleRowAction = useCallback((actionId: string, rowData: any, rowIndex: number) => {
    if (actionId === 'add') {
      onSelect(rowData as ProductSearchResult)
    }
  }, [onSelect])

  const handleRowClick = useCallback((rowIndex: number, rowData: any, event: React.MouseEvent) => {
    onSelect(rowData as ProductSearchResult)
  }, [onSelect])

  const actionsRenderer = useCallback((rowData: any) => {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSelect(rowData as ProductSearchResult)
        }}
        className="p-1 text-muted-foreground hover:text-primary transition-colors"
        title="Add product"
      >
        <Plus className="h-4 w-4" />
      </button>
    )
  }, [onSelect])

  const columns: ColumnDef[] = useMemo(() => [
    {
      data: 'chargeCode',
      title: 'Charge Code',
      width: 130,
      readOnly: true,
      renderer: (value: string) => (
        <Badge variant="outline" className="font-mono text-xs">
          {value}
        </Badge>
      ),
    },
    {
      data: 'productName',
      title: 'Product',
      width: 300,
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-medium truncate" title={value}>
          {value}
        </span>
      ),
    },
    {
      data: 'chargeCodeName',
      title: 'Description',
      width: 200,
      readOnly: true,
      renderer: (value: string | null) => (
        <span className="text-muted-foreground truncate">{value || '-'}</span>
      ),
    },
    {
      data: 'chargeUnit',
      title: 'Unit',
      width: 100,
      readOnly: true,
      renderer: (value: string | null) => (
        <span className="text-muted-foreground">{value || '-'}</span>
      ),
    },
  ], [])

  const keyboardShortcuts: KeyboardShortcutsConfig = useMemo(() => ({
    rowActions: [
      { id: 'add', label: 'Add product', key: 'Enter' },
    ],
  }), [])

  const uiConfig: TableUIConfig = useMemo(() => ({
    hideFilterButton: true,
    hideSortButton: true,
    hideColumnsButton: true,
    hideAddRowButton: true,
    hideBottomBar: true,
    hideTitle: true,
    enableFullscreen: false,
    readOnlyStyle: 'normal',
    rowHoverStyle: 'default',
    topBarEnd: showDoneButton ? (
      <Button variant="default" size="sm" onClick={onClose}>
        Done Adding
      </Button>
    ) : null,
  }), [showDoneButton, onClose])

  const emptyMessage = useMemo(() => {
    if (isLoading) return undefined
    if (error) return 'Failed to load products'
    if (debouncedQuery && tableData.length === 0) return 'No products found'
    if (!debouncedQuery) return 'Enter a search term to find products'
    return undefined
  }, [isLoading, error, debouncedQuery, tableData.length])

  return (
    <div className="flex flex-col h-full">
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

      <div className="mt-3 text-xs text-muted-foreground">
        {data?.total ? `${data.total} products found` : ''}
      </div>
    </div>
  )
}
