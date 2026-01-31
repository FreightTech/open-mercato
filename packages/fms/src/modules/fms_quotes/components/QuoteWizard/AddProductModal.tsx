'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Badge } from '@open-mercato/ui/primitives/badge'

type ProductData = {
  productId: string
  productName: string
  productType: string
  chargeCode: string
  variantId: string | null
  containerSize?: string | null
  price: string | null
  currencyCode: string | null
  // Reference (contract number or "FAK" for spot)
  reference?: string | null
  // Validity period
  validityStart: string | null
  validityEnd?: string | null
  // Provider info
  providerContractorId?: string | null
  providerName?: string | null
  loop?: string | null
  // Origin/Destination (source/destination from product)
  source?: string | null
  destination?: string | null
}

type ProductConfirmData = {
  productId: string
  variantId?: string
  productName: string
  chargeCode: string
  productType: string
  providerName?: string
  providerId?: string
  containerSize?: string
  reference?: string
  origin?: string
  destination?: string
  validityStart?: string
  validityEnd?: string
  quantity: number
  unitCost: number
  currencyCode: string
  marginPercent: number
}

type AddProductModalProps = {
  product: unknown
  defaultQuantity: number
  defaultMarginPercent: number
  onConfirm: (data: ProductConfirmData) => void
  onConfirmAndContinue?: (data: ProductConfirmData) => void
  onCancel: () => void
}

function formatCurrency(value: number, currency: string | null): string {
  if (!currency) return `$${value.toFixed(2)}`
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Calculate unit sales from margin
function calculateUnitSalesFromMargin(unitCost: number, marginPercent: number): number {
  if (marginPercent >= 100) return unitCost * 10
  if (marginPercent <= 0) return unitCost
  return unitCost / (1 - marginPercent / 100)
}

// Calculate margin from unit sales
function calculateMarginFromUnitSales(unitCost: number, unitSales: number): number {
  if (unitSales <= 0) return 0
  if (unitSales <= unitCost) return 0
  return ((unitSales - unitCost) / unitSales) * 100
}

export function AddProductModal({
  product,
  defaultQuantity,
  defaultMarginPercent,
  onConfirm,
  onConfirmAndContinue,
  onCancel,
}: AddProductModalProps) {
  const [quantity, setQuantity] = useState(defaultQuantity)
  const [marginPercent, setMarginPercent] = useState(defaultMarginPercent)
  const [unitSales, setUnitSales] = useState(0)
  // Separate input states to allow free typing
  const [marginInput, setMarginInput] = useState(defaultMarginPercent.toString())
  const [unitSalesInput, setUnitSalesInput] = useState('0')

  const typedProduct = product as ProductData | null
  const unitCost = parseFloat(typedProduct?.price ?? '0') || 0

  // Reset form when product changes
  useEffect(() => {
    if (typedProduct) {
      setQuantity(defaultQuantity)
      setMarginPercent(defaultMarginPercent)
      setMarginInput(defaultMarginPercent.toString())
      // Calculate initial unit sales from default margin
      const initialUnitSales = calculateUnitSalesFromMargin(unitCost, defaultMarginPercent)
      setUnitSales(initialUnitSales)
      setUnitSalesInput(Math.round(initialUnitSales * 100) / 100 + '')
    }
  }, [typedProduct, defaultQuantity, defaultMarginPercent, unitCost])

  if (!typedProduct) return null

  const totalSales = quantity * unitSales
  const totalCost = quantity * unitCost
  const profit = totalSales - totalCost

  // Handle margin input change - allow free typing
  const handleMarginInputChange = (value: string) => {
    setMarginInput(value)
  }

  // Handle margin blur - validate and recalculate
  const handleMarginBlur = () => {
    const newMargin = parseFloat(marginInput) || 0
    const clampedMargin = Math.min(99, Math.max(0, newMargin))
    setMarginPercent(clampedMargin)
    setMarginInput(Math.round(clampedMargin * 100) / 100 + '')
    const newUnitSales = calculateUnitSalesFromMargin(unitCost, clampedMargin)
    setUnitSales(newUnitSales)
    setUnitSalesInput(Math.round(newUnitSales * 100) / 100 + '')
  }

  // Handle unit sales input change - allow free typing
  const handleUnitSalesInputChange = (value: string) => {
    setUnitSalesInput(value)
  }

  // Handle unit sales blur - validate and recalculate
  const handleUnitSalesBlur = () => {
    const newUnitSales = parseFloat(unitSalesInput) || 0
    const clampedUnitSales = Math.max(unitCost, newUnitSales) // Can't sell below cost
    setUnitSales(clampedUnitSales)
    setUnitSalesInput(Math.round(clampedUnitSales * 100) / 100 + '')
    const newMargin = calculateMarginFromUnitSales(unitCost, clampedUnitSales)
    setMarginPercent(newMargin)
    setMarginInput(Math.round(newMargin * 100) / 100 + '')
  }

  const getConfirmData = (): ProductConfirmData => ({
    productId: typedProduct.productId,
    variantId: typedProduct.variantId || undefined,
    productName: typedProduct.productName,
    chargeCode: typedProduct.chargeCode,
    productType: typedProduct.productType,
    providerName: typedProduct.providerName || undefined,
    providerId: typedProduct.providerContractorId || undefined,
    containerSize: typedProduct.containerSize || undefined,
    reference: typedProduct.reference || undefined,
    origin: typedProduct.source || undefined,
    destination: typedProduct.destination || undefined,
    validityStart: typedProduct.validityStart || undefined,
    validityEnd: typedProduct.validityEnd || undefined,
    quantity,
    unitCost,
    currencyCode: typedProduct.currencyCode || 'USD',
    marginPercent,
  })

  const handleConfirm = () => {
    onConfirm(getConfirmData())
  }

  const handleConfirmAndContinue = () => {
    if (onConfirmAndContinue) {
      onConfirmAndContinue(getConfirmData())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleConfirm()
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Add Product to Quote</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product info */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{typedProduct.productName}</div>
                {typedProduct.loop && (
                  <div className="text-sm text-muted-foreground">{typedProduct.loop}</div>
                )}
              </div>
              <Badge variant="outline" className="font-mono">
                {typedProduct.chargeCode}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {typedProduct.containerSize && (
                <Badge variant="secondary">{typedProduct.containerSize}</Badge>
              )}
              {typedProduct.reference && (
                <span className="text-xs text-muted-foreground">{typedProduct.reference}</span>
              )}
              <span className="text-muted-foreground">
                {formatCurrency(unitCost, typedProduct.currencyCode)} / unit
              </span>
            </div>
          </div>

          {/* Quantity and Margin */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  setQuantity(Math.max(1, val))
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="margin">Margin %</Label>
              <Input
                id="margin"
                type="text"
                inputMode="decimal"
                value={marginInput}
                onChange={(e) => handleMarginInputChange(e.target.value)}
                onBlur={handleMarginBlur}
              />
            </div>
          </div>

          {/* Unit Sales - editable */}
          <div className="space-y-2">
            <Label htmlFor="unitSales">Unit Sales Price</Label>
            <Input
              id="unitSales"
              type="text"
              inputMode="decimal"
              value={unitSalesInput}
              onChange={(e) => handleUnitSalesInputChange(e.target.value)}
              onBlur={handleUnitSalesBlur}
            />
            <p className="text-xs text-muted-foreground">
              Cost: {formatCurrency(unitCost, typedProduct.currencyCode)} — Edit margin % or unit sales price
            </p>
          </div>

          {/* Calculated values */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-muted-foreground text-xs">Total Sales</div>
              <div className="font-mono font-medium">
                {formatCurrency(totalSales, typedProduct.currencyCode)}
              </div>
            </div>
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-muted-foreground text-xs">Profit</div>
              <div className={`font-mono ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(profit, typedProduct.currencyCode)}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {onConfirmAndContinue && (
            <Button variant="secondary" onClick={handleConfirmAndContinue}>
              Add & Continue
            </Button>
          )}
          <Button onClick={handleConfirm}>
            Add to Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
