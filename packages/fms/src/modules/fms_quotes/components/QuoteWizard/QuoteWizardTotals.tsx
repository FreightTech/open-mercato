'use client'

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { SimpleTooltip, TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { FileText } from 'lucide-react'
import { useQuoteWizardContext } from './hooks/useQuoteWizardContext'
import type { QuoteLine } from './types/quote-wizard'

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
 * QuoteWizardTotals - Simplified footer with only the Create Offer button
 */
export function QuoteWizardTotals({ lines, onCreateOffer }: QuoteWizardTotalsProps) {
  const isDisabled = lines.length === 0

  return (
    <TooltipProvider>
      <div className="py-3 px-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-end">
          {/* Create Offer Button */}
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
