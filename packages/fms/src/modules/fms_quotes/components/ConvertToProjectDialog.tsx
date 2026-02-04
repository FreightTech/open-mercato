'use client'

import * as React from 'react'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Package, Check } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
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
        readOnlyStyle: 'muted',
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
  containerSize: string | null
  chargeUnit: 'container' | 'file' | 'weight_measure' | 'cargo_value_percent' | null
  unitPrice: string
  amount: string
  currencyCode: string
  origin: string | null
  originLocationId: string | null
  destination: string | null
  destinationLocationId: string | null
}

type ConvertDialogData = {
  locations: Location[]
  lines: ConvertDialogLine[]
  quoteLineLocations: Array<{
    quoteLineId: string
    originLocationId: string | null
    originLocation: Location | null
    destinationLocationId: string | null
    destinationLocation: Location | null
  }>
  defaultOriginLocationId: string | null
  defaultDestinationLocationId: string | null
}

type Route = {
  key: string
  origin: string
  destination: string
  lineIds: string[]
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
  containerSize: string
  chargeCode: string
  productName: string
  origin: string
  destination: string
  amount: string
  currencyCode: string
  units: number
  chargeUnit: string | null
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
        convertDialogData.lines.map(line => ({
          id: line.id,
          selected: true, // Select all by default
          containerSize: line.containerSize || '-',
          chargeCode: line.chargeCode || '-',
          productName: line.productName || '-',
          origin: line.origin || '-',
          destination: line.destination || '-',
          amount: line.amount,
          currencyCode: line.currencyCode,
          units: 1, // Default to 1 unit
          chargeUnit: line.chargeUnit,
        }))
      )
    }
  }, [open, convertDialogData?.lines])

  // Extract unique routes from table data
  const routes = useMemo((): Route[] => {
    const routeMap = new Map<string, Route>()
    for (const row of tableData) {
      // Only include routes that have at least origin or destination
      if (row.origin === '-' && row.destination === '-') continue

      const origin = row.origin
      const destination = row.destination
      const key = `${origin}::${destination}`
      if (routeMap.has(key)) {
        routeMap.get(key)!.lineIds.push(row.id)
      } else {
        routeMap.set(key, { key, origin, destination, lineIds: [row.id] })
      }
    }
    return Array.from(routeMap.values())
  }, [tableData])

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

  const isRouteSelected = useCallback((route: Route): boolean => {
    return route.lineIds.every(id => selectedLineIds.has(id))
  }, [selectedLineIds])

  const toggleRoute = useCallback((route: Route) => {
    const allSelected = route.lineIds.every(id => selectedLineIds.has(id))
    setTableData(prev =>
      prev.map(row =>
        route.lineIds.includes(row.id)
          ? { ...row, selected: !allSelected }
          : row
      )
    )
  }, [selectedLineIds])

  // Calculate total containers from selected lines with chargeUnit='container'
  const totalContainersToCreate = useMemo(() => {
    return tableData
      .filter(row => row.selected && row.chargeUnit === 'container')
      .reduce((sum, row) => sum + row.units, 0)
  }, [tableData])

  // Handle cell edit events from DynamicTable for units column
  // (checkbox has custom editor that updates state directly)
  const handleCellEditSave = useCallback((event: CellEditSaveEvent) => {
    if (event.prop === 'units' && event.rowData?.id) {
      const newUnits = parseInt(String(event.newValue), 10) || 0
      setTableData(prev =>
        prev.map(row =>
          row.id === event.rowData.id ? { ...row, units: Math.max(0, newUnits) } : row
        )
      )
    }
  }, [])

  // Define columns for DynamicTable
  const columns: ColumnDef[] = useMemo(() => [
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
      data: 'containerSize',
      title: 'Size',
      width: 60,
      readOnly: true,
    },
    {
      data: 'chargeCode',
      title: 'Charge',
      width: 80,
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
    {
      data: 'origin',
      title: 'Origin',
      width: 120,
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate max-w-[110px] block" title={value}>
          {value}
        </span>
      ),
    },
    {
      data: 'destination',
      title: 'Dest',
      width: 120,
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate max-w-[110px] block" title={value}>
          {value}
        </span>
      ),
    },
    {
      data: 'amount',
      title: 'Amount',
      width: 100,
      readOnly: true,
      renderer: (value: string, rowData: TableRow) => (
        <span className="font-mono text-right block">
          {formatCurrency(value, rowData.currencyCode)}
        </span>
      ),
    },
    {
      data: 'units',
      title: 'Units',
      width: 70,
      type: 'text',
      readOnly: false,
      renderer: (value: number) => (
        <span className="text-right block">{Math.floor(value)}</span>
      ),
    },
    {
      data: 'chargeUnit',
      title: '',
      width: 40,
      readOnly: true,
      renderer: (value: string | null, rowData: TableRow) => {
        const createsContainer = value === 'container' && rowData.containerSize !== '-'
        return createsContainer ? (
          <span title="Creates container">
            <Package className="h-4 w-4 text-blue-500" />
          </span>
        ) : null
      },
    },
  ], [])

  const handleConvert = useCallback(async () => {
    const selectedRows = tableData.filter(row => row.selected)
    if (selectedRows.length === 0) {
      flash('Please select at least one line', 'error')
      return
    }

    setIsConverting(true)
    try {
      // Build lineIds and lineUnits map
      const selectedLineIds = selectedRows.map(row => row.id)

      // Build lineUnits map for container creation
      const lineUnits: Record<string, number> = {}
      for (const row of selectedRows) {
        if (row.units > 0) {
          lineUnits[row.id] = row.units
        }
      }

      const response = await apiCall<{ ok: boolean; projectId: string; projectNumber: string }>(
        `/api/fms_quotes/offers/${offerId}/convert-to-project`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineIds: selectedLineIds,
            lineUnits,
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

          {/* Route filter pills - show when routes exist */}
          {routes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {routes.map((route) => {
                const selected = isRouteSelected(route)
                return (
                  <Badge
                    key={route.key}
                    variant={selected ? 'default' : 'outline'}
                    className={`cursor-pointer transition-colors ${
                      selected
                        ? 'bg-primary hover:bg-primary/80'
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                    onClick={() => toggleRoute(route)}
                  >
                    {route.origin} &rarr; {route.destination}
                    <span className="ml-1 opacity-70">({route.lineIds.length})</span>
                  </Badge>
                )
              })}
            </div>
          )}

          {/* Lines table using DynamicTable */}
          <div className="border rounded-lg overflow-hidden">
            <ConvertTableContent
              tableData={tableData}
              columns={columns}
              onCellEditSave={handleCellEditSave}
            />
          </div>

          {/* Info about containers */}
          {totalContainersToCreate > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4 text-blue-500" />
              <span>{totalContainersToCreate} container{totalContainersToCreate !== 1 ? 's' : ''} will be created</span>
            </div>
          )}
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
