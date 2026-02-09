'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { ArrowLeft } from 'lucide-react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ProductSearchPanel } from '../../fms_offers/components/ProductSearchPanel'
import type { ProductSearchResult } from '../../fms_offers/components/ProductSearchPanel'
import type { NewProjectLineData } from './AddManualLineDialog'

type AddProjectProductDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (lineData: NewProjectLineData) => Promise<void>
  currencyCode: string
}

type DialogStep = 'search' | 'configure'

function formatCurrency(value: number, currency: string | null): string {
  if (!currency) return `$${value.toFixed(2)}`
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function AddProjectProductDialog({
  open,
  onOpenChange,
  onAdd,
  currencyCode,
}: AddProjectProductDialogProps) {
  const [step, setStep] = useState<DialogStep>('search')
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state for configuration step
  const [quantity, setQuantity] = useState('1')
  const [soldUnitPrice, setSoldUnitPrice] = useState('0')

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('search')
      setSelectedProduct(null)
      setQuantity('1')
      setSoldUnitPrice('0')
    }
  }, [open])

  // Handle product selection from search
  const handleProductSelect = useCallback((product: ProductSearchResult) => {
    setSelectedProduct(product)
    setSoldUnitPrice('0')
    setStep('configure')
  }, [])

  // Handle back to search
  const handleBackToSearch = useCallback(() => {
    setStep('search')
    setSelectedProduct(null)
  }, [])

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!selectedProduct) return

    const qty = parseFloat(quantity) || 1
    if (qty <= 0) {
      flash('Quantity must be greater than 0', 'error')
      return
    }

    const unitPrice = parseFloat(soldUnitPrice) || 0
    if (unitPrice < 0) {
      flash('Unit price cannot be negative', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      await onAdd({
        productName: selectedProduct.productName,
        chargeCode: selectedProduct.chargeCode || null,
        containerSize: null,
        quantity: qty,
        soldUnitPrice: unitPrice,
        currencyCode: currencyCode,
        notes: null,
      })

      flash('Product added successfully', 'success')
      onOpenChange(false)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to add product', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedProduct, quantity, soldUnitPrice, currencyCode, onAdd, onOpenChange])

  // Handle adding and continuing
  const handleSubmitAndContinue = useCallback(async () => {
    if (!selectedProduct) return

    const qty = parseFloat(quantity) || 1
    if (qty <= 0) {
      flash('Quantity must be greater than 0', 'error')
      return
    }

    const unitPrice = parseFloat(soldUnitPrice) || 0
    if (unitPrice < 0) {
      flash('Unit price cannot be negative', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      await onAdd({
        productName: selectedProduct.productName,
        chargeCode: selectedProduct.chargeCode || null,
        containerSize: null,
        quantity: qty,
        soldUnitPrice: unitPrice,
        currencyCode: currencyCode,
        notes: null,
      })

      flash('Product added', 'success')
      // Go back to search to add more
      setStep('search')
      setSelectedProduct(null)
      setQuantity('1')
      setSoldUnitPrice('0')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to add product', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedProduct, quantity, soldUnitPrice, currencyCode, onAdd])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (step === 'configure' && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    },
    [step, handleSubmit, onOpenChange]
  )

  // Calculate total
  const total = React.useMemo(() => {
    const qty = parseFloat(quantity) || 0
    const unitPrice = parseFloat(soldUnitPrice) || 0
    return qty * unitPrice
  }, [quantity, soldUnitPrice])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[80vh]"
        onKeyDown={handleKeyDown}
      >
        {step === 'search' && (
          <div className="h-[500px]">
            <ProductSearchPanel
              onSelect={handleProductSelect}
              onClose={() => onOpenChange(false)}
              showDoneButton={false}
            />
          </div>
        )}

        {step === 'configure' && selectedProduct && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBackToSearch}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <h2 className="text-sm font-medium">Configure Product</h2>
            </div>

            {/* Product info */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{selectedProduct.productName}</div>
                  {selectedProduct.chargeCodeName && (
                    <div className="text-sm text-muted-foreground">{selectedProduct.chargeCodeName}</div>
                  )}
                </div>
                <Badge variant="outline" className="font-mono">
                  {selectedProduct.chargeCode}
                </Badge>
              </div>
              {selectedProduct.chargeUnit && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Unit: {selectedProduct.chargeUnit}</span>
                </div>
              )}
            </div>

            {/* Quantity and Price */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="soldUnitPrice">Sold Unit Price</Label>
                <Input
                  id="soldUnitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={soldUnitPrice}
                  onChange={(e) => setSoldUnitPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Total display */}
            <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Total Amount</span>
              <span className="text-lg font-semibold">
                {formatCurrency(total, currencyCode)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleSubmitAndContinue}
                disabled={isSubmitting}
              >
                Add & Continue
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Product'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
