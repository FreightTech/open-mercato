'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
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
import { Trash2, Plus, Link2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { cn } from '@open-mercato/shared/lib/utils'

export type ProjectLine = {
  id: string
  lineNumber: number
  sourceOfferLineId: string | null
  sourceType: 'offer' | 'manual'
  productName: string
  chargeCode: string | null
  containerSize: string | null
  quantity: string
  currencyCode: string
  soldUnitPrice: string
  soldAmount: string
  actualUnitCost: string | null
  actualCost: string | null
  notes: string | null
}

type ProjectLinesTableProps = {
  lines: ProjectLine[]
  isLoading: boolean
  onLineUpdate: (lineId: string, field: string, value: unknown) => Promise<void>
  onRemoveLine: (lineId: string) => Promise<void>
  currencyCode: string
  titleContent?: React.ReactNode
  buttonsContent?: React.ReactNode
  expanded?: boolean
  showEmptyState?: boolean
  onShowLinkOffer?: () => void
  onShowAddProduct?: () => void
}

const CURRENCY_OPTIONS = ['USD', 'EUR', 'PLN', 'GBP']

// Custom renderer for variance column
function VarianceCell({ soldAmount, actualCost }: { soldAmount: string; actualCost: string | null }) {
  if (!actualCost) {
    return <span className="text-muted-foreground">-</span>
  }

  const sold = parseFloat(soldAmount) || 0
  const actual = parseFloat(actualCost) || 0
  const variance = sold - actual
  const isPositive = variance >= 0

  return (
    <span className={cn(
      'font-medium',
      isPositive ? 'text-green-600' : 'text-red-600'
    )}>
      {isPositive ? '+' : ''}{variance.toFixed(2)}
    </span>
  )
}

export function ProjectLinesTable({
  lines,
  isLoading,
  onLineUpdate,
  onRemoveLine,
  currencyCode,
  titleContent,
  buttonsContent,
  expanded = true,
  showEmptyState = false,
  onShowLinkOffer,
  onShowAddProduct,
}: ProjectLinesTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

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
      width: 80,
      type: 'text',
    },
    {
      data: 'productName',
      title: 'Product/Service',
      width: 200,
      type: 'text',
    },
    {
      data: 'containerSize',
      title: 'Type',
      width: 80,
      type: 'text',
    },
    {
      data: 'quantity',
      title: 'Qty',
      width: 60,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: 'Ccy',
      width: 50,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
      readOnly: true,
    },
    {
      data: 'soldUnitPrice',
      title: 'Sold Price',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'soldAmount',
      title: 'Sold Total',
      width: 100,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'actualUnitCost',
      title: 'Actual Cost',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'actualCost',
      title: 'Actual Total',
      width: 100,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'variance',
      title: 'Variance',
      width: 90,
      readOnly: true,
      renderer: (_value: unknown, rowData: Record<string, unknown>) => {
        return (
          <VarianceCell
            soldAmount={rowData.soldAmount as string}
            actualCost={rowData.actualCost as string | null}
          />
        )
      },
    },
  ], [])

  // Calculate totals
  const totals = useMemo(() => {
    let totalSold = 0
    let totalActualCost = 0
    let hasActualCosts = false

    for (const line of lines) {
      totalSold += parseFloat(line.soldAmount) || 0
      if (line.actualCost) {
        totalActualCost += parseFloat(line.actualCost) || 0
        hasActualCosts = true
      }
    }

    const variance = hasActualCosts ? totalSold - totalActualCost : null

    return {
      totalSold,
      totalActualCost: hasActualCosts ? totalActualCost : null,
      variance,
    }
  }, [lines])

  const tableData = useMemo(() => {
    return lines.map((line) => {
      const soldAmount = parseFloat(line.soldAmount) || 0
      const actualCost = line.actualCost ? parseFloat(line.actualCost) || 0 : null

      return {
        id: line.id,
        lineNumber: line.lineNumber,
        chargeCode: line.chargeCode || '',
        productName: line.productName || '',
        containerSize: line.containerSize || '',
        quantity: line.quantity || '1',
        currencyCode: line.currencyCode || 'USD',
        soldUnitPrice: line.soldUnitPrice || '0',
        soldAmount: soldAmount.toFixed(2),
        actualUnitCost: line.actualUnitCost || '',
        actualCost: actualCost !== null ? actualCost.toFixed(2) : '',
        variance: actualCost !== null ? (soldAmount - actualCost).toFixed(2) : '',
        sourceType: line.sourceType,
        sourceOfferLineId: line.sourceOfferLineId,
      }
    })
  }, [lines])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          await onLineUpdate(payload.id as string, payload.prop, payload.newValue)

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
    async (lineId: string, sourceType: string) => {
      if (sourceType === 'offer') {
        alert('Cannot delete lines sourced from offers')
        return
      }
      if (confirm('Remove this line from the project?')) {
        await onRemoveLine(lineId)
      }
    },
    [onRemoveLine]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={11} />
  }

  // Show just the header when collapsed
  if (!expanded) {
    return (
      <div className="flex items-center justify-between px-4 py-3">
        {titleContent}
        {buttonsContent}
      </div>
    )
  }

  // Show empty state when no lines
  if (showEmptyState) {
    return (
      <div>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          {titleContent}
          {buttonsContent}
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Link an offer or add products to track costs
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={onShowLinkOffer}>
              <Link2 className="h-4 w-4 mr-1" />
              Link Offer
            </Button>
            <Button size="sm" variant="outline" onClick={onShowAddProduct}>
              <Plus className="h-4 w-4 mr-1" />
              Add Product
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true,
          toolbarPosition: 'bottom',
          hideFilterPopover: true,
          hideSortButton: true,
          topBarStart: titleContent,
          topBarEnd: buttonsContent,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemoveLine(rowData.id as string, rowData.sourceType as string)}
            className={cn(
              'p-1 transition-colors',
              rowData.sourceType === 'offer'
                ? 'text-muted-foreground/30 cursor-not-allowed'
                : 'text-muted-foreground hover:text-red-600'
            )}
            title={rowData.sourceType === 'offer' ? 'Cannot delete offer lines' : 'Remove line'}
            disabled={rowData.sourceType === 'offer'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />

      {/* Totals row */}
      {lines.length > 0 && (
        <div className="flex items-center justify-end gap-4 px-4 py-2 border-t bg-muted/30 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sold Total:</span>
            <span className="font-mono font-medium">
              {currencyCode} {totals.totalSold.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Actual Total:</span>
            <span className="font-mono font-medium">
              {totals.totalActualCost !== null
                ? `${currencyCode} ${totals.totalActualCost.toFixed(2)}`
                : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Variance:</span>
            <span
              className={cn(
                'font-mono font-medium',
                totals.variance === null
                  ? 'text-muted-foreground'
                  : totals.variance >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              )}
            >
              {totals.variance !== null
                ? `${totals.variance >= 0 ? '+' : ''}${currencyCode} ${totals.variance.toFixed(2)}`
                : '-'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
