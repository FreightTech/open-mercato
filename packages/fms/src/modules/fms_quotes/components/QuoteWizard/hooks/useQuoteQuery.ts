'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { Quote, QuoteWizardMode, CreateQuoteResponse } from '../types/quote-wizard'

// =============================================================================
// Default Draft Quote
// =============================================================================

export const createDefaultQuote = (): Quote => ({
  id: 'draft',
  quoteNumber: null,
  clientId: null,
  clientName: null,
  assignedToId: null,
  assignedTo: null,
  status: 'draft',
  direction: null,
  modes: [],
  originPorts: [],
  destinationPorts: [],
  currencyCode: 'USD',
})

// =============================================================================
// Query Keys
// =============================================================================

export const quoteKeys = {
  all: ['quote'] as const,
  detail: (id: string | null) => ['quote', id ?? 'draft'] as const,
}

// =============================================================================
// Fetch Quote
// =============================================================================

async function fetchQuote(quoteId: string): Promise<Quote> {
  const response = await apiCall<Quote>(`/api/fms_quotes/${quoteId}`)
  if (!response.ok) throw new Error('Failed to load quote')
  if (!response.result) throw new Error('Quote not found')
  return response.result
}

// =============================================================================
// useQuoteQuery Hook
// =============================================================================

type UseQuoteQueryOptions = {
  quoteId: string | null
  mode: QuoteWizardMode
  onError?: (error: string) => void
}

export function useQuoteQuery({ quoteId, mode, onError }: UseQuoteQueryOptions) {
  const queryClient = useQueryClient()
  const queryKey = quoteKeys.detail(quoteId)

  // Quote query - works for both new (draft) and edit modes
  const {
    data: quote,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!quoteId || quoteId === 'draft') {
        // Return default draft quote (not persisted)
        return createDefaultQuote()
      }
      return fetchQuote(quoteId)
    },
    staleTime: mode === 'new' ? Infinity : 30_000, // Draft never stales
    gcTime: mode === 'new' ? Infinity : 5 * 60 * 1000, // 5 minutes for edit mode
  })

  // Update quote mutation (for edit mode)
  const updateQuoteMutation = useMutation({
    mutationFn: async (updates: Partial<Quote>) => {
      if (!quoteId || quoteId === 'draft') {
        throw new Error('Cannot update unsaved draft')
      }

      const response = await apiCall<Quote>(`/api/fms_quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) throw new Error('Failed to update quote')
      return response.result
    },
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous value
      const previous = queryClient.getQueryData<Quote>(queryKey)

      // Optimistic update
      if (previous) {
        queryClient.setQueryData<Quote>(queryKey, { ...previous, ...updates })
      }

      return { previous }
    },
    onError: (err, _updates, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData<Quote>(queryKey, context.previous)
      }
      onError?.(err instanceof Error ? err.message : 'Failed to update quote')
    },
    // Note: We intentionally don't invalidate or refetch after success.
    // The optimistic update in onMutate already sets the correct state,
    // and refetching would cause the UI to flicker/reload with potentially
    // differently formatted data from the server.
  })

  // Create quote mutation (for new mode)
  const createQuoteMutation = useMutation({
    mutationFn: async (
      data: { originPortIds?: string[]; destinationPortIds?: string[] } & Partial<Quote>
    ): Promise<CreateQuoteResponse> => {
      const payload: Record<string, unknown> = {
        status: 'draft',
        currencyCode: data.currencyCode || 'USD',
      }

      if (data.clientId) payload.clientId = data.clientId
      if (data.clientName) payload.clientName = data.clientName
      if (data.direction) payload.direction = data.direction
      if (data.assignedToId) payload.assignedToId = data.assignedToId
      if (data.modes && data.modes.length > 0) {
        payload.modes = data.modes
      }
      if (data.originPortIds && data.originPortIds.length > 0) {
        payload.originPortIds = data.originPortIds
      }
      if (data.destinationPortIds && data.destinationPortIds.length > 0) {
        payload.destinationPortIds = data.destinationPortIds
      }

      const response = await apiCall<CreateQuoteResponse>('/api/fms_quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error(response.result?.error || 'Failed to create quote')
      if (!response.result?.id) throw new Error('No quote ID returned')

      return response.result
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to create quote')
    },
  })

  // Update draft quote data locally (for new mode before persistence)
  const updateDraftLocally = (updates: Partial<Quote>) => {
    const current = queryClient.getQueryData<Quote>(quoteKeys.detail(null)) ?? createDefaultQuote()
    queryClient.setQueryData<Quote>(quoteKeys.detail(null), { ...current, ...updates })
  }

  // Migrate draft to persisted quote
  const migrateDraftToPersistedQuote = (newQuoteId: string, quoteData: Partial<Quote>) => {
    // Get current draft data
    const draftData = queryClient.getQueryData<Quote>(quoteKeys.detail(null))

    // Set data under new ID
    if (draftData) {
      queryClient.setQueryData<Quote>(quoteKeys.detail(newQuoteId), {
        ...draftData,
        ...quoteData,
        id: newQuoteId,
      })
    }

    // Remove draft query
    queryClient.removeQueries({ queryKey: quoteKeys.detail(null) })
  }

  return {
    quote: quote ?? null,
    isLoading,
    error,
    refetch,

    // Mutations
    updateQuote: updateQuoteMutation.mutate,
    updateQuoteAsync: updateQuoteMutation.mutateAsync,
    isUpdating: updateQuoteMutation.isPending,
    isUpdateError: updateQuoteMutation.isError,
    isUpdateSuccess: updateQuoteMutation.isSuccess,
    resetUpdateStatus: updateQuoteMutation.reset,

    createQuote: createQuoteMutation.mutate,
    createQuoteAsync: createQuoteMutation.mutateAsync,
    isCreating: createQuoteMutation.isPending,

    // Local updates for draft mode
    updateDraftLocally,
    migrateDraftToPersistedQuote,
  }
}
