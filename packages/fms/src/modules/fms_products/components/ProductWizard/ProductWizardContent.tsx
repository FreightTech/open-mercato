'use client'

import * as React from 'react'
import { X, Loader2, Save } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { ProductWizardProvider } from './hooks/ProductWizardContext'
import { ProductWizardHeader } from './ProductWizardHeader'
import { ProductWizardVariantsTable } from './ProductWizardVariantsTable'
import { useProductWizardContext } from './hooks/useProductWizardContext'

type ProductWizardContentInnerProps = {
  onClose: () => void
}

function ProductWizardContentInner({ onClose }: ProductWizardContentInnerProps) {
  const {
    product,
    variants,
    persistedProductId,
    saveStatus,
    isDirty,
    createProduct,
    saveVariants,
    reset,
  } = useProductWizardContext()

  const isSaving = saveStatus === 'saving'
  const isProductCreated = persistedProductId !== null

  const handleClose = () => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?')
      if (!confirmed) return
    }
    reset()
    onClose()
  }

  const handleCreateProduct = async () => {
    await createProduct()
  }

  const handleDone = async () => {
    // Save any unsaved variants before closing
    const unsavedVariants = variants.filter((v) => !v.realId)
    if (unsavedVariants.length > 0) {
      await saveVariants()
    }
    reset()
    onClose()
  }

  const canCreateProduct = product.name.trim().length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div>
          <h2 className="text-lg font-semibold">
            {isProductCreated ? 'Add Product Variants' : 'Create New Product'}
          </h2>
          <p className="text-sm text-gray-500">
            {isProductCreated
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

        {/* Create Product Button - shown only before product is created */}
        {!isProductCreated && (
          <div className="flex justify-end">
            <Button
              onClick={handleCreateProduct}
              disabled={!canCreateProduct || isSaving}
            >
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

        {/* Variants Section - shown only after product is created */}
        {isProductCreated && <ProductWizardVariantsTable />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t bg-white">
        <div className="text-xs text-gray-500">
          {isProductCreated && `${variants.length} variant(s) added`}
        </div>

        <div className="flex items-center gap-2">
          {isProductCreated ? (
            <>
              <Button variant="outline" onClick={handleDone} disabled={isSaving}>
                Done
              </Button>
              <Button
                onClick={saveVariants}
                disabled={isSaving || variants.filter((v) => !v.realId).length === 0}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Variants
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

type ProductWizardContentProps = {
  onClose: () => void
  onProductCreated?: (productId: string) => void
}

export function ProductWizardContent({ onClose, onProductCreated }: ProductWizardContentProps) {
  return (
    <ProductWizardProvider onClose={onClose} onProductCreated={onProductCreated}>
      <ProductWizardContentInner onClose={onClose} />
    </ProductWizardProvider>
  )
}
