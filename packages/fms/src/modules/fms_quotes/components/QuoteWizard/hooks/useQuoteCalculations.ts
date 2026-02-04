'use client'

import { useMemo, useCallback } from 'react'
import type { QuoteLine, QuoteTotals, CurrencyTotals, MultiCurrencyTotals } from '../types/quote-wizard'

// =============================================================================
// Utility Functions
// =============================================================================

function round(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

// =============================================================================
// Pure Calculation Functions
// =============================================================================

/**
 * Calculate unit sales price from margin percentage
 * Formula: unitSales = unitCost / (1 - marginPercent / 100)
 *
 * Supports negative margins (selling below cost)
 */
export function calculateFromMargin(unitCost: number, marginPercent: number): number {
  if (marginPercent >= 100) return unitCost * 10 // Cap at 10x cost (avoid division by zero)
  return unitCost / (1 - marginPercent / 100)
}

/**
 * Calculate margin percentage from unit sales price
 * Formula: marginPercent = ((unitSales - unitCost) / unitSales) * 100
 *
 * Supports negative margins (selling below cost)
 */
export function calculateFromSales(unitCost: number, unitSales: number): number {
  if (unitSales <= 0) return 0 // Can't divide by zero
  return ((unitSales - unitCost) / unitSales) * 100
}

/**
 * Calculate totals for a single line (each line represents one unit)
 */
export function calculateLineTotals(
  unitCost: number,
  marginPercent: number
): {
  marginPercent: number
  unitSales: number
  totalCost: number
  totalSales: number
  profit: number
} {
  const unitSales = calculateFromMargin(unitCost, marginPercent)
  const totalCost = round(unitCost, 4)
  const totalSales = round(unitSales, 4)
  const profit = round(totalSales - totalCost, 4)

  return {
    marginPercent: round(marginPercent, 4),
    unitSales: round(unitSales, 4),
    totalCost,
    totalSales,
    profit,
  }
}

/**
 * Calculate aggregate totals for all quote lines
 */
export function calculateQuoteTotals(lines: QuoteLine[]): QuoteTotals {
  const result = lines.reduce(
    (acc, line) => {
      const cost = parseFloat(line.unitCost) || 0
      const sales = parseFloat(line.unitSales) || 0

      return {
        totalCost: acc.totalCost + cost,
        totalSales: acc.totalSales + sales,
        lineCount: acc.lineCount + 1,
      }
    },
    { totalCost: 0, totalSales: 0, lineCount: 0 }
  )

  const totalProfit = result.totalSales - result.totalCost
  const averageMargin =
    result.totalSales > 0 ? (totalProfit / result.totalSales) * 100 : 0

  return {
    totalCost: round(result.totalCost, 2),
    totalSales: round(result.totalSales, 2),
    totalProfit: round(totalProfit, 2),
    lineCount: result.lineCount,
    averageMargin: round(averageMargin, 2),
  }
}

/**
 * Calculate totals grouped by currency
 */
export function calculateMultiCurrencyTotals(lines: QuoteLine[]): MultiCurrencyTotals {
  // Group lines by currency
  const byCurrencyMap = new Map<string, { lines: QuoteLine[] }>()

  for (const line of lines) {
    const currency = line.currencyCode || 'USD'
    if (!byCurrencyMap.has(currency)) {
      byCurrencyMap.set(currency, { lines: [] })
    }
    byCurrencyMap.get(currency)!.lines.push(line)
  }

  // Calculate totals for each currency
  const byCurrency: CurrencyTotals[] = []
  let totalMarginWeightedSum = 0
  let totalSalesSum = 0

  for (const [currencyCode, { lines: currencyLines }] of byCurrencyMap) {
    const totals = currencyLines.reduce(
      (acc, line) => {
        const cost = parseFloat(line.unitCost) || 0
        const sales = parseFloat(line.unitSales) || 0

        return {
          totalCost: acc.totalCost + cost,
          totalSales: acc.totalSales + sales,
          lineCount: acc.lineCount + 1,
        }
      },
      { totalCost: 0, totalSales: 0, lineCount: 0 }
    )

    const totalProfit = totals.totalSales - totals.totalCost
    const marginPercent = totals.totalSales > 0
      ? (totalProfit / totals.totalSales) * 100
      : 0

    byCurrency.push({
      currencyCode,
      lineCount: totals.lineCount,
      totalCost: round(totals.totalCost, 2),
      totalSales: round(totals.totalSales, 2),
      totalProfit: round(totalProfit, 2),
      marginPercent: round(marginPercent, 2),
    })

    // For weighted average margin calculation
    totalMarginWeightedSum += marginPercent * totals.totalSales
    totalSalesSum += totals.totalSales
  }

  // Sort by currency code for consistent display
  byCurrency.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))

  // Calculate weighted average margin across all currencies
  const averageMargin = totalSalesSum > 0
    ? round(totalMarginWeightedSum / totalSalesSum, 2)
    : 0

  return {
    byCurrency,
    overall: {
      lineCount: lines.length,
      averageMargin,
    },
  }
}

// =============================================================================
// useQuoteCalculations Hook
// =============================================================================

export function useQuoteCalculations() {
  /**
   * Recalculate line values when margin changes
   * Returns the fields that need to be updated
   */
  const recalculateFromMargin = useCallback(
    (line: QuoteLine, newMarginPercent: number): Partial<QuoteLine> => {
      const unitCost = parseFloat(line.unitCost) || 0
      const unitSales = calculateFromMargin(unitCost, newMarginPercent)

      return {
        marginPercent: newMarginPercent.toString(),
        unitSales: round(unitSales, 4).toString(),
      }
    },
    []
  )

  /**
   * Recalculate line values when unit sales changes
   * Returns the fields that need to be updated
   */
  const recalculateFromSales = useCallback(
    (line: QuoteLine, newUnitSales: number): Partial<QuoteLine> => {
      const unitCost = parseFloat(line.unitCost) || 0
      const marginPercent = calculateFromSales(unitCost, newUnitSales)

      return {
        marginPercent: round(marginPercent, 4).toString(),
        unitSales: newUnitSales.toString(),
      }
    },
    []
  )

  /**
   * Apply calculation based on which field changed
   * Returns all the updates needed for the line
   */
  const applyCalculation = useCallback(
    (line: QuoteLine, field: string, value: unknown): Partial<QuoteLine> => {
      const updates: Partial<QuoteLine> = { [field]: value }

      switch (field) {
        case 'marginPercent': {
          const additionalUpdates = recalculateFromMargin(line, Number(value))
          return { ...updates, ...additionalUpdates }
        }
        case 'unitSales': {
          const additionalUpdates = recalculateFromSales(line, Number(value))
          return { ...updates, ...additionalUpdates }
        }
        default:
          return updates
      }
    },
    [recalculateFromMargin, recalculateFromSales]
  )

  return {
    // Individual recalculation functions
    recalculateFromMargin,
    recalculateFromSales,

    // Unified calculation applier
    applyCalculation,

    // Static calculation functions
    calculateQuoteTotals,
    calculateLineTotals,
    calculateFromMargin,
    calculateFromSales,
  }
}

// =============================================================================
// useQuoteTotals Hook
//
// Memoized hook for calculating totals from lines
// =============================================================================

export function useQuoteTotals(lines: QuoteLine[]): QuoteTotals {
  return useMemo(() => calculateQuoteTotals(lines), [lines])
}

// =============================================================================
// useMultiCurrencyTotals Hook
//
// Memoized hook for calculating totals grouped by currency
// =============================================================================

export function useMultiCurrencyTotals(lines: QuoteLine[]): MultiCurrencyTotals {
  return useMemo(() => calculateMultiCurrencyTotals(lines), [lines])
}
