'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Plus, Trash2, PenLine, Check } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import type { QuoteLine } from './hooks/useCalculations'

type QuoteWizardLinesTableProps = {
  lines: QuoteLine[]
  isLoading: boolean
  onLineUpdate: (lineId: string, field: string, value: unknown) => void
  onRemoveLine: (lineId: string) => void
  onAddProduct: () => void
  onAddCustom: () => void
}

// Format currency display
function formatCurrency(value: string | number, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

type VariantPrice = {
  id: string
  price: string
  currencyCode: string
  contractType: string
  contractNumber?: string | null
}

type ProductVariant = {
  id: string
  variantType: string
  name: string | null
  providerName: string | null
  containerSize: string | null
  containerType: string | null
  isDefault: boolean
  isActive: boolean
  prices: VariantPrice[]
}

type ProductVariantsResponse = {
  product: {
    id: string
    name: string
    productType: string
    chargeCode: string | null
    serviceProviderName: string | null
  }
  variants: ProductVariant[]
}

// Product detail dialog content with variants table
function ProductDetailContent({
  line,
  onSelectVariant,
}: {
  line: QuoteLine
  onSelectVariant?: (variantId: string, priceId: string, price: string, currency: string) => void
}) {
  const variantTableRef = useRef<HTMLDivElement>(null)

  // Fetch product variants if we have a productId
  const { data: variantsData, isLoading: isLoadingVariants } = useQuery({
    queryKey: ['product-variants', line.productId],
    queryFn: async () => {
      if (!line.productId) return null
      const response = await apiCall<ProductVariantsResponse>(
        `/api/fms_products/products/${line.productId}/variants`
      )
      return response.ok ? response.result : null
    },
    enabled: !!line.productId,
  })

  // Build table data with current variant first, then other variants
  const variantTableData = useMemo(() => {
    if (!variantsData?.variants) return []

    const rows: Array<{
      id: string
      isCurrentVariant: boolean
      variantName: string
      containerSize: string
      provider: string
      contractType: string
      price: string
      currency: string
      priceId: string
    }> = []

    // First, add the current variant (from line data)
    if (line.variantId) {
      rows.push({
        id: line.variantId,
        isCurrentVariant: true,
        variantName: line.productName,
        containerSize: line.containerSize || '-',
        provider: line.providerName || '-',
        contractType: line.contractType || '-',
        price: line.unitCost,
        currency: line.currencyCode,
        priceId: line.priceId || '',
      })
    }

    // Then add other variants from the product
    variantsData.variants.forEach((variant) => {
      // Skip if this is the current variant
      if (variant.id === line.variantId) return

      // Add a row for each price of this variant
      if (variant.prices.length > 0) {
        variant.prices.forEach((price) => {
          rows.push({
            id: `${variant.id}-${price.id}`,
            isCurrentVariant: false,
            variantName: variant.name || variantsData.product.name,
            containerSize: variant.containerSize || '-',
            provider: variant.providerName || '-',
            contractType: price.contractType || '-',
            price: price.price,
            currency: price.currencyCode,
            priceId: price.id,
          })
        })
      } else {
        // Variant without prices
        rows.push({
          id: variant.id,
          isCurrentVariant: false,
          variantName: variant.name || variantsData.product.name,
          containerSize: variant.containerSize || '-',
          provider: variant.providerName || '-',
          contractType: '-',
          price: '-',
          currency: '-',
          priceId: '',
        })
      }
    })

    return rows
  }, [variantsData, line])

  const variantColumns = useMemo((): ColumnDef[] => [
    {
      data: 'isCurrentVariant',
      title: '',
      width: 30,
      readOnly: true,
      renderer: (value: boolean) => value ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : null,
    },
    {
      data: 'containerSize',
      title: 'Container',
      width: 80,
      readOnly: true,
    },
    {
      data: 'provider',
      title: 'Provider',
      width: 120,
      readOnly: true,
    },
    {
      data: 'contractType',
      title: 'Contract',
      width: 70,
      readOnly: true,
      renderer: (value: string) => <span className="uppercase">{value}</span>,
    },
    {
      data: 'price',
      title: 'Price',
      width: 90,
      readOnly: true,
      renderer: (value: string, rowData: { currency: string }) => {
        if (value === '-') return '-'
        const num = parseFloat(value)
        if (isNaN(num)) return value
        return formatCurrency(num, rowData.currency)
      },
    },
  ], [])

  const quantity = parseFloat(line.quantity) || 0
  const unitCost = parseFloat(line.unitCost) || 0
  const unitSales = parseFloat(line.unitSales) || 0
  const totalCost = quantity * unitCost
  const totalSales = quantity * unitSales
  const profit = totalSales - totalCost

  return (
    <div className="space-y-4 text-sm">
      {/* Product Info Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
        <span>Type: <span className="font-medium text-foreground">{line.productType || '-'}</span></span>
        <span>Code: <span className="font-medium text-foreground">{line.chargeCode || '-'}</span></span>
      </div>

      {/* Variants Table */}
      {line.productId && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Variants & Pricing
          </h4>
          {isLoadingVariants ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5" />
            </div>
          ) : variantTableData.length > 0 ? (
            <div style={{ height: Math.min(variantTableData.length * 35 + 50, 200) }}>
              <DynamicTable
                tableRef={variantTableRef}
                data={variantTableData}
                columns={variantColumns}
                tableName="Product Variants"
                idColumnName="id"
                width="100%"
                height="100%"
                colHeaders={true}
                rowHeaders={false}
                stretchColumns={true}
                uiConfig={{
                  hideSearch: true,
                  hideFilterButton: true,
                  hideAddRowButton: true,
                  hideBottomBar: true,
                  hideTopBar: true,
                }}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-xs py-2">No variants available</p>
          )}
        </div>
      )}

      {/* Totals Summary */}
      <div className="bg-muted/30 rounded p-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Current Line Totals</h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="font-medium">{formatCurrency(totalCost, line.currencyCode)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sales</div>
            <div className="font-medium">{formatCurrency(totalSales, line.currencyCode)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Profit</div>
            <div className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(profit, line.currencyCode)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function QuoteWizardLinesTable({
  lines,
  isLoading,
  onLineUpdate,
  onRemoveLine,
  onAddProduct,
  onAddCustom,
}: QuoteWizardLinesTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)

  // Find the selected line for the popover
  const selectedLine = useMemo(() => {
    if (!selectedLineId) return null
    return lines.find(l => l.id === selectedLineId) || null
  }, [selectedLineId, lines])

  // Product name renderer with clickable link
  const productNameRenderer = useCallback((value: string, rowData: { id: string }) => {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setSelectedLineId(rowData.id)
        }}
        className="text-left text-blue-600 hover:text-blue-800 hover:underline truncate max-w-full"
        title={value}
      >
        {value}
      </button>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'lineNumber',
      title: '#',
      width: 40,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'chargeCode',
      title: 'Code',
      width: 60,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'productName',
      title: 'Product',
      width: 180,
      type: 'text',
      readOnly: true,
      renderer: productNameRenderer,
    },
    {
      data: 'quantity',
      title: 'Qty',
      width: 50,
      type: 'numeric',
    },
    {
      data: 'unitCost',
      title: 'Buy',
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'marginPercent',
      title: 'Margin',
      width: 70,
      type: 'numeric',
      renderer: (value: number) => <span>{value}%</span>,
    },
    {
      data: 'unitSales',
      title: 'Sell',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: 'Ccy',
      width: 50,
      type: 'text',
      readOnly: true,
    },
  ], [productNameRenderer])

  const tableData = useMemo(() => {
    return lines.map((line, index) => ({
      id: line.id,
      lineNumber: index + 1,
      chargeCode: line.chargeCode || '',
      productName: line.productName,
      productType: line.productType || '',
      providerName: line.providerName || '',
      containerSize: line.containerSize || '',
      contractType: line.contractType || '',
      quantity: line.quantity,
      unitCost: line.unitCost,
      marginPercent: line.marginPercent,
      unitSales: line.unitSales,
      currencyCode: line.currencyCode,
    }))
  }, [lines])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onLineUpdate(payload.id as string, payload.prop, payload.newValue)

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleRemoveLine = useCallback(
    (lineId: string) => {
      if (confirm('Remove this line from the quote?')) {
        onRemoveLine(lineId)
      }
    },
    [onRemoveLine]
  )

  if (isLoading) {
    return <TableSkeleton rows={5} columns={10} />
  }

  // Calculate a reasonable table height based on line count
  const tableHeight = Math.min(Math.max(lines.length * 40 + 100, 200), 400)

  // Toolbar buttons
  const toolbarButtons = (
    <div className="flex items-center gap-2">
      <Button onClick={onAddProduct} size="sm" variant="outline">
        <Plus className="h-4 w-4 mr-1" />
        Add Product
      </Button>
      <Button onClick={onAddCustom} size="sm" variant="outline">
        <PenLine className="h-4 w-4 mr-1" />
        Add Custom
      </Button>
    </div>
  )

  return (
    <>
      <div style={{ height: tableHeight }}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Quote Lines"
          idColumnName="id"
          width="100%"
          height="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          uiConfig={{
            hideSearch: true,
            hideFilterButton: true,
            hideAddRowButton: true,
            hideBottomBar: true,
            enableFullscreen: true,
            topBarEnd: toolbarButtons,
          }}
          actionsRenderer={(rowData: Record<string, unknown>) => (
            <button
              onClick={() => handleRemoveLine(rowData.id as string)}
              className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
              title="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        />
      </div>

      {/* Product detail dialog */}
      <Dialog open={!!selectedLine} onOpenChange={(open) => !open && setSelectedLineId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedLine?.productName}</DialogTitle>
          </DialogHeader>
          {selectedLine && <ProductDetailContent line={selectedLine} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
