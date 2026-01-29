'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { SimpleTooltip, TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { FileText } from 'lucide-react'
import { DynamicTable, type ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuoteWizardContext } from './hooks/useQuoteWizardContext'
import type { QuoteLine } from './types/quote-wizard'

// =============================================================================
// Types
// =============================================================================

type ExchangeRateData = {
  id: string
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
}

// =============================================================================
// Formatting Helpers
// =============================================================================

function formatCurrency(value: number, currency: string): string {
  const currencyCode = currency || 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

// =============================================================================
// Exchange Rate Helpers
// =============================================================================

function buildExchangeRateMap(
  rates: ExchangeRateData[],
  baseCurrency: string
): Map<string, number> {
  const rateMap = new Map<string, number>()
  rateMap.set(baseCurrency, 1) // Base currency has rate 1

  for (const rate of rates) {
    const rateValue = parseFloat(rate.rate)
    if (isNaN(rateValue)) continue

    if (rate.fromCurrencyCode === baseCurrency) {
      // Rate is: 1 BASE = X TARGET, so to convert TARGET to BASE: divide by rate
      rateMap.set(rate.toCurrencyCode, 1 / rateValue)
    } else if (rate.toCurrencyCode === baseCurrency) {
      // Rate is: 1 SOURCE = X BASE, so to convert SOURCE to BASE: multiply by rate
      rateMap.set(rate.fromCurrencyCode, rateValue)
    }
  }

  return rateMap
}

function convertToBaseCurrency(
  amount: number,
  fromCurrency: string,
  rateMap: Map<string, number>
): number {
  const rate = rateMap.get(fromCurrency)
  if (rate === undefined) {
    // No rate available, return original amount (best effort)
    return amount
  }
  return amount * rate
}

// =============================================================================
// Hooks
// =============================================================================

function useExchangeRates(baseCurrency: string, currencies: string[]) {
  const uniqueCurrencies = [...new Set(currencies)].filter(c => c && c !== baseCurrency)

  return useQuery({
    queryKey: ['exchange-rates', baseCurrency, uniqueCurrencies.sort().join(',')],
    queryFn: async () => {
      if (uniqueCurrencies.length === 0) return []

      const response = await apiCall<{
        items: ExchangeRateData[]
        total: number
      }>('/api/currencies/exchange-rates?isActive=true&pageSize=100')

      if (!response.ok || !response.result?.items) {
        return []
      }

      // Filter for relevant currency pairs
      return response.result.items.filter(rate => {
        const isFromBase = rate.fromCurrencyCode === baseCurrency && uniqueCurrencies.includes(rate.toCurrencyCode)
        const isToBase = rate.toCurrencyCode === baseCurrency && uniqueCurrencies.includes(rate.fromCurrencyCode)
        return isFromBase || isToBase
      })
    },
    enabled: uniqueCurrencies.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// =============================================================================
// Calculation with Currency Conversion
// =============================================================================

function calculateTotalsWithConversion(
  lines: QuoteLine[],
  baseCurrency: string,
  rateMap: Map<string, number>
): { lineCount: number; totalCost: number; totalSales: number; totalProfit: number; averageMargin: number } {
  let totalCost = 0
  let totalSales = 0

  for (const line of lines) {
    const qty = parseFloat(line.quantity) || 0
    const cost = parseFloat(line.unitCost) || 0
    const sales = parseFloat(line.unitSales) || 0
    const lineCurrency = line.currencyCode || baseCurrency

    const lineCostInBase = convertToBaseCurrency(qty * cost, lineCurrency, rateMap)
    const lineSalesInBase = convertToBaseCurrency(qty * sales, lineCurrency, rateMap)

    totalCost += lineCostInBase
    totalSales += lineSalesInBase
  }

  const totalProfit = totalSales - totalCost
  const averageMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0

  return {
    lineCount: lines.length,
    totalCost: Math.round(totalCost * 100) / 100,
    totalSales: Math.round(totalSales * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    averageMargin: Math.round(averageMargin * 10) / 10,
  }
}

// =============================================================================
// Props
// =============================================================================

type QuoteWizardTotalsProps = {
  lines: QuoteLine[]
  currencyCode: string
  onCreateOffer?: () => void
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * QuoteWizardTotals - Displays quote summary metrics in a single row
 *
 * Converts all line values to the quote's base currency using exchange rates,
 * then shows consolidated totals (lines, cost, avg margin, profit, sales).
 */
export function QuoteWizardTotals({ lines, currencyCode, onCreateOffer }: QuoteWizardTotalsProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Get unique currencies from lines
  const lineCurrencies = useMemo(() =>
    lines.map(l => l.currencyCode).filter(Boolean),
    [lines]
  )

  // Fetch exchange rates for currency conversion
  const { data: exchangeRates = [] } = useExchangeRates(currencyCode, lineCurrencies)

  // Build rate map and calculate totals with conversion
  const totals = useMemo(() => {
    const rateMap = buildExchangeRateMap(exchangeRates, currencyCode)
    return calculateTotalsWithConversion(lines, currencyCode, rateMap)
  }, [lines, currencyCode, exchangeRates])

  const isDisabled = totals.lineCount === 0

  // Build single row data - include currency for renderers to use
  const tableData = useMemo(() => [{
    id: 'totals',
    currency: currencyCode,
    lineCount: totals.lineCount,
    totalCost: totals.totalCost,
    marginPercent: totals.averageMargin,
    totalProfit: totals.totalProfit,
    totalSales: totals.totalSales,
  }], [totals, currencyCode])

  // Define columns for the summary table (no Currency column)
  // Use rowData.currency in renderers to ensure updates when currency changes
  const columns: ColumnDef[] = useMemo(() => [
    {
      data: 'lineCount',
      title: 'Lines',
      width: 60,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'totalCost',
      title: 'Cost',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number, rowData: { currency: string }) => formatCurrency(value, rowData.currency),
    },
    {
      data: 'marginPercent',
      title: 'Margin',
      width: 80,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number) => formatPercent(value),
      cellClassName: (value: number) => {
        if (value < 0) return 'cell-red'
        if (value < 5) return 'cell-yellow'
        if (value >= 5) return 'cell-green'
        return undefined
      },
    },
    {
      data: 'totalProfit',
      title: 'Profit',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number, rowData: { currency: string }) => formatCurrency(value, rowData.currency),
      cellClassName: (value: number) => {
        if (value < 0) return 'cell-red'
        if (value > 0) return 'cell-green'
        return undefined
      },
    },
    {
      data: 'totalSales',
      title: 'Sales',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number, rowData: { currency: string }) => formatCurrency(value, rowData.currency),
    },
  ], [])

  return (
    <TooltipProvider>
      <div className="py-3 px-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4">
          {/* Summary Table */}
          <div className="flex-1 min-w-0">
            {totals.lineCount > 0 ? (
              <DynamicTable
                key={`totals-${currencyCode}`}
                tableRef={tableRef}
                data={tableData}
                columns={columns}
                height={72}
                colHeaders={true}
                rowHeaders={false}
                idColumnName="id"
                stretchColumns={true}
                autoSelectOnFocus={true}
                uiConfig={{
                  hideToolbar: true,
                  hideSearch: true,
                  hideFilterButton: true,
                  hideAddRowButton: true,
                  hideBottomBar: true,
                  hideActionsColumn: true,
                }}
              />
            ) : (
              <div className="text-sm text-muted-foreground py-2">
                No lines added yet
              </div>
            )}
          </div>

          {/* Create Offer Button */}
          {onCreateOffer && (
            <div className="flex-shrink-0 self-center">
              <SimpleTooltip
                content={isDisabled ? 'Add at least one product to create an offer' : null}
                side="top"
              >
                <span>
                  <Button
                    onClick={onCreateOffer}
                    disabled={isDisabled}
                    size="sm"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Create Offer
                  </Button>
                </span>
              </SimpleTooltip>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

// =============================================================================
// Context-based component
// =============================================================================

/**
 * QuoteWizardTotalsConnected - Uses QuoteWizardContext for state
 *
 * This component automatically gets lines, quote currency, and actions from context.
 */
export function QuoteWizardTotalsConnected() {
  const { lines, quote, effectiveQuoteId, openCreateOfferDrawer } = useQuoteWizardContext()

  return (
    <QuoteWizardTotals
      lines={lines}
      currencyCode={quote?.currencyCode || 'USD'}
      onCreateOffer={effectiveQuoteId ? openCreateOfferDrawer : undefined}
    />
  )
}

// =============================================================================
// Legacy Props-based component (for backward compatibility)
// =============================================================================

type LegacyQuoteWizardTotalsProps = {
  totals: {
    totalCost: number
    totalSales: number
    totalProfit: number
    lineCount: number
    averageMargin: number
  }
  currency: string
  onCreateOffer?: () => void
}

/**
 * LegacyQuoteWizardTotals - Simple single-currency display
 * @deprecated Use QuoteWizardTotals with lines prop instead
 */
export function LegacyQuoteWizardTotals({ totals, currency, onCreateOffer }: LegacyQuoteWizardTotalsProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const isDisabled = totals.lineCount === 0

  const data = [{
    currencyCode: currency,
    lineCount: totals.lineCount,
    totalCost: totals.totalCost,
    marginPercent: totals.averageMargin,
    totalProfit: totals.totalProfit,
    totalSales: totals.totalSales,
  }]

  const columns: ColumnDef[] = [
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 80,
      readOnly: true,
      renderer: (value: string) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800">
          {value}
        </span>
      ),
    },
    { data: 'lineCount', title: 'Lines', width: 60, type: 'numeric', readOnly: true },
    {
      data: 'totalCost',
      title: 'Cost',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number) => formatCurrency(value, currency),
    },
    {
      data: 'marginPercent',
      title: 'Margin',
      width: 80,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number) => formatPercent(value),
      cellClassName: (value: number) => {
        if (value < 0) return 'cell-red'
        if (value < 5) return 'cell-yellow'
        if (value >= 5) return 'cell-green'
        return undefined
      },
    },
    {
      data: 'totalProfit',
      title: 'Profit',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number) => formatCurrency(value, currency),
      cellClassName: (value: number) => {
        if (value < 0) return 'cell-red'
        if (value > 0) return 'cell-green'
        return undefined
      },
    },
    {
      data: 'totalSales',
      title: 'Sales',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: (value: number) => formatCurrency(value, currency),
    },
  ]

  return (
    <TooltipProvider>
      <div className="py-3 px-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <DynamicTable
              tableRef={tableRef}
              data={data}
              columns={columns}
              height={72}
              colHeaders={true}
              rowHeaders={false}
              idColumnName="currencyCode"
              stretchColumns={true}
              autoSelectOnFocus={true}
              uiConfig={{
                hideToolbar: true,
                hideSearch: true,
                hideFilterButton: true,
                hideAddRowButton: true,
                hideBottomBar: true,
                hideActionsColumn: true,
              }}
            />
          </div>

          {onCreateOffer && (
            <div className="flex-shrink-0 self-center">
              <SimpleTooltip
                content={isDisabled ? 'Add at least one product to create an offer' : null}
                side="top"
              >
                <span>
                  <Button
                    onClick={onCreateOffer}
                    disabled={isDisabled}
                    size="sm"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Create Offer
                  </Button>
                </span>
              </SimpleTooltip>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
