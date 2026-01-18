'use client'

import { useState, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { Quote, PortRef } from './useQuoteWizard'
import type { QuoteLine } from './useCalculations'
import { useCalculations, calculateQuoteTotals } from './useCalculations'

type DraftLine = {
  tempId: string
  realId?: string // Real ID from database once persisted
  lineNumber: number
  productId?: string | null
  variantId?: string | null
  priceId?: string | null
  productName: string
  chargeCode?: string | null
  productType?: string | null
  providerName?: string | null
  containerSize?: string | null
  contractType?: string | null
  quantity: string
  unitCost: string
  currencyCode: string
  marginPercent: string
  unitSales: string
}

type UseNewQuoteWizardOptions = {
  onError?: (error: string) => void
  onQuoteCreated?: (quoteId: string) => void
}

const defaultDraftQuote: Omit<Quote, 'id'> & { id: string } = {
  id: 'new',
  quoteNumber: null,
  clientId: null,
  clientName: null,
  status: 'draft',
  direction: null,
  originPorts: [],
  destinationPorts: [],
  currencyCode: 'USD',
}

export function useNewQuoteWizard({ onError, onQuoteCreated }: UseNewQuoteWizardOptions) {
  const queryClient = useQueryClient()
  const [draftQuote, setDraftQuote] = useState<Quote>(defaultDraftQuote)
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [persistedQuoteId, setPersistedQuoteId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showProductSearch, setShowProductSearch] = useState(false)

  const isCreatingQuoteRef = useRef(false)
  const lineCounterRef = useRef(0)
  const persistedQuoteIdRef = useRef<string | null>(null) // Ref to access in callbacks

  const {
    recalculateFromMargin,
    recalculateFromSales,
    recalculateFromQuantity,
  } = useCalculations()

  // Mutation to create the quote
  const createQuoteMutation = useMutation({
    mutationFn: async (data: { originPortIds?: string[]; destinationPortIds?: string[] } & Partial<Quote>) => {
      console.log('[useNewQuoteWizard] createQuoteMutation.mutationFn called with:', data)

      const payload: Record<string, unknown> = {
        status: 'draft',
        currencyCode: data.currencyCode || 'USD',
      }

      if (data.clientId) payload.clientId = data.clientId
      if (data.clientName) payload.clientName = data.clientName
      if (data.direction) payload.direction = data.direction
      if (data.originPortIds && data.originPortIds.length > 0) payload.originPortIds = data.originPortIds
      if (data.destinationPortIds && data.destinationPortIds.length > 0) payload.destinationPortIds = data.destinationPortIds

      console.log('[useNewQuoteWizard] API payload:', payload)

      const response = await apiCall<{ id: string; error?: string }>('/api/fms_quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      console.log('[useNewQuoteWizard] API response:', response)

      if (!response.ok) throw new Error(response.result?.error || 'Failed to create quote')
      return response.result
    },
    onSuccess: async (result) => {
      console.log('[useNewQuoteWizard] createQuoteMutation.onSuccess:', result)
      if (result?.id) {
        setPersistedQuoteId(result.id)
        persistedQuoteIdRef.current = result.id

        // Persist any existing draft lines to the database
        setDraftLines(prev => {
          if (prev.length > 0) {
            console.log('[useNewQuoteWizard] Persisting draft lines:', prev.length)
            // Persist lines in background
            Promise.all(
              prev.map(async (line) => {
                const linePayload = {
                  quoteId: result.id,
                  productId: line.productId,
                  variantId: line.variantId,
                  priceId: line.priceId,
                  productName: line.productName,
                  chargeCode: line.chargeCode,
                  productType: line.productType,
                  providerName: line.providerName,
                  containerSize: line.containerSize,
                  contractType: line.contractType,
                  quantity: line.quantity,
                  unitCost: line.unitCost,
                  currencyCode: line.currencyCode,
                  marginPercent: line.marginPercent,
                  unitSales: line.unitSales,
                }
                const response = await apiCall<{ id: string }>('/api/fms_quotes/quote-lines', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(linePayload),
                })
                if (response.ok && response.result?.id) {
                  return { tempId: line.tempId, realId: response.result.id }
                }
                return null
              })
            ).then((results) => {
              // Update lines with real IDs
              const idMap = new Map(
                results.filter((r): r is { tempId: string; realId: string } => r !== null)
                  .map(r => [r.tempId, r.realId])
              )
              console.log('[useNewQuoteWizard] ID map from persisted lines:', Object.fromEntries(idMap))
              if (idMap.size > 0) {
                setDraftLines(currentLines =>
                  currentLines.map(line => ({
                    ...line,
                    realId: idMap.get(line.tempId) || line.realId,
                  }))
                )
                queryClient.invalidateQueries({ queryKey: ['quote-lines', result.id] })
              }
            }).catch(err => {
              console.error('[useNewQuoteWizard] Failed to persist lines:', err)
              onError?.('Failed to save some quote lines')
            })
          }
          return prev
        })

        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
        onQuoteCreated?.(result.id)
      }
    },
    onError: (err) => {
      console.error('[useNewQuoteWizard] createQuoteMutation.onError:', err)
      isCreatingQuoteRef.current = false
      setSaveStatus('error')
      onError?.(err instanceof Error ? err.message : 'Failed to create quote')
    },
  })

  // Create quote lazily on first meaningful edit
  const maybeCreateQuote = useCallback(async (currentDraft: Quote, portIds?: { originPortIds?: string[]; destinationPortIds?: string[] }) => {
    console.log('[useNewQuoteWizard] maybeCreateQuote called with:', {
      currentDraft,
      portIds,
      persistedQuoteId,
      isCreatingQuoteRef: isCreatingQuoteRef.current,
    })

    // Already persisted or already creating
    if (persistedQuoteId || isCreatingQuoteRef.current) {
      console.log('[useNewQuoteWizard] maybeCreateQuote: SKIPPED - already persisted or creating')
      return
    }

    // Check if this is a meaningful edit (client selected OR port added)
    const originPortIds = portIds?.originPortIds || currentDraft.originPorts?.map(p => p.id) || []
    const destinationPortIds = portIds?.destinationPortIds || currentDraft.destinationPorts?.map(p => p.id) || []

    console.log('[useNewQuoteWizard] maybeCreateQuote: computed port IDs:', {
      originPortIds,
      destinationPortIds,
    })

    const hasMeaningfulData =
      currentDraft.clientName ||
      originPortIds.length > 0 ||
      destinationPortIds.length > 0

    console.log('[useNewQuoteWizard] maybeCreateQuote: hasMeaningfulData =', hasMeaningfulData)

    if (!hasMeaningfulData) {
      console.log('[useNewQuoteWizard] maybeCreateQuote: SKIPPED - no meaningful data')
      return
    }

    console.log('[useNewQuoteWizard] maybeCreateQuote: PROCEEDING to create quote')
    isCreatingQuoteRef.current = true
    setSaveStatus('saving')

    await createQuoteMutation.mutateAsync({
      ...currentDraft,
      originPortIds,
      destinationPortIds,
    })
  }, [persistedQuoteId, createQuoteMutation])

  // Update draft quote - compatible with Quote type
  const updateQuote = useCallback((updates: Partial<Quote>) => {
    console.log('[useNewQuoteWizard] updateQuote called with:', updates)

    setIsDirty(true)

    // Extract port IDs if ports are being updated via IDs (but keep other updates intact)
    let originPortIds: string[] | undefined
    let destinationPortIds: string[] | undefined

    // Create a copy of updates to modify
    const updatesClean = { ...updates } as Record<string, unknown>

    // Handle originPortIds (sent from QuoteWizardHeader)
    if ('originPortIds' in updatesClean) {
      originPortIds = updatesClean.originPortIds as string[]
      console.log('[useNewQuoteWizard] updateQuote: extracted originPortIds:', originPortIds)
      delete updatesClean.originPortIds
    }

    // Handle destinationPortIds (sent from QuoteWizardHeader)
    if ('destinationPortIds' in updatesClean) {
      destinationPortIds = updatesClean.destinationPortIds as string[]
      console.log('[useNewQuoteWizard] updateQuote: extracted destinationPortIds:', destinationPortIds)
      delete updatesClean.destinationPortIds
    }

    console.log('[useNewQuoteWizard] updateQuote: updates after extraction:', updatesClean)
    console.log('[useNewQuoteWizard] updateQuote: port IDs to pass:', { originPortIds, destinationPortIds })

    setDraftQuote(prev => {
      const newDraft = { ...prev, ...updatesClean } as Quote
      console.log('[useNewQuoteWizard] updateQuote: newDraft =', newDraft)
      // Try to create quote if we have meaningful data
      maybeCreateQuote(newDraft, { originPortIds, destinationPortIds })
      return newDraft
    })
  }, [maybeCreateQuote])

  // Add a draft line - compatible with existing hook signature
  const addLine = useCallback(async (lineData: Omit<DraftLine, 'tempId' | 'lineNumber' | 'realId'>) => {
    setIsDirty(true)
    lineCounterRef.current += 1
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newLine: DraftLine = {
      ...lineData,
      tempId,
      lineNumber: lineCounterRef.current,
    }

    // If quote is already persisted, save line to database immediately
    const currentQuoteId = persistedQuoteIdRef.current
    if (currentQuoteId) {
      console.log('[useNewQuoteWizard] addLine: Quote already persisted, saving line to DB')
      const linePayload = {
        quoteId: currentQuoteId,
        productId: lineData.productId,
        variantId: lineData.variantId,
        priceId: lineData.priceId,
        productName: lineData.productName,
        chargeCode: lineData.chargeCode,
        productType: lineData.productType,
        providerName: lineData.providerName,
        containerSize: lineData.containerSize,
        contractType: lineData.contractType,
        quantity: lineData.quantity,
        unitCost: lineData.unitCost,
        currencyCode: lineData.currencyCode,
        marginPercent: lineData.marginPercent,
        unitSales: lineData.unitSales,
      }

      try {
        const response = await apiCall<{ id: string }>('/api/fms_quotes/quote-lines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(linePayload),
        })

        if (response.ok && response.result?.id) {
          newLine.realId = response.result.id
          console.log('[useNewQuoteWizard] addLine: Line saved with realId:', response.result.id)
          queryClient.invalidateQueries({ queryKey: ['quote-lines', currentQuoteId] })
        }
      } catch (err) {
        console.error('[useNewQuoteWizard] addLine: Failed to save line:', err)
        onError?.('Failed to save quote line')
      }
    } else {
      // If quote is not persisted yet, try to create the quote
      maybeCreateQuote(draftQuote)
    }

    setDraftLines(prev => [...prev, newLine])
    return newLine
  }, [draftQuote, maybeCreateQuote, queryClient, onError])

  // Update a draft line - compatible with existing hook signature (lineId, field, value)
  // lineId can be either tempId or realId
  const updateLine = useCallback((lineId: string, field: string, value: unknown) => {
    setDraftLines(prev => prev.map(line => {
      // Match by either tempId or realId
      if (line.tempId !== lineId && line.realId !== lineId) return line

      const updates: Partial<DraftLine> = { [field]: value }

      // Apply calculations based on which field changed
      if (field === 'marginPercent') {
        const lineAsQuoteLine: QuoteLine = {
          id: line.tempId,
          lineNumber: line.lineNumber,
          productId: line.productId,
          variantId: line.variantId,
          priceId: line.priceId,
          productName: line.productName,
          chargeCode: line.chargeCode,
          productType: line.productType,
          providerName: line.providerName,
          containerSize: line.containerSize,
          contractType: line.contractType,
          quantity: line.quantity,
          currencyCode: line.currencyCode,
          unitCost: line.unitCost,
          marginPercent: line.marginPercent,
          unitSales: line.unitSales,
        }
        const additionalUpdates = recalculateFromMargin(lineAsQuoteLine, Number(value))
        Object.assign(updates, additionalUpdates)
      } else if (field === 'unitSales') {
        const lineAsQuoteLine: QuoteLine = {
          id: line.tempId,
          lineNumber: line.lineNumber,
          productId: line.productId,
          variantId: line.variantId,
          priceId: line.priceId,
          productName: line.productName,
          chargeCode: line.chargeCode,
          productType: line.productType,
          providerName: line.providerName,
          containerSize: line.containerSize,
          contractType: line.contractType,
          quantity: line.quantity,
          currencyCode: line.currencyCode,
          unitCost: line.unitCost,
          marginPercent: line.marginPercent,
          unitSales: line.unitSales,
        }
        const additionalUpdates = recalculateFromSales(lineAsQuoteLine, Number(value))
        Object.assign(updates, additionalUpdates)
      } else if (field === 'quantity') {
        const lineAsQuoteLine: QuoteLine = {
          id: line.tempId,
          lineNumber: line.lineNumber,
          productId: line.productId,
          variantId: line.variantId,
          priceId: line.priceId,
          productName: line.productName,
          chargeCode: line.chargeCode,
          productType: line.productType,
          providerName: line.providerName,
          containerSize: line.containerSize,
          contractType: line.contractType,
          quantity: line.quantity,
          currencyCode: line.currencyCode,
          unitCost: line.unitCost,
          marginPercent: line.marginPercent,
          unitSales: line.unitSales,
        }
        const additionalUpdates = recalculateFromQuantity(lineAsQuoteLine, Number(value))
        Object.assign(updates, additionalUpdates)
      }

      return { ...line, ...updates }
    }))
  }, [recalculateFromMargin, recalculateFromSales, recalculateFromQuantity])

  // Remove a draft line
  // lineId can be either tempId or realId
  const removeLine = useCallback(async (lineId: string) => {
    // Find the line to check if it has a realId
    const lineToRemove = draftLines.find(line => line.tempId === lineId || line.realId === lineId)

    // If line was persisted to database, delete it there too
    if (lineToRemove?.realId) {
      console.log('[useNewQuoteWizard] removeLine: Deleting persisted line:', lineToRemove.realId)
      try {
        await apiCall(`/api/fms_quotes/quote-lines/${lineToRemove.realId}`, {
          method: 'DELETE',
        })
        if (persistedQuoteIdRef.current) {
          queryClient.invalidateQueries({ queryKey: ['quote-lines', persistedQuoteIdRef.current] })
        }
      } catch (err) {
        console.error('[useNewQuoteWizard] removeLine: Failed to delete line:', err)
        onError?.('Failed to delete quote line')
      }
    }

    setDraftLines(prev => prev.filter(line => line.tempId !== lineId && line.realId !== lineId))
  }, [draftLines, queryClient, onError])

  // Convert draft lines to QuoteLine format for display and calculation
  // Use realId if available (line persisted), otherwise use tempId
  const lines: QuoteLine[] = draftLines.map(line => ({
    id: line.realId || line.tempId,
    lineNumber: line.lineNumber,
    productId: line.productId,
    variantId: line.variantId,
    priceId: line.priceId,
    productName: line.productName,
    chargeCode: line.chargeCode,
    productType: line.productType,
    providerName: line.providerName,
    containerSize: line.containerSize,
    contractType: line.contractType,
    quantity: line.quantity,
    unitCost: line.unitCost,
    currencyCode: line.currencyCode,
    marginPercent: line.marginPercent,
    unitSales: line.unitSales,
  }))

  const totals = calculateQuoteTotals(lines)

  // Open/close product search
  const openProductSearch = useCallback(() => setShowProductSearch(true), [])
  const closeProductSearch = useCallback(() => setShowProductSearch(false), [])

  // Reset for close without save
  const resetDraft = useCallback(() => {
    setDraftQuote(defaultDraftQuote)
    setDraftLines([])
    setIsDirty(false)
    setPersistedQuoteId(null)
    persistedQuoteIdRef.current = null
    setSaveStatus('idle')
    isCreatingQuoteRef.current = false
    lineCounterRef.current = 0
  }, [])

  return {
    // Draft state
    draftQuote,
    draftLines,
    isDirty,
    persistedQuoteId,

    // Quote-like object for display
    quote: draftQuote,
    isLoadingQuote: false,
    updateQuote,

    // Lines
    lines,
    isLoadingLines: false,
    addLine,
    updateLine,
    removeLine,

    // Save status
    saveStatus,
    forceSave: async () => {}, // No-op for draft mode
    hasPendingChanges: isDirty && !persistedQuoteId,
    isCreating: createQuoteMutation.isPending,
    isDeleting: false,

    // Totals
    totals,

    // Product search
    showProductSearch,
    openProductSearch,
    closeProductSearch,

    // Reset
    resetDraft,
  }
}
