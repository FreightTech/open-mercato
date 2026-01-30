'use client'

import * as React from 'react'
import { createContext, useState, useCallback, useMemo, useEffect } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type {
  ProductDraft,
  VariantDraft,
  SaveStatus,
  ProductWizardContextValue,
  ProductWizardProviderProps,
  ProductWizardMode,
} from '../types/product-wizard'

export const ProductWizardContext = createContext<ProductWizardContextValue | null>(null)

const createDefaultProduct = (): ProductDraft => ({
  id: null,
  name: '',
  chargeCodeId: null,
  chargeCodeName: null,
  chargeCodeCode: null,
  carrierId: null,
  carrierName: null,
  loop: null,
  sourceId: null,
  sourceName: null,
  destinationId: null,
  destinationName: null,
  transitTime: null,
  locationId: null,
  locationName: null,
  description: null,
  internalNotes: null,
  isActive: true,
})

const createDefaultVariant = (): VariantDraft => ({
  tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  validityStart: null,
  validityEnd: null,
  containerSize: null,
  reference: null,
  price: null,
  currencyCode: 'USD',
  providerId: null,
  providerName: null,
  isActive: true,
})

interface ProductApiResponse {
  id: string
  name: string
  chargeCodeId: string | null
  chargeCodeName: string | null
  chargeCodeCode: string | null
  carrierId: string | null
  carrierName: string | null
  loop: string | null
  sourceId: string | null
  sourceName: string | null
  destinationId: string | null
  destinationName: string | null
  transitTime: number | null
  locationId: string | null
  locationName: string | null
  description: string | null
  internalNotes: string | null
  isActive: boolean
  variants: Array<{
    id: string
    validityStart: string | null
    validityEnd: string | null
    containerSize: string | null
    reference: string | null
    price: string | null
    currencyCode: string
    providerId: string | null
    providerName: string | null
    isActive: boolean
  }>
}

export function ProductWizardProvider({
  children,
  mode,
  productId,
  onProductCreated,
  onProductUpdated,
}: ProductWizardProviderProps) {
  // Loading state
  const [isLoading, setIsLoading] = useState(mode === 'edit' && !!productId)

  // Product state
  const [product, setProduct] = useState<ProductDraft>(createDefaultProduct)
  const [persistedProductId, setPersistedProductId] = useState<string | null>(productId || null)

  // Variants state
  const [variants, setVariants] = useState<VariantDraft[]>([])

  // Status state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // Load product data in edit mode
  useEffect(() => {
    if (mode === 'edit' && productId) {
      setIsLoading(true)
      apiCall<ProductApiResponse>(`/api/fms_products/products/${productId}`)
        .then((response) => {
          if (response.ok && response.result) {
            const data = response.result
            setProduct({
              id: data.id,
              name: data.name,
              chargeCodeId: data.chargeCodeId,
              chargeCodeName: data.chargeCodeName,
              chargeCodeCode: data.chargeCodeCode,
              carrierId: data.carrierId,
              carrierName: data.carrierName,
              loop: data.loop,
              sourceId: data.sourceId,
              sourceName: data.sourceName,
              destinationId: data.destinationId,
              destinationName: data.destinationName,
              transitTime: data.transitTime,
              locationId: data.locationId,
              locationName: data.locationName,
              description: data.description,
              internalNotes: data.internalNotes,
              isActive: data.isActive,
            })
            setPersistedProductId(data.id)

            // Load variants
            if (data.variants && data.variants.length > 0) {
              setVariants(
                data.variants.map((v) => ({
                  tempId: v.id,
                  realId: v.id,
                  validityStart: v.validityStart,
                  validityEnd: v.validityEnd,
                  containerSize: v.containerSize,
                  reference: v.reference,
                  price: v.price,
                  currencyCode: v.currencyCode || 'USD',
                  providerId: v.providerId,
                  providerName: v.providerName,
                  isActive: v.isActive,
                }))
              )
            }
          } else {
            flash('Failed to load product', 'error')
          }
        })
        .catch(() => {
          flash('Failed to load product', 'error')
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [mode, productId])

  // Update product
  const updateProduct = useCallback((updates: Partial<ProductDraft>) => {
    setProduct((prev) => ({ ...prev, ...updates }))
    setIsDirty(true)
  }, [])

  // Add variant (local only, for UI before server save)
  const addVariant = useCallback((partialVariant?: Partial<VariantDraft>) => {
    const newVariant = { ...createDefaultVariant(), ...partialVariant }
    setVariants((prev) => [...prev, newVariant])
    setIsDirty(true)
  }, [])

  // Add variant with real ID (already persisted to server)
  const addVariantWithRealId = useCallback((realId: string, data: Omit<VariantDraft, 'tempId' | 'realId'>) => {
    const newVariant: VariantDraft = {
      ...createDefaultVariant(),
      ...data,
      tempId: realId, // Use realId as tempId for consistency
      realId,
    }
    setVariants((prev) => [...prev, newVariant])
    // Don't mark as dirty since it's already persisted
  }, [])

  // Update variant
  const updateVariant = useCallback(
    async (tempId: string, updates: Partial<VariantDraft>) => {
      const variant = variants.find((v) => v.tempId === tempId || v.realId === tempId)

      setVariants((prev) =>
        prev.map((v) => (v.tempId === tempId || v.realId === tempId ? { ...v, ...updates } : v))
      )
      setIsDirty(true)

      // If variant is persisted, update on server immediately
      if (variant?.realId && persistedProductId) {
        try {
          await apiCall(`/api/fms_products/products/${persistedProductId}/variants/${variant.realId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          })
        } catch {
          // Silent fail - user can retry
        }
      }
    },
    [variants, persistedProductId]
  )

  // Remove variant
  const removeVariant = useCallback(
    async (tempId: string) => {
      const variantToRemove = variants.find((v) => v.tempId === tempId || v.realId === tempId)

      // Remove from local state
      setVariants((prev) => prev.filter((v) => v.tempId !== tempId && v.realId !== tempId))
      setIsDirty(true)

      // If variant was persisted, delete from server
      if (variantToRemove?.realId && persistedProductId) {
        try {
          await apiCall(`/api/fms_products/products/${persistedProductId}/variants/${variantToRemove.realId}`, {
            method: 'DELETE',
          })
        } catch {
          flash('Failed to delete variant from server', 'error')
        }
      }
    },
    [variants, persistedProductId]
  )

  // Create product (without variants)
  const createProduct = useCallback(async (): Promise<string | null> => {
    if (!product.name.trim()) {
      setSaveError('Product name is required')
      flash('Product name is required', 'error')
      return null
    }

    setSaveStatus('saving')
    setSaveError(null)

    try {
      const productPayload: Record<string, unknown> = {
        name: product.name,
        chargeCodeId: product.chargeCodeId,
        carrierId: product.carrierId,
        loop: product.loop,
        sourceId: product.sourceId,
        destinationId: product.destinationId,
        transitTime: product.transitTime,
        locationId: product.locationId,
        description: product.description,
        internalNotes: product.internalNotes,
        isActive: product.isActive,
      }

      const productResponse = await apiCall<{ id: string }>('/api/fms_products/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productPayload),
      })

      if (!productResponse.ok || !productResponse.result?.id) {
        throw new Error('Failed to create product')
      }

      const newProductId = productResponse.result.id
      setPersistedProductId(newProductId)
      setProduct((prev) => ({ ...prev, id: newProductId }))
      setSaveStatus('saved')
      setIsDirty(false)
      onProductCreated?.(newProductId)
      flash('Product created. Now you can add variants.', 'success')

      return newProductId
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create product'
      setSaveError(errorMessage)
      setSaveStatus('error')
      flash(errorMessage, 'error')
      return null
    }
  }, [product, onProductCreated])

  // Update product on server (edit mode)
  // Accepts optional updates to merge with current state before sending
  // This is needed because React state updates are asynchronous
  const updateProductOnServer = useCallback(async (updates?: Partial<ProductDraft>): Promise<boolean> => {
    if (!persistedProductId) {
      flash('No product to update', 'error')
      return false
    }

    setSaveStatus('saving')
    setSaveError(null)

    try {
      // Merge any pending updates with current product state
      const mergedProduct = updates ? { ...product, ...updates } : product

      const productPayload: Record<string, unknown> = {
        name: mergedProduct.name,
        chargeCodeId: mergedProduct.chargeCodeId,
        carrierId: mergedProduct.carrierId,
        loop: mergedProduct.loop,
        sourceId: mergedProduct.sourceId,
        destinationId: mergedProduct.destinationId,
        transitTime: mergedProduct.transitTime,
        locationId: mergedProduct.locationId,
        description: mergedProduct.description,
        internalNotes: mergedProduct.internalNotes,
        isActive: mergedProduct.isActive,
      }

      const response = await apiCall(`/api/fms_products/products/${persistedProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productPayload),
      })

      if (!response.ok) {
        throw new Error('Failed to update product')
      }

      setSaveStatus('saved')
      setIsDirty(false)
      onProductUpdated?.(persistedProductId)
      flash('Product updated', 'success')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update product'
      setSaveError(errorMessage)
      setSaveStatus('error')
      flash(errorMessage, 'error')
      return false
    }
  }, [product, persistedProductId, onProductUpdated])

  // Reset wizard state
  const reset = useCallback(() => {
    setProduct(createDefaultProduct())
    setVariants([])
    setPersistedProductId(null)
    setSaveStatus('idle')
    setSaveError(null)
    setIsDirty(false)
    setIsLoading(false)
  }, [])

  const contextValue: ProductWizardContextValue = useMemo(
    () => ({
      mode,
      isLoading,
      product,
      updateProduct,
      variants,
      addVariant,
      addVariantWithRealId,
      updateVariant,
      removeVariant,
      persistedProductId,
      saveStatus,
      saveError,
      isDirty,
      createProduct,
      updateProductOnServer,
      reset,
    }),
    [
      mode,
      isLoading,
      product,
      updateProduct,
      variants,
      addVariant,
      addVariantWithRealId,
      updateVariant,
      removeVariant,
      persistedProductId,
      saveStatus,
      saveError,
      isDirty,
      createProduct,
      updateProductOnServer,
      reset,
    ]
  )

  return (
    <ProductWizardContext.Provider value={contextValue}>
      {children}
    </ProductWizardContext.Provider>
  )
}
