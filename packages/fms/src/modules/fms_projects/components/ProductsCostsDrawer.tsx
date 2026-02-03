'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, FileEdit, Link2, ArrowRightLeft } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { ProjectLinesTable, type ProjectLine } from './ProjectLinesTable'
import { AddManualLineDialog, type NewProjectLineData } from './AddManualLineDialog'
import { LinkOfferDialog } from './LinkOfferDialog'
import { AddProjectProductDialog } from './AddProjectProductDialog'
import { OfferDetailDrawer } from '../../fms_quotes/components/OfferDetailDrawer'
import type { ExchangeRateSnapshot } from '../../fms_quotes/data/types'

type ProductsCostsDrawerProps = {
  projectId: string
  offerId: string | null
  currencyCode: string
  open: boolean
  onClose: () => void
  onError?: (error: string) => void
  baseCurrency?: string | null
  exchangeRates?: ExchangeRateSnapshot[] | null
}

// Helper to format currency
function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Helper to convert currency using exchange rates
function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): number {
  if (fromCurrency === toCurrency) return amount
  if (!exchangeRates || exchangeRates.length === 0) return amount

  const rate = exchangeRates.find(
    r => r.fromCurrencyCode === fromCurrency && r.toCurrencyCode === toCurrency
  )

  if (rate) return amount * parseFloat(rate.rate)

  // Try reverse rate
  const reverseRate = exchangeRates.find(
    r => r.fromCurrencyCode === toCurrency && r.toCurrencyCode === fromCurrency
  )

  if (reverseRate) return amount / parseFloat(reverseRate.rate)

  return amount
}

// Calculate totals from lines
function calculateTotals(
  lines: ProjectLine[],
  displayCurrency: string,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): { revenue: number; costs: number; margin: number; marginPercent: number } {
  if (!lines || lines.length === 0) {
    return { revenue: 0, costs: 0, margin: 0, marginPercent: 0 }
  }

  let revenue = 0
  let costs = 0

  for (const line of lines) {
    const lineCurrency = line.currencyCode || 'USD'
    const soldAmount = parseFloat(line.soldAmount || '0')
    const actualCost = parseFloat(line.actualCost || '0')

    // Convert to display currency
    revenue += convertCurrency(soldAmount, lineCurrency, displayCurrency, exchangeRates)
    costs += convertCurrency(actualCost, lineCurrency, displayCurrency, exchangeRates)
  }

  const margin = revenue - costs
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0

  return { revenue, costs, margin, marginPercent }
}

// Get available currencies from lines and exchange rates
function getAvailableCurrencies(
  lines: ProjectLine[],
  defaultCurrency: string,
  baseCurrency: string | null | undefined,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): string[] {
  const currencies = new Set<string>([defaultCurrency])

  // Add base currency if available
  if (baseCurrency) {
    currencies.add(baseCurrency)
  }

  // Add currencies from lines
  for (const line of lines) {
    if (line.currencyCode) {
      currencies.add(line.currencyCode)
    }
  }

  // Add currencies from exchange rates
  if (exchangeRates) {
    for (const rate of exchangeRates) {
      currencies.add(rate.fromCurrencyCode)
      currencies.add(rate.toCurrencyCode)
    }
  }

  return Array.from(currencies).sort()
}

export function ProductsCostsDrawer({
  projectId,
  offerId,
  currencyCode,
  open,
  onClose,
  onError,
  baseCurrency,
  exchangeRates,
}: ProductsCostsDrawerProps) {
  const queryClient = useQueryClient()
  const [showManualLineDialog, setShowManualLineDialog] = useState(false)
  const [showLinkOfferDialog, setShowLinkOfferDialog] = useState(false)
  const [showAddProductDialog, setShowAddProductDialog] = useState(false)
  const [showOfferDrawer, setShowOfferDrawer] = useState(false)
  const [linkedOfferId, setLinkedOfferId] = useState<string | null>(offerId)

  // Summary table ref and state
  const summaryTableRef = useRef<HTMLDivElement>(null)
  const defaultDisplayCurrency = baseCurrency || currencyCode
  const [displayCurrency, setDisplayCurrency] = useState<string>(defaultDisplayCurrency)

  // Update display currency when base currency becomes available
  useEffect(() => {
    if (baseCurrency && displayCurrency === currencyCode) {
      setDisplayCurrency(baseCurrency)
    }
  }, [baseCurrency, currencyCode, displayCurrency])

  // Fetch project lines
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['fms_project_lines', projectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(
        `/api/fms_projects/projects/${projectId}/lines`
      )
      if (!response.ok) return []
      return (response.result?.items || []).map((line: any) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        sourceOfferLineId: line.sourceOfferLineId,
        sourceType: line.sourceType || 'manual',
        // Product references
        productId: line.productId || null,
        variantId: line.variantId || null,
        priceId: line.priceId || null,
        // Product snapshot
        productName: line.productName,
        chargeCode: line.chargeCode,
        chargeCategory: line.chargeCategory || null,
        chargeUnit: line.chargeUnit || null,
        containerSize: line.containerSize,
        containerType: line.containerType || null,
        // Pricing
        quantity: line.quantity || '1',
        currencyCode: line.currencyCode || 'USD',
        soldUnitPrice: line.soldUnitPrice || '0',
        soldAmount: line.soldAmount || '0',
        actualUnitCost: line.actualUnitCost,
        actualCost: line.actualCost,
        notes: line.notes,
      })) as ProjectLine[]
    },
    enabled: !!projectId && open,
  })

  // Get available currencies for dropdown
  const availableCurrencies = useMemo(
    () => getAvailableCurrencies(lines, currencyCode, baseCurrency, exchangeRates),
    [lines, currencyCode, baseCurrency, exchangeRates]
  )

  // Calculate totals in the selected display currency
  const totals = useMemo(
    () => calculateTotals(lines, displayCurrency, exchangeRates),
    [lines, displayCurrency, exchangeRates]
  )

  // Summary table columns
  const summaryColumns = useMemo((): ColumnDef[] => [
    {
      data: 'revenue',
      title: 'Revenue',
      width: 120,
      readOnly: true,
      cellClassName: () => 'cell-green',
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return formatCurrency(numVal, displayCurrency)
      },
    },
    {
      data: 'costs',
      title: 'Costs',
      width: 120,
      readOnly: true,
      cellClassName: () => 'cell-red',
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return formatCurrency(numVal, displayCurrency)
      },
    },
    {
      data: 'margin',
      title: 'Margin',
      width: 120,
      readOnly: true,
      cellClassName: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return numVal >= 0 ? 'cell-green' : 'cell-red'
      },
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return formatCurrency(numVal, displayCurrency)
      },
    },
    {
      data: 'marginPercent',
      title: 'Margin %',
      width: 100,
      readOnly: true,
      cellClassName: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return numVal >= 0 ? 'cell-green' : 'cell-red'
      },
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return `${numVal.toFixed(1)}%`
      },
    },
    {
      data: 'displayCurrency',
      title: 'Currency',
      width: 100,
      type: 'dropdown',
      source: availableCurrencies,
    },
  ], [displayCurrency, availableCurrencies])

  // Summary table data
  const summaryTableData = useMemo(() => [{
    id: 'summary',
    revenue: totals.revenue,
    costs: totals.costs,
    margin: totals.margin,
    marginPercent: totals.marginPercent,
    displayCurrency: displayCurrency,
  }], [totals, displayCurrency])

  // Handle summary cell change
  const handleSummaryCellChange = useCallback((field: string, value: unknown) => {
    if (field === 'displayCurrency') {
      const newCurrency = String(value || displayCurrency)
      if (availableCurrencies.includes(newCurrency)) {
        setDisplayCurrency(newCurrency)
      }
    }
  }, [displayCurrency, availableCurrencies])

  // Summary table event handlers
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(summaryTableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          handleSummaryCellChange(payload.prop, payload.newValue)

          dispatch(summaryTableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(summaryTableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },
    },
    summaryTableRef as React.RefObject<HTMLElement>
  )

  // Update line mutation
  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, field, value }: { lineId: string; field: string; value: unknown }) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/lines/${lineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!response.ok) throw new Error('Failed to update line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to update line')
    },
  })

  // Add line mutation
  const addLineMutation = useMutation({
    mutationFn: async (lineData: NewProjectLineData) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: lineData.productName,
          chargeCode: lineData.chargeCode,
          containerSize: lineData.containerSize,
          quantity: lineData.quantity,
          soldUnitPrice: lineData.soldUnitPrice,
          currencyCode: lineData.currencyCode,
          notes: lineData.notes,
          sourceType: 'manual',
        }),
      })
      if (!response.ok) throw new Error('Failed to add line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to add line')
    },
  })

  // Remove line mutation
  const removeLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/lines/${lineId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to remove line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to remove line')
    },
  })

  // Handler for line updates
  const handleLineUpdate = useCallback(
    async (lineId: string, field: string, value: unknown) => {
      await updateLineMutation.mutateAsync({ lineId, field, value })
    },
    [updateLineMutation]
  )

  // Handler for adding a manual line
  const handleAddManualLine = useCallback(
    async (lineData: NewProjectLineData) => {
      await addLineMutation.mutateAsync(lineData)
    },
    [addLineMutation]
  )

  // Handler for adding a product from catalog
  const handleAddProduct = useCallback(
    async (lineData: NewProjectLineData) => {
      await addLineMutation.mutateAsync(lineData)
    },
    [addLineMutation]
  )

  // Handler for removing a line
  const handleRemoveLine = useCallback(
    async (lineId: string) => {
      await removeLineMutation.mutateAsync(lineId)
    },
    [removeLineMutation]
  )

  // Handler for linking offer
  const handleOfferLinked = useCallback(
    (newOfferId: string) => {
      setLinkedOfferId(newOfferId)
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    [queryClient, projectId]
  )

  // Determine if we can link an offer (only when no offer linked AND no lines)
  const canLinkOffer = !linkedOfferId && lines.length === 0

  // Empty state when no linked offer and no lines
  const showEmptyState = !linkedOfferId && lines.length === 0 && !isLoading

  // Title bar content for the table
  const titleContent = (
    <div className="flex items-center gap-2">
      <span className="font-medium">Products & Costs</span>
      <Badge variant="secondary">{lines.length}</Badge>
      {linkedOfferId && (
        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setShowOfferDrawer(true)
          }}
        >
          <Link2 className="h-3 w-3 mr-1" />
          Linked
        </Badge>
      )}
    </div>
  )

  // Buttons for the table top bar
  const buttonsContent = (
    <div className="flex items-center gap-2">
      {canLinkOffer && (
        <Button size="sm" variant="outline" onClick={() => setShowLinkOfferDialog(true)}>
          <Link2 className="h-4 w-4 mr-1" />
          Link Offer
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setShowAddProductDialog(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add Product
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setShowManualLineDialog(true)}>
        <FileEdit className="h-4 w-4 mr-1" />
        Manual Line
      </Button>
    </div>
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-y-0 right-0 bg-background border-l shadow-xl z-50 flex flex-col"
        style={{ width: '100vw', maxWidth: '1200px' }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <h2 className="text-xl font-semibold">Products & Costs</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Summary Section - DynamicTable with Currency dropdown */}
          {lines.length > 0 && (
            <div className="border rounded-lg">
              <div className="px-3 py-1.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Summary</h3>
                  {linkedOfferId && (
                    <Badge
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => setShowOfferDrawer(true)}
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Linked
                    </Badge>
                  )}
                </div>
              </div>
              <DynamicTable
                tableRef={summaryTableRef}
                data={summaryTableData}
                columns={summaryColumns}
                tableName=""
                idColumnName="id"
                width="100%"
                colHeaders={true}
                rowHeaders={false}
                stretchColumns={true}
                uiConfig={{
                  hideToolbar: true,
                  hideSearch: true,
                  hideAddRowButton: true,
                  hideActionsColumn: true,
                  hideBottomBar: true,
                  hideFilterButton: true,
                }}
              />
            </div>
          )}

          {/* Lines Table */}
          <ProjectLinesTable
            lines={lines}
            isLoading={isLoading}
            onLineUpdate={handleLineUpdate}
            onRemoveLine={handleRemoveLine}
            currencyCode={currencyCode}
            titleContent={titleContent}
            buttonsContent={buttonsContent}
            expanded={true}
            showEmptyState={showEmptyState}
            onShowLinkOffer={() => setShowLinkOfferDialog(true)}
            onShowAddProduct={() => setShowAddProductDialog(true)}
          />

          {/* Exchange Rates Section */}
          {exchangeRates && exchangeRates.length > 0 && (
            <div className="border rounded-lg">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Exchange Rates</h3>
                <Badge variant="secondary" className="text-xs">From Offer</Badge>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {exchangeRates.map((rate, index) => (
                    <div
                      key={`${rate.fromCurrencyCode}-${rate.toCurrencyCode}-${index}`}
                      className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2"
                    >
                      <span className="font-medium">{rate.fromCurrencyCode}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{rate.toCurrencyCode}</span>
                      <span className="text-muted-foreground ml-auto">{parseFloat(rate.rate).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
                {exchangeRates[0]?.date && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Rates as of {new Date(exchangeRates[0].date).toLocaleDateString()}
                    {exchangeRates[0].source && ` (${exchangeRates[0].source})`}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add manual line dialog */}
      <AddManualLineDialog
        open={showManualLineDialog}
        onOpenChange={setShowManualLineDialog}
        onAdd={handleAddManualLine}
      />

      {/* Link offer dialog */}
      <LinkOfferDialog
        open={showLinkOfferDialog}
        onOpenChange={setShowLinkOfferDialog}
        projectId={projectId}
        onOfferLinked={handleOfferLinked}
      />

      {/* Add product from catalog dialog */}
      <AddProjectProductDialog
        open={showAddProductDialog}
        onOpenChange={setShowAddProductDialog}
        onAdd={handleAddProduct}
        currencyCode={currencyCode}
      />

      {/* Offer detail drawer */}
      <OfferDetailDrawer
        offerId={linkedOfferId}
        open={showOfferDrawer}
        onClose={() => setShowOfferDrawer(false)}
      />
    </>
  )
}
