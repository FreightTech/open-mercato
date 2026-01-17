'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ProductVariant, VariantPrice } from './useProductWizard'

type UseProductVariantsOptions = {
  productId?: string
  productType?: string
  onError?: (error: string) => void
}

type VariantResponse = ProductVariant & {
  prices: VariantPrice[]
}

type CreateVariantData = {
  variantType?: 'container' | 'simple'
  name?: string | null
  providerId?: string | null
  isDefault?: boolean
  isActive?: boolean
  containerSize?: string
  containerType?: string | null
  weightLimit?: number | null
  weightUnit?: string | null
}

type UpdateVariantData = Partial<CreateVariantData>

export function useProductVariants({
  productId,
  productType,
  onError,
}: UseProductVariantsOptions) {
  const queryClient = useQueryClient()
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, UpdateVariantData>>(new Map())
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Determine default variant type based on product type
  const getDefaultVariantType = useCallback((): 'container' | 'simple' => {
    if (productType === 'GFRT' || productType === 'GTHC') {
      return 'container'
    }
    return 'simple'
  }, [productType])

  // Fetch variants with prices
  const { data, isLoading, error } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async () => {
      if (!productId) return []
      const response = await apiCall<{ variants: VariantResponse[] }>(
        `/api/fms_products/products/${productId}`
      )
      if (!response.ok) throw new Error('Failed to load variants')
      return response.result?.variants ?? []
    },
    enabled: !!productId,
    select: (data) => {
      // Transform to our variant format
      return (data || []).map((v): ProductVariant => ({
        id: v.id,
        variantType: v.variantType || 'simple',
        name: v.name,
        providerId: v.providerId,
        providerName: v.providerName,
        isDefault: v.isDefault,
        isActive: v.isActive,
        containerSize: v.containerSize,
        containerType: v.containerType,
        weightLimit: v.weightLimit,
        weightUnit: v.weightUnit,
        priceCount: v.prices?.length || 0,
        prices: v.prices,
      }))
    },
  })

  const variants = data ?? []

  // Create variant mutation
  const createMutation = useMutation({
    mutationFn: async (variantData: CreateVariantData) => {
      if (!productId) throw new Error('No product ID')
      const response = await apiCall<VariantResponse>(
        `/api/fms_products/products/${productId}/variants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variantType: variantData.variantType || getDefaultVariantType(),
            ...variantData,
          }),
        }
      )
      if (!response.ok) throw new Error('Failed to create variant')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to create variant')
    },
  })

  // Update variant mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & UpdateVariantData) => {
      const response = await apiCall<VariantResponse>(
        `/api/fms_products/variants/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      )
      if (!response.ok) throw new Error('Failed to update variant')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to update variant')
      setSaveStatus('error')
    },
  })

  // Delete variant mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiCall(`/api/fms_products/variants/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete variant')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to delete variant')
    },
  })

  const addVariant = useCallback(
    async (variantData?: CreateVariantData) => {
      return createMutation.mutateAsync(variantData || {})
    },
    [createMutation]
  )

  const updateVariant = useCallback(
    (id: string, updates: UpdateVariantData) => {
      setPendingUpdates((prev) => {
        const newMap = new Map(prev)
        const existing = newMap.get(id) || {}
        newMap.set(id, { ...existing, ...updates })
        return newMap
      })
    },
    []
  )

  const removeVariant = useCallback(
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
    variants,
    isLoading,
    error,
    saveStatus,
    addVariant,
    updateVariant,
    removeVariant,
    forceSave,
    hasPendingChanges: pendingUpdates.size > 0,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    getDefaultVariantType,
  }
}
