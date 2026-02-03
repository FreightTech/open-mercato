'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
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
import { Link2, ExternalLink } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { ExchangeRateSnapshot } from '../../../fms_quotes/data/types'

// Define ProjectLine type locally
interface ProjectLine {
  id: string
  soldAmount: string
  actualCost?: string | null
  currencyCode?: string | null
}

// Invoicing status options
export const INVOICING_STATUS_OPTIONS = [
  { value: 'not_invoiced', label: 'Not Invoiced' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid_resolved', label: 'Paid & Resolved' },
] as const

export type InvoicingStatus = typeof INVOICING_STATUS_OPTIONS[number]['value']

// Get status badge color class
function getStatusColorClass(status: InvoicingStatus): string {
  switch (status) {
    case 'not_invoiced':
      return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'invoiced':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'partially_paid':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'paid_resolved':
      return 'bg-green-50 text-green-700 border-green-200'
    default:
      return ''
  }
}

type ProjectFinancialsTableProps = {
  projectLines: ProjectLine[]
  currencyCode: string
  invoicingStatus?: InvoicingStatus
  onInvoicingStatusChange?: (status: InvoicingStatus) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
  offerId?: string | null
  quoteNumber?: string | null
  onViewDetails?: () => void
  onLinkedClick?: () => void
  // Base currency and exchange rates from linked offer
  baseCurrency?: string | null
  exchangeRates?: ExchangeRateSnapshot[] | null
}

// Format currency value
function formatCurrency(value: number, currencyCode: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Convert currency using exchange rates
function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): number {
  if (fromCurrency === toCurrency) return amount
  if (!exchangeRates || exchangeRates.length === 0) return amount

  // Try direct rate
  const directRate = exchangeRates.find(
    r => r.fromCurrencyCode === fromCurrency && r.toCurrencyCode === toCurrency
  )
  if (directRate) return amount * parseFloat(directRate.rate)

  // Try reverse rate
  const reverseRate = exchangeRates.find(
    r => r.fromCurrencyCode === toCurrency && r.toCurrencyCode === fromCurrency
  )
  if (reverseRate) return amount / parseFloat(reverseRate.rate)

  return amount
}

// Calculate financial totals with currency conversion
function calculateFinancialsInCurrency(
  projectLines: ProjectLine[],
  displayCurrency: string,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): { revenue: number; costs: number; margin: number; marginPercent: number } {
  if (!projectLines || projectLines.length === 0) {
    return { revenue: 0, costs: 0, margin: 0, marginPercent: 0 }
  }

  let revenue = 0
  let costs = 0

  for (const line of projectLines) {
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
  projectLines: ProjectLine[],
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
  for (const line of projectLines) {
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

export function ProjectFinancialsTable({
  projectLines,
  currencyCode,
  invoicingStatus = 'not_invoiced',
  onInvoicingStatusChange,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
  offerId,
  quoteNumber,
  onViewDetails,
  onLinkedClick,
  baseCurrency,
  exchangeRates,
}: ProjectFinancialsTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Default to base currency from offer, or project currency
  const defaultDisplayCurrency = baseCurrency || currencyCode

  // State for selected display currency
  const [displayCurrency, setDisplayCurrency] = useState<string>(defaultDisplayCurrency)

  // Update display currency when base currency becomes available
  useEffect(() => {
    if (baseCurrency && displayCurrency === currencyCode) {
      setDisplayCurrency(baseCurrency)
    }
  }, [baseCurrency, currencyCode, displayCurrency])

  // Get available currencies for dropdown
  const availableCurrencies = useMemo(
    () => getAvailableCurrencies(projectLines, currencyCode, baseCurrency, exchangeRates),
    [projectLines, currencyCode, baseCurrency, exchangeRates]
  )

  // Calculate financials in the selected display currency
  const financials = useMemo(
    () => calculateFinancialsInCurrency(projectLines, displayCurrency, exchangeRates),
    [projectLines, displayCurrency, exchangeRates]
  )

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'revenue',
      title: 'Revenue',
      width: 110,
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
      width: 110,
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
      width: 110,
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
      width: 90,
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
    // Currency dropdown column
    {
      data: 'displayCurrency',
      title: 'Currency',
      width: 90,
      type: 'dropdown',
      source: availableCurrencies,
    },
    {
      data: 'invoicingStatus',
      title: 'Invoicing Status',
      width: 130,
      type: 'dropdown',
      source: INVOICING_STATUS_OPTIONS.map(o => o.label),
      renderer: (val: unknown) => {
        const strVal = String(val || '')
        const option = INVOICING_STATUS_OPTIONS.find(o => o.label === strVal || o.value === strVal)
        const status = option?.value || 'not_invoiced'
        const label = option?.label || 'Not Invoiced'
        return (
          <Badge variant="outline" className={`text-xs ${getStatusColorClass(status)}`}>
            {label}
          </Badge>
        )
      },
    },
  ], [displayCurrency, availableCurrencies])

  // Get display label for invoicing status
  const invoicingStatusLabel = useMemo(() => {
    const option = INVOICING_STATUS_OPTIONS.find(o => o.value === invoicingStatus)
    return option?.label || 'Not Invoiced'
  }, [invoicingStatus])

  const tableData = useMemo(() => [{
    id: 'financials',
    revenue: financials.revenue,
    costs: financials.costs,
    margin: financials.margin,
    marginPercent: financials.marginPercent,
    displayCurrency: displayCurrency,
    invoicingStatus: invoicingStatusLabel,
  }], [financials, invoicingStatusLabel, displayCurrency])

  // Handle cell change
  const handleCellChange = useCallback((field: string, value: unknown) => {
    if (field === 'invoicingStatus' && onInvoicingStatusChange) {
      const strValue = String(value || '')
      const option = INVOICING_STATUS_OPTIONS.find(o => o.label === strValue)
      if (option) {
        onInvoicingStatusChange(option.value)
      }
    } else if (field === 'displayCurrency') {
      const newCurrency = String(value || displayCurrency)
      if (availableCurrencies.includes(newCurrency)) {
        setDisplayCurrency(newCurrency)
      }
    }
  }, [onInvoicingStatusChange, displayCurrency, availableCurrencies])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          handleCellChange(payload.prop, payload.newValue)

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

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-1.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Financials</h3>
          {offerId && (
            <Badge
              variant="outline"
              className="text-xs cursor-pointer hover:bg-muted transition-colors"
              onClick={onLinkedClick}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Linked
            </Badge>
          )}
        </div>
        {onViewDetails && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onViewDetails}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View Details
          </Button>
        )}
      </div>
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
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
