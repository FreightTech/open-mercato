'use client'

import * as React from 'react'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Check } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import DynamicTable from '@open-mercato/ui/backend/dynamic-table/DynamicTable'
import { useEventHandlers, TableEvents } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, CellEditSaveEvent } from '@open-mercato/ui/backend/dynamic-table'

type ConvertTableContentProps = {
  tableData: TableRow[]
  columns: ColumnDef[]
  onCellEditSave: (event: CellEditSaveEvent) => void
}

/**
 * Internal component rendered inside the Dialog portal.
 * useEventHandlers runs in the same render cycle as DynamicTable,
 * ensuring the ref is available when the hook runs.
 */
function ConvertTableContent({
  tableData,
  columns,
  onCellEditSave,
}: ConvertTableContentProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  useEventHandlers({
    [TableEvents.CELL_EDIT_SAVE]: onCellEditSave,
  }, tableRef)

  return (
    <DynamicTable
      tableRef={tableRef}
      data={tableData}
      columns={columns}
      idColumnName="id"
      height={Math.min(400, 60 + tableData.length * 36)}
      stretchColumns
      uiConfig={{
        hideToolbar: true,
        hideBottomBar: true,
        hideActionsColumn: true,
        readOnlyStyle: 'normal',
      }}
    />
  )
}

type Location = {
  id: string
  name: string
  code?: string | null
  type?: string | null
}

type ConvertDialogLine = {
  id: string
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  containerType?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
  originLocationId: string | null
  destinationLocationId: string | null
}

type ConvertDialogData = {
  locations: Location[]
  lines: ConvertDialogLine[]
  defaultOriginLocationId: string | null
  defaultDestinationLocationId: string | null
}

type ConvertToProjectDialogProps = {
  offerId: string
  offerNumber: string
  clientName: string
  originPortCode?: string | null
  destinationPortCode?: string | null
  totalAmount: number
  currencyCode: string
  convertDialogData?: ConvertDialogData | null
  open: boolean
  onClose: () => void
}

type TableRow = {
  id: string
  selected: boolean
  chargeCode: string
  productName: string
  containerType: string
  quantity: string
  sellPrice: string
  currencyCode: string
}

function formatCurrency(value: number | string, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function ConvertToProjectDialog({
  offerId,
  offerNumber,
  clientName,
  convertDialogData,
  open,
  onClose,
}: ConvertToProjectDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isConverting, setIsConverting] = useState(false)

  // Table data state with selection and units
  const [tableData, setTableData] = useState<TableRow[]>([])
  // Note: No tableKey needed - DynamicTable's CellStore syncs automatically when data prop changes

  // Initialize table data when dialog opens
  useEffect(() => {
    if (open && convertDialogData?.lines) {
      setTableData(
        convertDialogData.lines.filter(l => l.isEnabled).map(line => ({
          id: line.id,
          selected: true,
          chargeCode: line.chargeCode || '-',
          productName: line.productName || '-',
          containerType: line.containerType || '',
          quantity: '1',
          sellPrice: line.sellPrice,
          currencyCode: line.currencyCode,
        }))
      )
    }
  }, [open, convertDialogData?.lines])

  // Selection helpers
  const selectedLineIds = useMemo(() => {
    return new Set(tableData.filter(row => row.selected).map(row => row.id))
  }, [tableData])

  const toggleAll = useCallback(() => {
    const allSelected = tableData.every(row => row.selected)
    setTableData(prev =>
      prev.map(row => ({ ...row, selected: !allSelected }))
    )
  }, [tableData])

  // Whether any line has a container type (to conditionally show column)
  const hasContainerType = useMemo(() => {
    return tableData.some(row => row.containerType !== '')
  }, [tableData])

  // Handle cell edit events from DynamicTable
  const handleCellEditSave = useCallback((event: CellEditSaveEvent) => {
    if (event.prop === 'quantity') {
      const newVal = String(event.newValue).replace(/[^0-9]/g, '') || '1'
      const parsed = Math.max(1, parseInt(newVal, 10))
      const rowId = event.rowData?.id ?? event.id
      setTableData(prev =>
        prev.map(row =>
          row.id === rowId ? { ...row, quantity: String(parsed) } : row
        )
      )
    }
  }, [])

  // Define columns for DynamicTable
  const columns: ColumnDef[] = useMemo(() => {
    const cols: ColumnDef[] = [
      {
        data: 'selected',
        title: '',
        width: 40,
        readOnly: false,
        renderer: (value: boolean) => (
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center ${
              value ? 'bg-primary border-primary' : 'border-input'
            }`}
          >
            {value && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        ),
        editor: (value, onChange, onSave, onCancel, rowData: TableRow) => {
          // Toggle immediately and save
          setTimeout(() => {
            setTableData(prev =>
              prev.map(row =>
                row.id === rowData.id ? { ...row, selected: !value } : row
              )
            )
            onSave()
          }, 0)
          return (
            <div className="flex items-center justify-center h-full">
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center ${
                  !value ? 'bg-primary border-primary' : 'border-input'
                }`}
              >
                {!value && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
            </div>
          )
        },
      },
      {
        data: 'chargeCode',
        title: 'Charge',
        width: 100,
        readOnly: true,
        renderer: (value: string) => (
          <span className="font-mono text-xs">{value}</span>
        ),
      },
      {
        data: 'productName',
        title: 'Product',
        width: 180,
        readOnly: true,
        renderer: (value: string) => (
          <span className="truncate max-w-[170px] block" title={value}>
            {value}
          </span>
        ),
      },
    ]

    if (hasContainerType) {
      cols.push({
        data: 'containerType',
        title: 'Container',
        width: 100,
        readOnly: true,
        renderer: (value: string) => (
          <span className="font-mono text-xs">{value || '—'}</span>
        ),
      })
    }

    cols.push(
      {
        data: 'quantity',
        title: 'Qty',
        width: 60,
        readOnly: false,
        renderer: (value: string) => (
          <span className="font-mono text-right block">{value}</span>
        ),
      },
      {
        data: 'sellPrice',
        title: 'Sell Price',
        width: 120,
        readOnly: true,
        renderer: (value: string, rowData: TableRow) => (
          <span className="font-mono text-right block">
            {formatCurrency(value, rowData.currencyCode)}
          </span>
        ),
      },
    )

    return cols
  }, [hasContainerType])

  const handleConvert = useCallback(async () => {
    const selectedRows = tableData.filter(row => row.selected)
    if (selectedRows.length === 0) {
      flash('Please select at least one line', 'error')
      return
    }

    setIsConverting(true)
    try {
      const selectedIds = selectedRows.map(row => row.id)
      const lineUnits: Record<string, number> = {}
      for (const row of selectedRows) {
        const qty = parseInt(row.quantity, 10)
        if (qty > 1) lineUnits[row.id] = qty
      }

      const response = await apiCall<{ ok: boolean; projectId: string; projectNumber: string }>(
        `/api/fms_offers/offers/${offerId}/convert-to-project`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineIds: selectedIds,
            ...(Object.keys(lineUnits).length > 0 ? { lineUnits } : {}),
          }),
        }
      )

      if (response.ok && response.result?.ok) {
        flash(`Project ${response.result.projectNumber} created successfully`, 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        queryClient.invalidateQueries({ queryKey: ['fms_offer', offerId] })
        onClose()
        router.push(`/backend/fms-projects/${response.result.projectId}`)
      } else {
        flash('Failed to convert offer to project', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsConverting(false)
    }
  }, [offerId, tableData, queryClient, onClose, router])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isConverting) {
      e.preventDefault()
      handleConvert()
    }
  }, [handleConvert, isConverting])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent style={{ width: '100%', maxWidth: 1000 }} onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-green-600" />
            Convert to Project
          </DialogTitle>
          <DialogDescription>
            Create a new project from offer &quot;{offerNumber}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Header with toggle and route badges */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Select Lines to Include</span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={toggleAll}
            >
              {tableData.every(row => row.selected) ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* Lines table using DynamicTable */}
          <div className="border rounded-lg overflow-hidden">
            <ConvertTableContent
              tableData={tableData}
              columns={columns}
              onCellEditSave={handleCellEditSave}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isConverting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConvert}
            disabled={isConverting || selectedLineIds.size === 0}
          >
            {isConverting ? 'Converting...' : 'Convert to Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
