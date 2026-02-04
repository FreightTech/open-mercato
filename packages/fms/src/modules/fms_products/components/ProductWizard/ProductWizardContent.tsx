'use client'

import * as React from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ProductWizardProvider } from './hooks/ProductWizardContext'
import { ProductWizardHeader } from './ProductWizardHeader'
import { ProductWizardVariantsTable } from './ProductWizardVariantsTable'
import { useProductWizardContext } from './hooks/useProductWizardContext'
import type { ProductWizardMode } from './types/product-wizard'

type ProductWizardContentInnerProps = {
  onClose: () => void
}

function ProductWizardContentInner({ onClose }: ProductWizardContentInnerProps) {
  const {
    mode,
    isLoading,
    product,
    variants,
    persistedProductId,
    saveStatus,
    createProduct,
    reset,
  } = useProductWizardContext()

  const isSaving = saveStatus === 'saving'
  const isEditMode = mode === 'edit'
  const isProductCreated = persistedProductId !== null

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreateProduct = async () => {
    await createProduct()
  }

  const canCreateProduct = product.name.trim().length > 0

  // Show loading spinner while loading product in edit mode
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div>
            <h2 className="text-lg font-semibold">Loading Product...</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div>
          <h2 className="text-lg font-semibold">
            {isEditMode
              ? `Edit Product: ${product.name || 'Untitled'}`
              : isProductCreated
                ? 'Add Product Variants'
                : 'Create New Product'}
          </h2>
          <p className="text-sm text-gray-500">
            {isEditMode
              ? 'Edit product details and manage variants - changes save automatically'
              : isProductCreated
                ? `${product.name} - Add pricing variants`
                : 'Fill in the product details below'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50 space-y-6">
        {/* Product Details Section */}
        <ProductWizardHeader />

        {/* Create Product Button - shown only before product is created in NEW mode */}
        {!isEditMode && !isProductCreated && (
          <div className="flex justify-end">
            <Button onClick={handleCreateProduct} disabled={!canCreateProduct || isSaving}>
              {isSaving ? (
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

        {/* Variants Section - shown after product is created (new mode) or always in edit mode */}
        {(isProductCreated || isEditMode) && <ProductWizardVariantsTable />}
      </div>

      {/* Footer - just shows variant count */}
      {(isProductCreated || isEditMode) && (
        <div className="px-6 py-3 border-t bg-white">
          <div className="text-xs text-gray-500">
            {variants.length} variant(s)
          </div>
        </div>
      )}
    </div>
  )
}

type ProductWizardContentProps = {
  mode: ProductWizardMode
  productId?: string | null
  onClose: () => void
  onProductCreated?: (productId: string) => void
  onProductUpdated?: (productId: string) => void
}

export function ProductWizardContent({
  mode,
  productId,
  onClose,
  onProductCreated,
  onProductUpdated,
}: ProductWizardContentProps) {
  return (
    <ProductWizardProvider
      mode={mode}
      productId={productId}
      onClose={onClose}
      onProductCreated={onProductCreated}
      onProductUpdated={onProductUpdated}
    >
      <ProductWizardContentInner onClose={onClose} />
    </ProductWizardProvider>
  )
}
