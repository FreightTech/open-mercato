'use client'

import * as React from 'react'
import { createContext, useState, useCallback, useMemo } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type {
  ProductDraft,
  VariantDraft,
  SaveStatus,
  ProductWizardContextValue,
  ProductWizardProviderProps,
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
  priceTypeId: null,
  priceTypeName: null,
  providerId: null,
  providerName: null,
  isActive: true,
})

export function ProductWizardProvider({
  children,
  onProductCreated,
}: ProductWizardProviderProps) {
  // Product state
  const [product, setProduct] = useState<ProductDraft>(createDefaultProduct)
  const [persistedProductId, setPersistedProductId] = useState<string | null>(null)

  // Variants state
  const [variants, setVariants] = useState<VariantDraft[]>([])

  // Status state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // Update product
  const updateProduct = useCallback((updates: Partial<ProductDraft>) => {
    setProduct((prev) => ({ ...prev, ...updates }))
    setIsDirty(true)
  }, [])

  // Add variant
  const addVariant = useCallback((partialVariant?: Partial<VariantDraft>) => {
    const newVariant = { ...createDefaultVariant(), ...partialVariant }
    setVariants((prev) => [...prev, newVariant])
    setIsDirty(true)
  }, [])

  // Update variant
  const updateVariant = useCallback((tempId: string, updates: Partial<VariantDraft>) => {
    setVariants((prev) =>
      prev.map((v) => (v.tempId === tempId || v.realId === tempId ? { ...v, ...updates } : v))
    )
    setIsDirty(true)
  }, [])

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

      const productId = productResponse.result.id
      setPersistedProductId(productId)
      setProduct((prev) => ({ ...prev, id: productId }))
      setSaveStatus('saved')
      setIsDirty(false)
      onProductCreated?.(productId)
      flash('Product created. Now you can add variants.', 'success')

      return productId
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create product'
      setSaveError(errorMessage)
      setSaveStatus('error')
      flash(errorMessage, 'error')
      return null
    }
  }, [product, onProductCreated])

  // Save variants to server
  const saveVariants = useCallback(async () => {
    if (!persistedProductId) {
      flash('Product must be created first', 'error')
      return
    }

    const unsavedVariants = variants.filter((v) => !v.realId)
    if (unsavedVariants.length === 0) {
      return
    }

    setSaveStatus('saving')

    try {
      const results = await Promise.all(
        unsavedVariants.map(async (variant) => {
          const response = await apiCall<{ id: string }>(
            `/api/fms_products/products/${persistedProductId}/variants`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                validityStart: variant.validityStart,
                validityEnd: variant.validityEnd,
                containerSize: variant.containerSize,
                reference: variant.reference,
                price: variant.price,
                currencyCode: variant.currencyCode,
                priceTypeId: variant.priceTypeId,
                providerId: variant.providerId,
                isActive: variant.isActive,
              }),
            }
          )
          return {
            tempId: variant.tempId,
            realId: response.ok && response.result?.id ? response.result.id : null,
          }
        })
      )

      // Update variants with their real IDs
      const idMap = new Map(
        results
          .filter((r): r is { tempId: string; realId: string } => r.realId !== null)
          .map((r) => [r.tempId, r.realId])
      )

      if (idMap.size > 0) {
        setVariants((prev) =>
          prev.map((v) => ({
            ...v,
            realId: idMap.get(v.tempId) || v.realId,
          }))
        )
      }

      setSaveStatus('saved')
      setIsDirty(false)
      flash('Variants saved', 'success')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save variants'
      setSaveError(errorMessage)
      setSaveStatus('error')
      flash(errorMessage, 'error')
    }
  }, [persistedProductId, variants])

  // Reset wizard state
  const reset = useCallback(() => {
    setProduct(createDefaultProduct())
    setVariants([])
    setPersistedProductId(null)
    setSaveStatus('idle')
    setSaveError(null)
    setIsDirty(false)
  }, [])

  const contextValue: ProductWizardContextValue = useMemo(
    () => ({
      product,
      updateProduct,
      variants,
      addVariant,
      updateVariant,
      removeVariant,
      persistedProductId,
      saveStatus,
      saveError,
      isDirty,
      createProduct,
      saveVariants,
      reset,
    }),
    [
      product,
      updateProduct,
      variants,
      addVariant,
      updateVariant,
      removeVariant,
      persistedProductId,
      saveStatus,
      saveError,
      isDirty,
      createProduct,
      saveVariants,
      reset,
    ]
  )

  return (
    <ProductWizardContext.Provider value={contextValue}>
      {children}
    </ProductWizardContext.Provider>
  )
}
