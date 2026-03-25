'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent } from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { ArrowLeft } from 'lucide-react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ProductSearchPanel } from '../../fms_offers/components/ProductSearchPanel'
import type { ProductSearchResult } from '../../fms_offers/components/ProductSearchPanel'
import type { NewFileLineData } from './AddManualLineDialog'

type AddFileProductDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (lineData: NewFileLineData) => Promise<void>
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

export function AddFileProductDialog({ open, onOpenChange, onAdd, currencyCode }: AddFileProductDialogProps) {
  const [step, setStep] = useState<DialogStep>('search')
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [soldUnitPrice, setSoldUnitPrice] = useState('0')
  const [estimatedUnitCost, setEstimatedUnitCost] = useState('')

  useEffect(() => {
    if (open) {
      setStep('search')
      setSelectedProduct(null)
      setQuantity('1')
      setSoldUnitPrice('0')
      setEstimatedUnitCost('')
    }
  }, [open])

  const handleProductSelect = useCallback((product: ProductSearchResult) => {
    setSelectedProduct(product)
    setSoldUnitPrice('0')
    setEstimatedUnitCost(product.costPrice ? String(parseFloat(product.costPrice)) : '')
    setStep('configure')
  }, [])

  const handleBackToSearch = useCallback(() => {
    setStep('search')
    setSelectedProduct(null)
  }, [])

  const submitLine = useCallback(async () => {
    if (!selectedProduct) return null

    const qty = parseFloat(quantity) || 1
    if (qty <= 0) {
      flash('Quantity must be greater than 0', 'error')
      return null
    }

    const unitPrice = parseFloat(soldUnitPrice) || 0
    if (unitPrice < 0) {
      flash('Unit price cannot be negative', 'error')
      return null
    }

    const estCost = parseFloat(estimatedUnitCost) || null
    await onAdd({
      productName: selectedProduct.productName,
      chargeCode: selectedProduct.chargeCode || null,
      containerSize: null,
      quantity: qty,
      soldUnitPrice: unitPrice,
      currencyCode,
      notes: null,
      estimatedUnitCost: estCost,
    })

    return { qty, unitPrice }
  }, [selectedProduct, quantity, soldUnitPrice, estimatedUnitCost, currencyCode, onAdd])

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const result = await submitLine()
      if (result !== null) {
        flash('Product added successfully', 'success')
        onOpenChange(false)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to add product', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [submitLine, onOpenChange])

  const handleSubmitAndContinue = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const result = await submitLine()
      if (result !== null) {
        flash('Product added', 'success')
        setStep('search')
        setSelectedProduct(null)
        setQuantity('1')
        setSoldUnitPrice('0')
        setEstimatedUnitCost('')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to add product', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [submitLine])

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

  const total = React.useMemo(() => {
    const qty = parseFloat(quantity) || 0
    const unitPrice = parseFloat(soldUnitPrice) || 0
    return qty * unitPrice
  }, [quantity, soldUnitPrice])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]" onKeyDown={handleKeyDown}>
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
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBackToSearch}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <h2 className="text-sm font-medium">Configure Product</h2>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{selectedProduct.productName}</div>
                  {selectedProduct.chargeCodeName && (
                    <div className="text-sm text-muted-foreground">{selectedProduct.chargeCodeName}</div>
                  )}
                </div>
                <Badge variant="outline" className="font-mono">{selectedProduct.chargeCode}</Badge>
              </div>
              {selectedProduct.chargeUnit && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Unit: {selectedProduct.chargeUnit}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
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
                <Label htmlFor="soldUnitPrice">Est. Sell Price</Label>
                <Input
                  id="soldUnitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={soldUnitPrice}
                  onChange={(e) => setSoldUnitPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedUnitCost">Est. Cost Price</Label>
                <Input
                  id="estimatedUnitCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={estimatedUnitCost}
                  onChange={(e) => setEstimatedUnitCost(e.target.value)}
                  placeholder="From catalog"
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Total Amount</span>
              <span className="text-lg font-semibold">{formatCurrency(total, currencyCode)}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleSubmitAndContinue} disabled={isSubmitting}>
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
