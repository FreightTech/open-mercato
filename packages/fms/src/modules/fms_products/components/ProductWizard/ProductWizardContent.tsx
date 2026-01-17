'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, X, Check, AlertCircle, Package } from 'lucide-react'
import { useProductWizard, type Product, type CreateProductData } from './hooks/useProductWizard'
import { ProductHeaderTable } from './ProductHeaderTable'
import { ProductTypeFieldsTable } from './ProductTypeFieldsTable'
import { ProductVariantsSection } from './ProductVariantsSection'

type ProductWizardContentProps = {
  productId: string | null
  onClose: () => void
  onProductCreated?: (productId: string) => void
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  GFRT: 'Freight',
  GTHC: 'THC',
  GBAF: 'BAF',
  GBAF_PIECE: 'BAF Piece',
  GBOL: 'B/L',
  GCUS: 'Customs',
  CUSTOM: 'Custom',
}

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  GFRT: 'bg-blue-100 text-blue-800',
  GTHC: 'bg-green-100 text-green-800',
  GBAF: 'bg-orange-100 text-orange-800',
  GBAF_PIECE: 'bg-orange-100 text-orange-800',
  GBOL: 'bg-purple-100 text-purple-800',
  GCUS: 'bg-yellow-100 text-yellow-800',
  CUSTOM: 'bg-gray-100 text-gray-800',
}

export function ProductWizardContent({
  productId,
  onClose,
  onProductCreated,
}: ProductWizardContentProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const {
    isCreateMode,
    product,
    isLoadingProduct,
    productError,
    updateProduct,
    createModeData,
    setCreateModeData,
    createProduct,
    isCreatingProduct,
    variants,
    isLoadingVariants,
    variantsSaveStatus,
    addVariant,
    updateVariant,
    removeVariant,
    productType,
    defaultVariantType,
    forceSave,
    hasPendingChanges,
  } = useProductWizard({
    productId,
    onError: setError,
    onProductCreated: (newId) => {
      onProductCreated?.(newId)
      queryClient.invalidateQueries({ queryKey: ['fms_products'] })
    },
  })

  const handleClose = async () => {
    if (hasPendingChanges) {
      await forceSave()
    }
    onClose()
  }

  const handleCreateProduct = async () => {
    await createProduct()
  }

  // Unified handler for both create and edit mode updates
  const handleProductUpdate = useCallback((
    updates: Partial<Product> | ((prev: Partial<CreateProductData>) => Partial<CreateProductData>)
  ) => {
    if (isCreateMode) {
      if (typeof updates === 'function') {
        setCreateModeData(updates)
      } else {
        setCreateModeData((prev) => ({ ...prev, ...updates }))
      }
    } else {
      if (typeof updates !== 'function') {
        updateProduct(updates)
      }
    }
  }, [isCreateMode, setCreateModeData, updateProduct])

  if (isLoadingProduct && productId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (productError && !isCreateMode) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Product not found</p>
      </div>
    )
  }

  const displayProductType = productType || (isCreateMode ? createModeData.productType : '')
  const displayProductName = isCreateMode
    ? createModeData.name || 'New Product'
    : product?.name || 'Product'

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 rounded p-2">
            <Package className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold">
            {isCreateMode ? 'New Product' : displayProductName}
          </h1>
          {displayProductType && (
            <Badge
              className={PRODUCT_TYPE_COLORS[displayProductType] || 'bg-gray-100 text-gray-800'}
            >
              {PRODUCT_TYPE_LABELS[displayProductType] || displayProductType}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save status indicator */}
          {!isCreateMode && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {variantsSaveStatus === 'saving' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              )}
              {variantsSaveStatus === 'saved' && (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Saved</span>
                </>
              )}
              {variantsSaveStatus === 'error' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Error saving</span>
                </>
              )}
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Product header */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Basic Information
          </h2>
          <ProductHeaderTable
            isCreateMode={isCreateMode}
            product={product}
            createModeData={createModeData}
            onUpdate={handleProductUpdate}
          />
        </section>

        {/* Type-specific fields - only show if productType is selected */}
        {displayProductType && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {PRODUCT_TYPE_LABELS[displayProductType] || displayProductType} Details
            </h2>
            <ProductTypeFieldsTable
              productType={displayProductType}
              isCreateMode={isCreateMode}
              product={product}
              createModeData={createModeData}
              onUpdate={handleProductUpdate}
            />
          </section>
        )}

        {/* Create button in create mode (before product is created) */}
        {isCreateMode && !productId && (
          <div className="flex justify-end">
            <Button
              onClick={handleCreateProduct}
              disabled={isCreatingProduct}
              className="px-8"
            >
              {isCreatingProduct ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Product'
              )}
            </Button>
          </div>
        )}

        {/* Variants section - only show in edit mode (after product exists) */}
        {!isCreateMode && productId && (
          <section>
            <ProductVariantsSection
              productId={productId}
              productType={productType}
              variants={variants}
              isLoading={isLoadingVariants}
              defaultVariantType={defaultVariantType}
              onAddVariant={addVariant}
              onUpdateVariant={updateVariant}
              onRemoveVariant={removeVariant}
            />
          </section>
        )}
      </div>

      {/* Footer - only in edit mode */}
      {!isCreateMode && (
        <div className="flex-shrink-0 p-4 border-t bg-white">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {variants.length} variant{variants.length !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
