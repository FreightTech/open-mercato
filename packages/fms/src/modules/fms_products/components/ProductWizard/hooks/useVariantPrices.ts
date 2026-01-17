'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { VariantPrice } from './useProductWizard'

type UseVariantPricesOptions = {
  variantId?: string
  productId?: string
  onError?: (error: string) => void
}

type CreatePriceData = {
  validityStart: string
  validityEnd?: string | null
  contractType: 'SPOT' | 'NAC' | 'BASKET'
  contractNumber?: string | null
  price: number | string
  currencyCode?: string
  isActive?: boolean
}

type UpdatePriceData = Partial<CreatePriceData>

export function useVariantPrices({
  variantId,
  productId,
  onError,
}: UseVariantPricesOptions) {
  const queryClient = useQueryClient()
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, UpdatePriceData>>(new Map())
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fetch prices for variant
  const { data, isLoading, error } = useQuery({
    queryKey: ['variant-prices', variantId],
    queryFn: async () => {
      if (!variantId) return []
      const response = await apiCall<{ variantId: string; prices: VariantPrice[] }>(
        `/api/fms_products/variants/${variantId}/prices`
      )
      if (!response.ok) throw new Error('Failed to load prices')
      return response.result?.prices ?? []
    },
    enabled: !!variantId,
  })

  const prices = data ?? []

  // Create price mutation
  const createMutation = useMutation({
    mutationFn: async (priceData: CreatePriceData) => {
      if (!variantId) throw new Error('No variant ID')
      const response = await apiCall<VariantPrice>(
        `/api/fms_products/variants/${variantId}/prices`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(priceData),
        }
      )
      if (!response.ok) throw new Error('Failed to create price')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-prices', variantId] })
      queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to create price')
    },
  })

  // Update price mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & UpdatePriceData) => {
      const response = await apiCall<VariantPrice>(
        `/api/fms_products/prices/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      )
      if (!response.ok) throw new Error('Failed to update price')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-prices', variantId] })
      queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to update price')
      setSaveStatus('error')
    },
  })

  // Delete price mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiCall(`/api/fms_products/prices/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete price')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-prices', variantId] })
      queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to delete price')
    },
  })

  const addPrice = useCallback(
    async (priceData: CreatePriceData) => {
      return createMutation.mutateAsync(priceData)
    },
    [createMutation]
  )

  const updatePrice = useCallback(
    (id: string, updates: UpdatePriceData) => {
      setPendingUpdates((prev) => {
        const newMap = new Map(prev)
        const existing = newMap.get(id) || {}
        newMap.set(id, { ...existing, ...updates })
        return newMap
      })
    },
    []
  )

  const removePrice = useCallback(
    async (id: string) => {
      return deleteMutation.mutateAsync(id)
    },
    [deleteMutation]
  )

  // Debounced auto-save (2 seconds)
  useEffect(() => {
    if (pendingUpdates.size === 0) return

    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving')

      const updates = Array.from(pendingUpdates.entries())
      setPendingUpdates(new Map())

      try {
        await Promise.all(
          updates.map(([id, changes]) => updateMutation.mutateAsync({ id, ...changes }))
        )
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('error')
      }
    }, 2000)

    return () => clearTimeout(saveTimeoutRef.current)
  }, [pendingUpdates, updateMutation])

  // Force save (for immediate save before close)
  const forceSave = useCallback(async () => {
    clearTimeout(saveTimeoutRef.current)

    if (pendingUpdates.size === 0) return

    setSaveStatus('saving')
    const updates = Array.from(pendingUpdates.entries())
    setPendingUpdates(new Map())

    try {
      await Promise.all(
        updates.map(([id, changes]) => updateMutation.mutateAsync({ id, ...changes }))
      )
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [pendingUpdates, updateMutation])

  return {
    prices,
    isLoading,
    error,
    saveStatus,
    addPrice,
    updatePrice,
    removePrice,
    forceSave,
    hasPendingChanges: pendingUpdates.size > 0,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
