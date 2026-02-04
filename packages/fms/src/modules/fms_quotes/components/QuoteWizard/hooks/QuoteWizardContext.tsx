'use client'

import * as React from 'react'
import { createContext, useState, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type {
  Quote,
  QuoteLine,
  DraftLine,
  NewLineData,
  QuoteWizardMode,
  QuoteWizardContextValue,
  QuoteWizardProviderProps,
  ProductSearchResult,
  UIState,
  SaveStatus,
} from '../types/quote-wizard'
import { useQuoteQuery, quoteKeys, createDefaultQuote } from './useQuoteQuery'
import { useQuoteLinesQuery, quoteLinesKeys } from './useQuoteLinesQuery'
import { useLineUpdates } from './useLineUpdates'
import { useQuoteCalculations, useQuoteTotals } from './useQuoteCalculations'

// =============================================================================
// Context
// =============================================================================

export const QuoteWizardContext = createContext<QuoteWizardContextValue | null>(null)

// =============================================================================
// Initial UI State
// =============================================================================

const initialUIState: UIState = {
  showProductSearch: false,
  selectedProduct: null,
  showCreateOfferDrawer: false,
  showCustomProductModal: false,
  showDiscardDialog: false,
  contextPanelOpen: true,
  continueAddingMode: false,
  error: null,
}

// =============================================================================
// QuoteWizardProvider
//
// Main provider that consolidates all quote wizard state management.
//
// NEW MODE: Pure useState - no React Query cache, no auto-save
// EDIT MODE: React Query for server state with debounced updates
// =============================================================================

export function QuoteWizardProvider({
  quoteId,
  mode,
  children,
  onQuoteCreated,
  onClose,
}: QuoteWizardProviderProps) {
  const queryClient = useQueryClient()

  // ==========================================================================
  // Refs
  // ==========================================================================
  const lineCounterRef = useRef(0)

  // ==========================================================================
  // NEW MODE: Pure useState for draft data
  // This avoids all React Query cache complexity for new quotes
  // ==========================================================================
  const [draftQuote, setDraftQuote] = useState<Quote>(() => createDefaultQuote())
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [persistedQuoteId, setPersistedQuoteId] = useState<string | null>(null)

  // ==========================================================================
  // Determine if we're in NEW mode (pure in-memory state)
  // NEW MODE: Uses draft state for display throughout the entire session
  // After saving, mutations go to server but display stays on draft state
  // ==========================================================================
  const effectiveQuoteId = quoteId || persistedQuoteId
  // True for the entire "new quote" session - keeps using draft state for display
  // This prevents UI reload when saving (we don't switch to fetchedQuote/fetchedLines)
  const isNewMode = mode === 'new' && !quoteId

  // ==========================================================================
  // UI State (shared between both modes)
  // ==========================================================================
  const [uiState, setUIState] = useState<UIState>(initialUIState)

  const setError = useCallback((error: string | null) => {
    setUIState((prev) => ({ ...prev, error }))
  }, [])

  // ==========================================================================
  // EDIT MODE: Server State Queries (only used when editing existing quotes)
  // In new mode, we use draft state exclusively - no server queries
  // ==========================================================================

  // Quote query (only for edit mode - NOT for new mode even after saving)
  const {
    quote: fetchedQuote,
    isLoading: isLoadingQuote,
    updateQuote: serverUpdateQuote,
    isUpdating: isUpdatingQuote,
    isUpdateError: isQuoteUpdateError,
    isUpdateSuccess: isQuoteUpdateSuccess,
  } = useQuoteQuery({
    quoteId: isNewMode ? null : quoteId,
    mode,
    onError: setError,
  })

  // Lines query (for edit mode AND persisted new quotes)
  const {
    lines: fetchedLines,
    isLoading: isLoadingLines,
    createLineAsync,
    isCreating: isCreatingLine,
    isDeleting: isDeletingLine,
  } = useQuoteLinesQuery({
    quoteId: isNewMode ? null : effectiveQuoteId,
    onError: setError,
  })

  // Line updates with debouncing (for edit mode AND persisted new quotes)
  const {
    queueUpdate,
    forceSave: forceLineSave,
    saveStatus: lineSaveStatus,
    hasPendingChanges: hasLinesPendingChanges,
  } = useLineUpdates({
    quoteId: isNewMode ? null : effectiveQuoteId,
    onError: setError,
  })

  // ==========================================================================
  // Calculations
  // ==========================================================================
  const { applyCalculation } = useQuoteCalculations()

  // ==========================================================================
  // Derived State: Quote and Lines
  // ==========================================================================

  // Quote - use draft for new mode, fetched for edit mode
  const quote = useMemo(() => {
    if (isNewMode) {
      return draftQuote
    }
    return fetchedQuote ?? null
  }, [isNewMode, draftQuote, fetchedQuote])

  // Lines - use draft lines for new mode, fetched for edit mode
  const lines: QuoteLine[] = useMemo(() => {
    if (isNewMode) {
      // Convert draft lines to QuoteLine format
      // Use realId if available (after saving), otherwise use tempId
      return draftLines.map((line) => ({
        id: line.realId || line.tempId,
        lineNumber: line.lineNumber,
        productId: line.productId,
        variantId: line.variantId,
        providerId: line.providerId,
        productName: line.productName,
        chargeCode: line.chargeCode,
        productType: line.productType,
        containerSize: line.containerSize,
        reference: line.reference,
        originLocationId: line.originLocationId,
        destinationLocationId: line.destinationLocationId,
        origin: line.origin,
        destination: line.destination,
        validityStart: line.validityStart,
        validityEnd: line.validityEnd,
        currencyCode: line.currencyCode,
        unitCost: line.unitCost,
        marginPercent: line.marginPercent,
        unitSales: line.unitSales,
      }))
    }
    return fetchedLines
  }, [isNewMode, draftLines, fetchedLines])

  // Calculate totals
  const totals = useQuoteTotals(lines)

  // ==========================================================================
  // NEW MODE: Save Function
  // Creates quote + all lines in a single operation
  // ==========================================================================

  const handleSave = useCallback(async (): Promise<string | null> => {
    if (!isNewMode) {
      // Edit mode - just force save pending changes
      await forceLineSave()
      return effectiveQuoteId
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      // 1. Prepare quote data
      const payload: Record<string, unknown> = {
        status: draftQuote.status || 'draft',
        currencyCode: draftQuote.currencyCode || 'USD',
      }

      if (draftQuote.clientId) payload.clientId = draftQuote.clientId
      if (draftQuote.clientName) payload.clientName = draftQuote.clientName
      if (draftQuote.direction) payload.direction = draftQuote.direction
      if (draftQuote.operationalGuardianId) payload.operationalGuardianId = draftQuote.operationalGuardianId
      if (draftQuote.businessGuardianId) payload.businessGuardianId = draftQuote.businessGuardianId
      if (draftQuote.originPorts && draftQuote.originPorts.length > 0) {
        payload.originPortIds = draftQuote.originPorts.map((p) => p.id)
      }
      if (draftQuote.destinationPorts && draftQuote.destinationPorts.length > 0) {
        payload.destinationPortIds = draftQuote.destinationPorts.map((p) => p.id)
      }

      // 2. Create quote
      const quoteResponse = await apiCall<{ id: string; quoteNumber?: string }>(
        '/api/fms_quotes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!quoteResponse.ok || !quoteResponse.result?.id) {
        throw new Error('Failed to create quote')
      }

      const newQuoteId = quoteResponse.result.id

      // 3. Create all lines and capture their real IDs
      if (draftLines.length > 0) {
        const lineResults = await Promise.all(
          draftLines.map(async (line) => {
            const response = await apiCall<{ id: string }>('/api/fms_quotes/quote-lines', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quoteId: newQuoteId,
                productId: line.productId,
                variantId: line.variantId,
                providerId: line.providerId,
                productName: line.productName,
                chargeCode: line.chargeCode,
                productType: line.productType,
                containerSize: line.containerSize,
                reference: line.reference,
                originLocationId: line.originLocationId,
                destinationLocationId: line.destinationLocationId,
                validityStart: line.validityStart,
                validityEnd: line.validityEnd,
                unitCost: line.unitCost,
                currencyCode: line.currencyCode,
                marginPercent: line.marginPercent,
                unitSales: line.unitSales,
              }),
            })
            return {
              tempId: line.tempId,
              realId: response.ok && response.result?.id ? response.result.id : null,
            }
          })
        )

        // 4. Update draft lines with their real IDs from the server
        const idMap = new Map(
          lineResults
            .filter((r): r is { tempId: string; realId: string } => r.realId !== null)
            .map((r) => [r.tempId, r.realId])
        )
        if (idMap.size > 0) {
          setDraftLines((currentLines) =>
            currentLines.map((line) => ({
              ...line,
              realId: idMap.get(line.tempId) || line.realId,
            }))
          )
        }
      }

      // 5. Update draft with server-assigned ID and quote number
      setDraftQuote((prev) => ({
        ...prev,
        id: newQuoteId,
        quoteNumber: quoteResponse.result?.quoteNumber || null,
      }))

      // 6. Mark as saved, set persisted ID, and notify
      // NOTE: We do NOT invalidate queries - we keep using draft state to avoid UI reload
      setIsDirty(false)
      setPersistedQuoteId(newQuoteId)

      onQuoteCreated?.(newQuoteId)

      return newQuoteId
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save quote'
      setSaveError(errorMessage)
      setError(errorMessage)
      return null
    } finally {
      setIsSaving(false)
    }
  }, [isNewMode, draftQuote, draftLines, forceLineSave, effectiveQuoteId, onQuoteCreated, setError, queryClient])

  // ==========================================================================
  // Actions: Update Quote
  // ==========================================================================

  const updateQuote = useCallback(
    (updates: Partial<Quote>) => {
      // Extract port IDs if present (used for API calls)
      let originPortIds: string[] | undefined
      let destinationPortIds: string[] | undefined
      const updatesClean = { ...updates } as Record<string, unknown>

      if ('originPortIds' in updatesClean) {
        originPortIds = updatesClean.originPortIds as string[]
        delete updatesClean.originPortIds
      }

      if ('destinationPortIds' in updatesClean) {
        destinationPortIds = updatesClean.destinationPortIds as string[]
        delete updatesClean.destinationPortIds
      }

      if (isNewMode) {
        // NEW MODE: Simply update useState - no cache, no auto-save
        setDraftQuote((prev) => ({ ...prev, ...updatesClean } as Quote))
        setIsDirty(true)
      } else if (effectiveQuoteId) {
        // EDIT MODE (or after saving): Send update to server via React Query
        serverUpdateQuote({
          ...updatesClean,
          ...(originPortIds && { originPortIds }),
          ...(destinationPortIds && { destinationPortIds }),
        } as Partial<Quote>)
      }
    },
    [isNewMode, effectiveQuoteId, serverUpdateQuote]
  )

  // ==========================================================================
  // Actions: Add Line
  // ==========================================================================

  const addLine = useCallback(
    async (lineData: NewLineData): Promise<QuoteLine | DraftLine> => {
      lineCounterRef.current += 1

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const newDraftLine: DraftLine = {
        ...lineData,
        tempId,
        lineNumber: lineCounterRef.current,
      }

      if (isNewMode) {
        // NEW MODE: Always add to draft lines for display
        setDraftLines((prev) => [...prev, newDraftLine])
        setIsDirty(true)

        // If quote is already persisted, also save to server
        if (effectiveQuoteId) {
          try {
            const response = await apiCall<{ id: string }>('/api/fms_quotes/quote-lines', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quoteId: effectiveQuoteId,
                ...lineData,
              }),
            })
            // Update the draft line with its real ID
            if (response.ok && response.result?.id) {
              setDraftLines((prev) =>
                prev.map((line) =>
                  line.tempId === tempId ? { ...line, realId: response.result!.id } : line
                )
              )
            }
          } catch (err) {
            setError('Failed to save quote line')
          }
        }

        return newDraftLine
      } else if (effectiveQuoteId) {
        // EDIT MODE: Create on server via React Query
        try {
          const result = await createLineAsync({
            quoteId: effectiveQuoteId,
            ...lineData,
          })
          if (result) {
            return result
          }
        } catch (err) {
          setError('Failed to save quote line')
        }
      }

      return newDraftLine
    },
    [isNewMode, effectiveQuoteId, createLineAsync, setError]
  )

  // ==========================================================================
  // Actions: Update Line
  // ==========================================================================

  const updateLine = useCallback(
    (lineId: string, field: string, value: unknown) => {
      if (isNewMode) {
        // NEW MODE: Update in draft lines for display
        let updatedRealId: string | undefined
        let calculatedUpdates: Record<string, unknown> = {}

        setDraftLines((prev) =>
          prev.map((line) => {
            // Match by either tempId or realId (realId is set after saving)
            if (line.tempId === lineId || line.realId === lineId) {
              // Apply calculations
              const lineAsQuote: QuoteLine = {
                id: line.realId || line.tempId,
                lineNumber: line.lineNumber,
                productId: line.productId,
                variantId: line.variantId,
                providerId: line.providerId,
                productName: line.productName,
                chargeCode: line.chargeCode,
                productType: line.productType,
                containerSize: line.containerSize,
                reference: line.reference,
                originLocationId: line.originLocationId,
                destinationLocationId: line.destinationLocationId,
                origin: line.origin,
                destination: line.destination,
                validityStart: line.validityStart,
                validityEnd: line.validityEnd,
                currencyCode: line.currencyCode,
                unitCost: line.unitCost,
                marginPercent: line.marginPercent,
                unitSales: line.unitSales,
              }
              calculatedUpdates = applyCalculation(lineAsQuote, field, value)
              updatedRealId = line.realId
              return { ...line, ...calculatedUpdates }
            }
            return line
          })
        )
        setIsDirty(true)

        // If quote is persisted and line has a real ID, sync to server
        if (effectiveQuoteId && updatedRealId) {
          queueUpdate(updatedRealId, calculatedUpdates)
        }
      } else {
        // EDIT MODE: Queue update with debouncing
        const line = fetchedLines.find((l) => l.id === lineId)
        if (line) {
          const updates = applyCalculation(line, field, value)
          queueUpdate(lineId, updates)
        }
      }
    },
    [isNewMode, effectiveQuoteId, fetchedLines, applyCalculation, queueUpdate]
  )

  // ==========================================================================
  // Actions: Remove Line
  // ==========================================================================

  const removeLine = useCallback(
    async (lineId: string) => {
      if (isNewMode) {
        // NEW MODE: Find the line to get its realId before removing
        const lineToRemove = draftLines.find(
          (l) => l.tempId === lineId || l.realId === lineId
        )
        const realIdToDelete = lineToRemove?.realId

        // Remove from draft lines (match by either tempId or realId)
        setDraftLines((prev) =>
          prev.filter((l) => l.tempId !== lineId && l.realId !== lineId)
        )
        setIsDirty(true)

        // If line was persisted to server, also delete there
        if (realIdToDelete) {
          try {
            await apiCall(`/api/fms_quotes/quote-lines/${realIdToDelete}`, {
              method: 'DELETE',
            })
            // NOTE: No query invalidation - we use draft state for display
          } catch (err) {
            setError('Failed to delete quote line from server')
          }
        }
      } else if (effectiveQuoteId) {
        // EDIT MODE: Delete from server and invalidate query
        try {
          await apiCall(`/api/fms_quotes/quote-lines/${lineId}`, {
            method: 'DELETE',
          })
          queryClient.invalidateQueries({
            queryKey: quoteLinesKeys.list(effectiveQuoteId),
          })
        } catch (err) {
          setError('Failed to delete quote line')
        }
      }
    },
    [isNewMode, draftLines, effectiveQuoteId, queryClient, setError]
  )

  // ==========================================================================
  // Actions: Force Save (for edit mode)
  // ==========================================================================

  const forceSave = useCallback(async () => {
    if (isNewMode) {
      await handleSave()
    } else {
      await forceLineSave()
    }
  }, [isNewMode, handleSave, forceLineSave])

  // ==========================================================================
  // Actions: Reset Draft
  // ==========================================================================

  const resetDraft = useCallback(() => {
    setDraftQuote(createDefaultQuote())
    setDraftLines([])
    setIsDirty(false)
    setIsSaving(false)
    setSaveError(null)
    setPersistedQuoteId(null)
    lineCounterRef.current = 0
    setUIState(initialUIState)
  }, [])

  // ==========================================================================
  // UI Actions
  // ==========================================================================

  const openProductSearch = useCallback(() => {
    setUIState((prev) => ({ ...prev, showProductSearch: true }))
  }, [])

  const closeProductSearch = useCallback(() => {
    setUIState((prev) => ({
      ...prev,
      showProductSearch: false,
      continueAddingMode: false,
    }))
  }, [])

  const selectProduct = useCallback((product: ProductSearchResult | null) => {
    setUIState((prev) => ({ ...prev, selectedProduct: product }))
  }, [])

  const openCreateOfferDrawer = useCallback(() => {
    setUIState((prev) => ({ ...prev, showCreateOfferDrawer: true }))
  }, [])

  const closeCreateOfferDrawer = useCallback(() => {
    setUIState((prev) => ({ ...prev, showCreateOfferDrawer: false }))
  }, [])

  const openCustomProductModal = useCallback(() => {
    setUIState((prev) => ({ ...prev, showCustomProductModal: true }))
  }, [])

  const closeCustomProductModal = useCallback(() => {
    setUIState((prev) => ({ ...prev, showCustomProductModal: false }))
  }, [])

  const openDiscardDialog = useCallback(() => {
    setUIState((prev) => ({ ...prev, showDiscardDialog: true }))
  }, [])

  const closeDiscardDialog = useCallback(() => {
    setUIState((prev) => ({ ...prev, showDiscardDialog: false }))
  }, [])

  const toggleContextPanel = useCallback(() => {
    setUIState((prev) => ({ ...prev, contextPanelOpen: !prev.contextPanelOpen }))
  }, [])

  const setContinueAddingMode = useCallback((mode: boolean) => {
    setUIState((prev) => ({ ...prev, continueAddingMode: mode }))
  }, [])

  // ==========================================================================
  // Determine save status
  // ==========================================================================

  const saveStatus: SaveStatus = useMemo(() => {
    if (isNewMode) {
      if (isSaving) return 'saving'
      if (saveError) return 'error'
      return 'idle'
    }
    // Edit mode: combine quote header and line save statuses
    if (isUpdatingQuote || lineSaveStatus === 'saving') return 'saving'
    if (isQuoteUpdateError || lineSaveStatus === 'error') return 'error'
    if (isQuoteUpdateSuccess || lineSaveStatus === 'saved') return 'saved'
    return 'idle'
  }, [isNewMode, isSaving, saveError, isUpdatingQuote, isQuoteUpdateError, isQuoteUpdateSuccess, lineSaveStatus])

  const hasPendingChanges = useMemo(() => {
    if (isNewMode) {
      return isDirty
    }
    return hasLinesPendingChanges
  }, [isNewMode, isDirty, hasLinesPendingChanges])

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const contextValue: QuoteWizardContextValue = useMemo(
    () => ({
      // Mode
      mode,

      // Server state
      quote,
      lines,
      isLoadingQuote: isNewMode ? false : isLoadingQuote,
      isLoadingLines: isNewMode ? false : isLoadingLines,

      // Draft state - use computed effectiveQuoteId which includes persistedQuoteId
      effectiveQuoteId,
      isDirty,
      persistedQuoteId,

      // Save status
      saveStatus,
      hasPendingChanges,
      isCreating: isSaving || isCreatingLine,
      isDeleting: isDeletingLine,

      // Derived state
      totals,

      // UI state
      ui: uiState,

      // Actions
      updateQuote,
      addLine,
      updateLine,
      removeLine,
      forceSave,
      resetDraft,
      handleSave, // Explicit save for new mode

      // UI actions
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
    }),
    [
      mode,
      quote,
      lines,
      isLoadingQuote,
      isLoadingLines,
      isNewMode,
      effectiveQuoteId,
      persistedQuoteId,
      isDirty,
      saveStatus,
      hasPendingChanges,
      isSaving,
      isCreatingLine,
      isDeletingLine,
      totals,
      uiState,
      updateQuote,
      addLine,
      updateLine,
      removeLine,
      forceSave,
      resetDraft,
      handleSave,
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
    ]
  )

  return (
    <QuoteWizardContext.Provider value={contextValue}>
      {children}
    </QuoteWizardContext.Provider>
  )
}
