'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
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
import { Trash2, Plus, Link2, AlertTriangle } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { cn } from '@open-mercato/shared/lib/utils'

export type ProjectLine = {
  id: string
  lineNumber: number
  sourceOfferLineId: string | null
  sourceType: 'offer' | 'manual'
  // Product references for traceability
  productId: string | null
  priceId: string | null
  // Product snapshot
  productName: string
  chargeCode: string | null
  chargeCategory: string | null
  chargeUnit: string | null
  containerSize: string | null
  containerType: string | null
  // Pricing
  quantity: string
  currencyCode: string
  soldUnitPrice: string
  soldAmount: string
  estimatedUnitCost: string | null
  estimatedCost: string | null
  actualUnitCost: string | null
  actualCost: string | null
  actualSellUnitPrice: string | null
  actualSellAmount: string | null
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
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
}

const CURRENCY_OPTIONS = ['USD', 'EUR', 'PLN', 'GBP']

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
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
}: ProjectLinesTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    lineId: string | null
    type: 'remove' | 'offer-warning' | null
  }>({ open: false, lineId: null, type: null })

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
      width: 180,
      type: 'text',
    },
    {
      data: 'containerSize',
      title: 'Type',
      width: 70,
      type: 'text',
    },
    {
      data: 'quantity',
      title: 'Qty',
      width: 50,
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
      data: 'estimatedUnitCost',
      title: 'Est. Cost',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'actualUnitCost',
      title: 'Actual Cost',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'soldUnitPrice',
      title: 'Est. Sell',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'actualSellUnitPrice',
      title: 'Actual Sell',
      width: 90,
      type: 'numeric',
    },
  ], [])

  // Calculate totals
  const totals = useMemo(() => {
    let totalEstCost = 0
    let totalActualCost = 0
    let totalEstSell = 0
    let totalActualSell = 0

    for (const line of lines) {
      totalEstCost += parseFloat(line.estimatedCost || '0') || 0
      totalActualCost += parseFloat(line.actualCost || '0') || 0
      totalEstSell += parseFloat(line.soldAmount) || 0
      totalActualSell += parseFloat(line.actualSellAmount || '0') || 0
    }

    return {
      totalEstCost,
      totalActualCost,
      totalEstSell,
      totalActualSell,
    }
  }, [lines])

  const tableData = useMemo(() => {
    return lines.map((line) => {
      // Compute display type from available fields
      const displayType = line.chargeCategory || line.containerType || line.containerSize || ''

      return {
        id: line.id,
        lineNumber: line.lineNumber,
        chargeCode: line.chargeCode || '',
        productName: line.productName || '',
        containerSize: displayType,
        quantity: line.quantity || '1',
        currencyCode: line.currencyCode || 'USD',
        estimatedUnitCost: line.estimatedUnitCost || '',
        actualUnitCost: line.actualUnitCost || '',
        soldUnitPrice: line.soldUnitPrice || '0',
        actualSellUnitPrice: line.actualSellUnitPrice || '',
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
    (lineId: string, sourceType: string) => {
      if (sourceType === 'offer') {
        setConfirmDialog({ open: true, lineId: null, type: 'offer-warning' })
        return
      }
      setConfirmDialog({ open: true, lineId, type: 'remove' })
    },
    []
  )

  const handleConfirmRemove = useCallback(async () => {
    if (confirmDialog.lineId) {
      await onRemoveLine(confirmDialog.lineId)
    }
    setConfirmDialog({ open: false, lineId: null, type: null })
  }, [confirmDialog.lineId, onRemoveLine])

  const handleCloseDialog = useCallback(() => {
    setConfirmDialog({ open: false, lineId: null, type: null })
  }, [])

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

  // Totals row component to be placed in top bar
  const totalsContent = lines.length > 0 ? (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Est. Cost:</span>
        <span className="font-mono font-medium">
          {currencyCode} {totals.totalEstCost.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Actual Cost:</span>
        <span className="font-mono font-medium">
          {currencyCode} {totals.totalActualCost.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Est. Sell:</span>
        <span className="font-mono font-medium">
          {currencyCode} {totals.totalEstSell.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Actual Sell:</span>
        <span className="font-mono font-medium">
          {currencyCode} {totals.totalActualSell.toFixed(2)}
        </span>
      </div>
    </div>
  ) : null

  // Combined top bar start with title and totals
  const topBarStartContent = (
    <div className="flex items-center gap-4">
      {titleContent}
      {totalsContent}
    </div>
  )

  return (
    <>
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
          autoSelectOnFocus={autoSelectOnFocus}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: true,
            hideToolbar: true,
            hideFilterPopover: true,
            hideSortButton: true,
            hideBottomBar: true,
            topBarStart: topBarStartContent,
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
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          {confirmDialog.type === 'remove' ? (
            <>
              <DialogHeader>
                <DialogTitle>Remove Line</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove this line from the project? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmRemove}>
                  Remove
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <DialogTitle>Cannot Remove</DialogTitle>
                </div>
                <DialogDescription>
                  Lines sourced from linked offers cannot be deleted. To remove this line, you need to unlink the offer first.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  OK
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
