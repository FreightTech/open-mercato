'use client'

import { useMemo, useCallback } from 'react'
import type { QuoteLine, QuoteTotals } from '../types/quote-wizard'

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
 */
export function calculateFromMargin(unitCost: number, marginPercent: number): number {
  if (marginPercent >= 100) return unitCost * 10 // Cap at 10x cost
  if (marginPercent <= 0) return unitCost
  return unitCost / (1 - marginPercent / 100)
}

/**
 * Calculate margin percentage from unit sales price
 * Formula: marginPercent = ((unitSales - unitCost) / unitSales) * 100
 */
export function calculateFromSales(unitCost: number, unitSales: number): number {
  if (unitSales <= 0) return 0
  if (unitSales <= unitCost) return 0
  return ((unitSales - unitCost) / unitSales) * 100
}

/**
 * Calculate totals for a single line
 */
export function calculateLineTotals(
  quantity: number,
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
  const totalCost = round(quantity * unitCost, 4)
  const totalSales = round(quantity * unitSales, 4)
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
      const qty = parseFloat(line.quantity) || 0
      const cost = parseFloat(line.unitCost) || 0
      const sales = parseFloat(line.unitSales) || 0

      return {
        totalCost: acc.totalCost + qty * cost,
        totalSales: acc.totalSales + qty * sales,
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
   * Recalculate line values when quantity changes
   * Quantity doesn't affect margin/sales, but we include this for consistency
   */
  const recalculateFromQuantity = useCallback(
    (_line: QuoteLine, newQuantity: number): Partial<QuoteLine> => {
      return {
        quantity: newQuantity.toString(),
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
        case 'quantity': {
          const additionalUpdates = recalculateFromQuantity(line, Number(value))
          return { ...updates, ...additionalUpdates }
        }
        default:
          return updates
      }
    },
    [recalculateFromMargin, recalculateFromSales, recalculateFromQuantity]
  )

  return {
    // Individual recalculation functions
    recalculateFromMargin,
    recalculateFromSales,
    recalculateFromQuantity,

    // Unified calculation applier
    applyCalculation,

    // Static calculation functions (for use outside component)
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
