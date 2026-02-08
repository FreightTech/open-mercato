'use client'

import * as React from 'react'
import { createContext, useState, useCallback, useMemo, useEffect } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type {
  ProductDraft,
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
  chargeUnit: null,
  isActive: true,
})

interface ProductApiResponse {
  id: string
  name: string
  chargeCodeId: string | null
  chargeCodeCode: string | null
  chargeUnit: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
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
              chargeCodeName: null,
              chargeCodeCode: data.chargeCodeCode,
              chargeUnit: data.chargeUnit,
              isActive: data.isActive,
            })
            setPersistedProductId(data.id)
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

  // Create product
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
      flash('Product created successfully', 'success')

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
  const updateProductOnServer = useCallback(async (updates?: Partial<ProductDraft>): Promise<boolean> => {
    if (!persistedProductId) {
      flash('No product to update', 'error')
      return false
    }

    setSaveStatus('saving')
    setSaveError(null)

    try {
      const mergedProduct = updates ? { ...product, ...updates } : product

      const productPayload: Record<string, unknown> = {
        name: mergedProduct.name,
        chargeCodeId: mergedProduct.chargeCodeId,
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
