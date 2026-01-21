'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { QuoteLine, QuoteLinesResponse, NewLineData } from '../types/quote-wizard'

// =============================================================================
// Query Keys
// =============================================================================

export const quoteLinesKeys = {
  all: ['quote-lines'] as const,
  list: (quoteId: string | null) => ['quote-lines', quoteId ?? 'draft'] as const,
}

// =============================================================================
// Fetch Quote Lines
// =============================================================================

async function fetchQuoteLines(quoteId: string): Promise<QuoteLine[]> {
  const response = await apiCall<QuoteLinesResponse>(
    `/api/fms_quotes/quote-lines?quoteId=${quoteId}&limit=100`
  )
  if (!response.ok) throw new Error('Failed to load quote lines')
  return response.result?.items ?? []
}

// =============================================================================
// useQuoteLinesQuery Hook
// =============================================================================

type UseQuoteLinesQueryOptions = {
  quoteId: string | null
  onError?: (error: string) => void
}

export function useQuoteLinesQuery({ quoteId, onError }: UseQuoteLinesQueryOptions) {
  const queryClient = useQueryClient()
  const queryKey = quoteLinesKeys.list(quoteId)

  // Lines query
  const {
    data: lines,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!quoteId || quoteId === 'draft') {
        return [] // No lines for unpersisted draft
      }
      return fetchQuoteLines(quoteId)
    },
    staleTime: 30_000, // 30 seconds
  })

  // Create line mutation
  const createLineMutation = useMutation({
    mutationFn: async (lineData: NewLineData & { quoteId: string }): Promise<QuoteLine> => {
      const response = await apiCall<QuoteLine>('/api/fms_quotes/quote-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lineData),
      })

      if (!response.ok) throw new Error('Failed to create line')
      if (!response.result) throw new Error('No line data returned')

      return response.result
    },
    onSuccess: () => {
      if (quoteId) {
        queryClient.invalidateQueries({ queryKey: quoteLinesKeys.list(quoteId) })
      }
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to create line')
    },
  })

  // Update line mutation
  const updateLineMutation = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<QuoteLine>): Promise<QuoteLine> => {
      const response = await apiCall<QuoteLine>(`/api/fms_quotes/quote-lines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) throw new Error('Failed to update line')
      if (!response.result) throw new Error('No line data returned')

      return response.result
    },
    onMutate: async ({ id, ...updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous value
      const previous = queryClient.getQueryData<QuoteLine[]>(queryKey)

      // Optimistic update
      if (previous) {
        queryClient.setQueryData<QuoteLine[]>(
          queryKey,
          previous.map((line) => (line.id === id ? { ...line, ...updates } : line))
        )
      }

      return { previous }
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData<QuoteLine[]>(queryKey, context.previous)
      }
      onError?.(err instanceof Error ? err.message : 'Failed to update line')
    },
    onSettled: () => {
      if (quoteId) {
        queryClient.invalidateQueries({ queryKey: quoteLinesKeys.list(quoteId) })
      }
    },
  })

  // Delete line mutation
  const deleteLineMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiCall(`/api/fms_quotes/quote-lines/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete line')
    },
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous value
      const previous = queryClient.getQueryData<QuoteLine[]>(queryKey)

      // Optimistic update - remove the line
      if (previous) {
        queryClient.setQueryData<QuoteLine[]>(
          queryKey,
          previous.filter((line) => line.id !== id)
        )
      }

      return { previous }
    },
    onError: (err, _id, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData<QuoteLine[]>(queryKey, context.previous)
      }
      onError?.(err instanceof Error ? err.message : 'Failed to delete line')
    },
    onSettled: () => {
      if (quoteId) {
        queryClient.invalidateQueries({ queryKey: quoteLinesKeys.list(quoteId) })
      }
    },
  })

  // Helper to add line to local cache (for draft mode)
  const addLineLocally = (line: QuoteLine) => {
    const current = queryClient.getQueryData<QuoteLine[]>(quoteLinesKeys.list(null)) ?? []
    queryClient.setQueryData<QuoteLine[]>(quoteLinesKeys.list(null), [...current, line])
  }

  // Helper to update line in local cache (for draft mode)
  const updateLineLocally = (id: string, updates: Partial<QuoteLine>) => {
    const draftQueryKey = quoteLinesKeys.list(null)
    const current = queryClient.getQueryData<QuoteLine[]>(draftQueryKey) ?? []
    queryClient.setQueryData<QuoteLine[]>(
      draftQueryKey,
      current.map((line) => (line.id === id ? { ...line, ...updates } : line))
    )
  }

  // Helper to remove line from local cache (for draft mode)
  const removeLineLocally = (id: string) => {
    const draftQueryKey = quoteLinesKeys.list(null)
    const current = queryClient.getQueryData<QuoteLine[]>(draftQueryKey) ?? []
    queryClient.setQueryData<QuoteLine[]>(
      draftQueryKey,
      current.filter((line) => line.id !== id)
    )
  }

  // Migrate draft lines to persisted quote
  const migrateDraftLinesToPersistedQuote = (newQuoteId: string) => {
    const draftLines = queryClient.getQueryData<QuoteLine[]>(quoteLinesKeys.list(null)) ?? []

    // Set lines under new query key
    if (draftLines.length > 0) {
      queryClient.setQueryData<QuoteLine[]>(quoteLinesKeys.list(newQuoteId), draftLines)
    }

    // Clear draft lines
    queryClient.removeQueries({ queryKey: quoteLinesKeys.list(null) })
  }

  // Get lines by ID (including temp IDs)
  const getLineById = (id: string): QuoteLine | undefined => {
    return lines?.find((line) => line.id === id)
  }

  return {
    lines: lines ?? [],
    isLoading,
    error,
    refetch,

    // Mutations
    createLine: createLineMutation.mutate,
    createLineAsync: createLineMutation.mutateAsync,
    isCreating: createLineMutation.isPending,

    updateLine: updateLineMutation.mutate,
    updateLineAsync: updateLineMutation.mutateAsync,
    isUpdating: updateLineMutation.isPending,

    deleteLine: deleteLineMutation.mutate,
    deleteLineAsync: deleteLineMutation.mutateAsync,
    isDeleting: deleteLineMutation.isPending,

    // Local operations for draft mode
    addLineLocally,
    updateLineLocally,
    removeLineLocally,
    migrateDraftLinesToPersistedQuote,

    // Helpers
    getLineById,
  }
}
