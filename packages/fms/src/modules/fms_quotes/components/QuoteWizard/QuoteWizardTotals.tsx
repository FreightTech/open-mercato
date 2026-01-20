'use client'

import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { SimpleTooltip, TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { FileText } from 'lucide-react'
import { useQuoteWizardContext } from './hooks/useQuoteWizardContext'
import type { QuoteTotals } from './types/quote-wizard'

// =============================================================================
// Props-based component (for backward compatibility)
// =============================================================================

type QuoteWizardTotalsProps = {
  totals: QuoteTotals
  currency: string
  onCreateOffer?: () => void
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

/**
 * QuoteWizardTotals - Displays quote summary metrics
 *
 * Can be used in two modes:
 * 1. Props-based: Pass totals, currency, and onCreateOffer directly
 * 2. Context-based: Uses QuoteWizardContext (no props needed)
 */
export function QuoteWizardTotals({ totals, currency, onCreateOffer }: QuoteWizardTotalsProps) {
  const isLowMargin = totals.averageMargin < 5 && totals.averageMargin >= 0
  const isNegativeMargin = totals.averageMargin < 0
  const isDisabled = totals.lineCount === 0

  return (
    <TooltipProvider>
      <div className="py-3 px-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-sm">
              <span className="text-muted-foreground">Lines: </span>
              <span className="font-medium">{totals.lineCount}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Total Cost: </span>
              <span className="font-medium">{formatCurrency(totals.totalCost, currency)}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-sm">
              <span className="text-muted-foreground">Avg Margin: </span>
              <span
                className={cn(
                  'font-medium',
                  isNegativeMargin && 'text-red-600',
                  isLowMargin && !isNegativeMargin && 'text-amber-600'
                )}
              >
                {formatPercent(totals.averageMargin)}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Profit: </span>
              <span
                className={cn(
                  'font-medium',
                  totals.totalProfit < 0 && 'text-red-600',
                  totals.totalProfit > 0 && 'text-green-600'
                )}
              >
                {formatCurrency(totals.totalProfit, currency)}
              </span>
            </div>
            <div className="text-base">
              <span className="text-muted-foreground">Total Sales: </span>
              <span className="font-bold text-lg">
                {formatCurrency(totals.totalSales, currency)}
              </span>
            </div>
            {onCreateOffer && (
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
            )}
          </div>
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
 * This component automatically gets totals, currency, and actions from context.
 */
export function QuoteWizardTotalsConnected() {
  const { quote, totals, effectiveQuoteId, openCreateOfferDrawer } = useQuoteWizardContext()

  return (
    <QuoteWizardTotals
      totals={totals}
      currency={quote?.currencyCode || 'USD'}
      onCreateOffer={effectiveQuoteId ? openCreateOfferDrawer : undefined}
    />
  )
}
