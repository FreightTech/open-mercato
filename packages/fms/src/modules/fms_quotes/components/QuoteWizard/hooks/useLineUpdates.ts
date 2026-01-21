'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { QuoteLine, SaveStatus } from '../types/quote-wizard'
import { quoteLinesKeys } from './useQuoteLinesQuery'

// =============================================================================
// Constants
// =============================================================================

const DEBOUNCE_DELAY_MS = 1500 // Reduced from 2000ms for better UX

// =============================================================================
// Types
// =============================================================================

type PendingUpdate = {
  lineId: string
  updates: Partial<QuoteLine>
  timestamp: number
}

type UseLineUpdatesOptions = {
  quoteId: string | null
  onError?: (error: string) => void
  onSaveComplete?: () => void
}

// =============================================================================
// useLineUpdates Hook
//
// Handles debounced batch updates for quote lines with:
// - Batching of rapid updates to the same line
// - Debounced auto-save (1.5s delay)
// - Force save on demand (for close/unmount)
// - Cleanup on unmount with sendBeacon fallback
// - Optimistic updates to React Query cache
// =============================================================================

export function useLineUpdates({ quoteId, onError, onSaveComplete }: UseLineUpdatesOptions) {
  const queryClient = useQueryClient()
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Refs for cleanup - these persist across renders and don't trigger re-renders
  const pendingUpdatesRef = useRef<Map<string, Partial<QuoteLine>>>(new Map())
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const quoteIdRef = useRef<string | null>(quoteId)

  // Keep quoteIdRef in sync
  useEffect(() => {
    quoteIdRef.current = quoteId
  }, [quoteId])

  // Update mutation
  const updateMutation = useMutation({
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
  })

  // Process and save all pending updates
  const processPendingUpdates = useCallback(async () => {
    if (pendingUpdatesRef.current.size === 0) {
      return
    }

    setSaveStatus('saving')

    // Get snapshot of pending updates and clear the map
    const updates = Array.from(pendingUpdatesRef.current.entries())
    pendingUpdatesRef.current.clear()

    try {
      // Execute all updates in parallel
      await Promise.all(
        updates.map(([id, changes]) =>
          updateMutation.mutateAsync({ id, ...changes })
        )
      )

      setSaveStatus('saved')

      // Invalidate cache to ensure consistency
      if (quoteIdRef.current) {
        queryClient.invalidateQueries({ queryKey: quoteLinesKeys.list(quoteIdRef.current) })
      }

      // Reset status after delay
      setTimeout(() => setSaveStatus('idle'), 2000)

      onSaveComplete?.()
    } catch (error) {
      setSaveStatus('error')
      onError?.(error instanceof Error ? error.message : 'Failed to save changes')
    }
  }, [updateMutation, queryClient, onError, onSaveComplete])

  // Debounced save
  const debouncedSave = useCallback(() => {
    clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(() => {
      processPendingUpdates()
    }, DEBOUNCE_DELAY_MS)
  }, [processPendingUpdates])

  // Queue an update for a line
  const queueUpdate = useCallback(
    (lineId: string, updates: Partial<QuoteLine>) => {
      // Merge with existing pending updates for this line
      const existing = pendingUpdatesRef.current.get(lineId) || {}
      pendingUpdatesRef.current.set(lineId, { ...existing, ...updates })

      // Also update React Query cache optimistically
      const queryKey = quoteLinesKeys.list(quoteIdRef.current)
      const currentLines = queryClient.getQueryData<QuoteLine[]>(queryKey)

      if (currentLines) {
        queryClient.setQueryData<QuoteLine[]>(
          queryKey,
          currentLines.map((line) =>
            line.id === lineId ? { ...line, ...updates } : line
          )
        )
      }

      // Trigger debounced save
      debouncedSave()
    },
    [queryClient, debouncedSave]
  )

  // Force save immediately (for close/unmount scenarios)
  const forceSave = useCallback(async () => {
    clearTimeout(saveTimeoutRef.current)

    if (pendingUpdatesRef.current.size === 0) {
      return
    }

    await processPendingUpdates()
  }, [processPendingUpdates])

  // Sync save using sendBeacon (for unmount scenarios)
  const syncSave = useCallback(() => {
    if (pendingUpdatesRef.current.size === 0) {
      return
    }

    const updates = Array.from(pendingUpdatesRef.current.entries())
    pendingUpdatesRef.current.clear()

    // Use sendBeacon for reliable delivery during unmount
    updates.forEach(([id, changes]) => {
      const url = `/api/fms_quotes/quote-lines/${id}`
      const data = JSON.stringify(changes)

      // Try sendBeacon first
      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' })
        navigator.sendBeacon(url + '?_method=PUT', blob)
      }
    })
  }, [])

  // Cleanup on unmount - save any pending changes
  useEffect(() => {
    return () => {
      clearTimeout(saveTimeoutRef.current)

      // If there are pending updates, try to save them
      if (pendingUpdatesRef.current.size > 0) {
        syncSave()
      }
    }
  }, [syncSave])

  // Check if there are pending changes
  const hasPendingChanges = pendingUpdatesRef.current.size > 0

  return {
    queueUpdate,
    forceSave,
    saveStatus,
    hasPendingChanges,
    isUpdating: updateMutation.isPending,
  }
}
