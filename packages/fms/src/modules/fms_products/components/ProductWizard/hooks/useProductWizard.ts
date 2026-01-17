'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useProductVariants } from './useProductVariants'

export type ProviderRef = {
  id: string
  name?: string | null
  shortName?: string | null
}

export type LocationRef = {
  id: string
  locode?: string | null
  name: string
  city?: string | null
  country?: string | null
}

export type ChargeCodeRef = {
  id: string
  code: string
  description?: string | null
  chargeUnit: string
}

export type VariantPrice = {
  id: string
  validityStart: string | null
  validityEnd: string | null
  contractType: string
  contractNumber: string | null
  price: string
  currencyCode: string
  isActive: boolean
}

export type ProductVariant = {
  id: string
  variantType: 'container' | 'simple'
  name: string | null
  providerId: string | null
  providerName: string | null
  isDefault: boolean
  isActive: boolean
  // Container variant fields
  containerSize?: string
  containerType?: string | null
  weightLimit?: number | null
  weightUnit?: string | null
  // Prices
  priceCount: number
  prices?: VariantPrice[]
}

export type Product = {
  id: string
  name: string
  productType: string
  chargeCodeId: string | null
  chargeCodeCode: string | null
  serviceProviderId: string | null
  serviceProviderName: string | null
  internalNotes: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
  // Type-specific fields
  loop?: string
  sourceId?: string | null
  sourceName?: string | null
  destinationId?: string | null
  destinationName?: string | null
  transitTime?: number | null
  locationId?: string | null
  locationName?: string | null
  description?: string | null
  // Variants
  variants?: ProductVariant[]
}

export type CreateProductData = {
  name?: string
  productType?: string
  chargeCodeId?: string | null
  chargeCodeCode?: string | null
  serviceProviderId?: string | null
  serviceProviderName?: string | null
  internalNotes?: string | null
  isActive?: boolean
  // Type-specific fields
  loop?: string
  sourceId?: string | null
  destinationId?: string | null
  transitTime?: number | null
  locationId?: string | null
  description?: string | null
}

type UseProductWizardOptions = {
  productId: string | null
  onError?: (error: string) => void
  onProductCreated?: (productId: string) => void
}

export function useProductWizard({
  productId,
  onError,
  onProductCreated,
}: UseProductWizardOptions) {
  const queryClient = useQueryClient()
  const [createModeData, setCreateModeData] = useState<Partial<CreateProductData>>({
    productType: '',
    isActive: true,
  })
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)

  const isCreateMode = !productId

  // Fetch product data (only in edit mode)
  const {
    data: product,
    isLoading: isLoadingProduct,
    error: productError,
  } = useQuery({
    queryKey: ['fms_product_wizard', productId],
    queryFn: async () => {
      if (!productId) return null
      const response = await apiCall<Product>(`/api/fms_products/products/${productId}`)
      if (!response.ok) throw new Error('Failed to load product')
      return response.result
    },
    enabled: !!productId,
  })

  // Variants management (only in edit mode)
  const {
    variants,
    isLoading: isLoadingVariants,
    saveStatus: variantsSaveStatus,
    addVariant,
    updateVariant,
    removeVariant,
    forceSave: forceVariantsSave,
    hasPendingChanges: hasVariantPendingChanges,
  } = useProductVariants({
    productId: productId || undefined,
    productType: product?.productType || createModeData.productType,
    onError,
  })

  // Product update mutation (edit mode)
  const updateProductMutation = useMutation({
    mutationFn: async (updates: Partial<Product>) => {
      if (!productId) throw new Error('No product ID')
      const response = await apiCall(`/api/fms_products/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!response.ok) throw new Error('Failed to update product')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_product_wizard', productId] })
      queryClient.invalidateQueries({ queryKey: ['fms_products'] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to update product')
    },
  })

  // Product create mutation (create mode)
  const createProductMutation = useMutation({
    mutationFn: async (data: CreateProductData) => {
      const response = await apiCall<{ id: string }>('/api/fms_products/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to create product')
      return response.result
    },
    onSuccess: (result) => {
      if (result?.id) {
        queryClient.invalidateQueries({ queryKey: ['fms_products'] })
        onProductCreated?.(result.id)
      }
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to create product')
    },
  })

  const updateProduct = useCallback(
    (updates: Partial<Product>) => {
      if (isCreateMode) {
        // In create mode, just update local state
        setCreateModeData((prev) => ({ ...prev, ...updates }))
      } else {
        updateProductMutation.mutate(updates)
      }
    },
    [isCreateMode, updateProductMutation]
  )

  const createProduct = useCallback(async () => {
    if (!isCreateMode) return

    // Validate required fields
    const data = createModeData as CreateProductData
    if (!data.name?.trim()) {
      onError?.('Product name is required')
      return
    }
    if (!data.productType) {
      onError?.('Product type is required')
      return
    }

    // Type-specific validation
    if (data.productType === 'GFRT' && !data.loop?.trim()) {
      onError?.('Service loop is required for freight products')
      return
    }

    setIsCreatingProduct(true)
    try {
      await createProductMutation.mutateAsync(data)
    } finally {
      setIsCreatingProduct(false)
    }
  }, [isCreateMode, createModeData, createProductMutation, onError])

  // Get the current product type (from loaded product or create mode)
  const productType = product?.productType || createModeData.productType || ''

  // Determine variant type based on product type
  const defaultVariantType = useMemo((): 'container' | 'simple' => {
    if (productType === 'GFRT' || productType === 'GTHC') {
      return 'container'
    }
    return 'simple'
  }, [productType])

  // Force save all pending changes
  const forceSave = useCallback(async () => {
    await forceVariantsSave()
  }, [forceVariantsSave])

  const hasPendingChanges = hasVariantPendingChanges

  return {
    // Mode
    isCreateMode,

    // Product data
    product: isCreateMode ? (createModeData as Product) : product,
    isLoadingProduct,
    productError,
    updateProduct,

    // Create mode
    createModeData,
    setCreateModeData,
    createProduct,
    isCreatingProduct,

    // Variants
    variants,
    isLoadingVariants,
    variantsSaveStatus,
    addVariant,
    updateVariant,
    removeVariant,

    // Type info
    productType,
    defaultVariantType,

    // Save status
    forceSave,
    hasPendingChanges,
  }
}
