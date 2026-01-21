'use client'

import { useContext } from 'react'
import { QuoteWizardContext } from './QuoteWizardContext'
import type { QuoteWizardContextValue } from '../types/quote-wizard'

/**
 * Hook to access the QuoteWizard context.
 *
 * Must be used within a QuoteWizardProvider.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { quote, lines, updateQuote, addLine } = useQuoteWizardContext()
 *   // ...
 * }
 * ```
 */
export function useQuoteWizardContext(): QuoteWizardContextValue {
  const context = useContext(QuoteWizardContext)

  if (!context) {
    throw new Error(
      'useQuoteWizardContext must be used within a QuoteWizardProvider. ' +
        'Make sure your component is wrapped with QuoteWizardProvider.'
    )
  }

  return context
}

// =============================================================================
// Selector Hooks
//
// These hooks provide access to specific parts of the context,
// which can help with performance by reducing unnecessary re-renders.
// =============================================================================

/**
 * Hook to access only the quote data
 */
export function useQuote() {
  const { quote, isLoadingQuote, updateQuote } = useQuoteWizardContext()
  return { quote, isLoadingQuote, updateQuote }
}

/**
 * Hook to access only the lines data
 */
export function useQuoteLines() {
  const { lines, isLoadingLines, addLine, updateLine, removeLine } = useQuoteWizardContext()
  return { lines, isLoadingLines, addLine, updateLine, removeLine }
}

/**
 * Hook to access the totals
 */
export function useQuoteTotalsFromContext() {
  const { totals } = useQuoteWizardContext()
  return totals
}

/**
 * Hook to access save status
 */
export function useSaveStatus() {
  const { saveStatus, hasPendingChanges, forceSave, isCreating, isDeleting } =
    useQuoteWizardContext()
  return { saveStatus, hasPendingChanges, forceSave, isCreating, isDeleting }
}

/**
 * Hook to access UI state and actions
 */
export function useQuoteWizardUI() {
  const {
    ui,
    openProductSearch,
    closeProductSearch,
    selectProduct,
    setError,
    openCreateOfferDrawer,
    closeCreateOfferDrawer,
    openCustomProductModal,
    closeCustomProductModal,
    openDiscardDialog,
    closeDiscardDialog,
    toggleContextPanel,
    setContinueAddingMode,
  } = useQuoteWizardContext()

  return {
    ui,
    openProductSearch,
    closeProductSearch,
    selectProduct,
    setError,
    openCreateOfferDrawer,
    closeCreateOfferDrawer,
    openCustomProductModal,
    closeCustomProductModal,
    openDiscardDialog,
    closeDiscardDialog,
    toggleContextPanel,
    setContinueAddingMode,
  }
}

/**
 * Hook to access draft-specific state
 */
export function useDraftState() {
  const { mode, effectiveQuoteId, isDirty, persistedQuoteId, resetDraft } =
    useQuoteWizardContext()
  return { mode, effectiveQuoteId, isDirty, persistedQuoteId, resetDraft }
}
