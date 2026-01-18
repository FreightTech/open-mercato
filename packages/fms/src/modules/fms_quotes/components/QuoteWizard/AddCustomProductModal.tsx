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

// Standard charge codes
const CHARGE_CODES = [
  { value: 'GFRT', label: 'Ocean Freight (GFRT)' },
  { value: 'GTHC', label: 'Terminal Handling (GTHC)' },
  { value: 'GBAF', label: 'Bunker Adjustment (GBAF)' },
  { value: 'GBOL', label: 'Bill of Lading (GBOL)' },
  { value: 'GCUS', label: 'Customs Clearance (GCUS)' },
  { value: 'GOTH', label: 'Other (GOTH)' },
] as const

const PRODUCT_TYPES = [
  { value: 'freight', label: 'Freight' },
  { value: 'handling', label: 'Handling' },
  { value: 'customs', label: 'Customs' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'other', label: 'Other' },
] as const

const CONTAINER_SIZES = [
  { value: '20ft', label: '20ft' },
  { value: '40ft', label: '40ft' },
  { value: '40HC', label: '40HC' },
  { value: '45ft', label: '45ft' },
] as const

export type CustomLineData = {
  productName: string
  chargeCode: string
  productType: string
  containerSize?: string
  providerName?: string
  quantity: number
  unitCost: number
  currencyCode: string
  marginPercent: number
  unitSales: number
}

type AddCustomProductModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: (data: CustomLineData) => void
  defaultCurrency: string
  defaultMarginPercent: number
}

function formatCurrency(value: number, currency: string): string {
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

export function AddCustomProductModal({
  open,
  onClose,
  onConfirm,
  defaultCurrency,
  defaultMarginPercent,
}: AddCustomProductModalProps) {
  const [productName, setProductName] = useState('')
  const [chargeCode, setChargeCode] = useState('GOTH')
  const [productType, setProductType] = useState('other')
  const [containerSize, setContainerSize] = useState<string | undefined>(undefined)
  const [providerName, setProviderName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState(0)
  const [marginPercent, setMarginPercent] = useState(defaultMarginPercent)
  const [unitSales, setUnitSales] = useState(0)

  // Input state for free typing
  const [unitCostInput, setUnitCostInput] = useState('0')
  const [marginInput, setMarginInput] = useState(defaultMarginPercent.toString())
  const [unitSalesInput, setUnitSalesInput] = useState('0')

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setProductName('')
      setChargeCode('GOTH')
      setProductType('other')
      setContainerSize(undefined)
      setProviderName('')
      setQuantity(1)
      setUnitCost(0)
      setUnitCostInput('0')
      setMarginPercent(defaultMarginPercent)
      setMarginInput(defaultMarginPercent.toString())
      setUnitSales(0)
      setUnitSalesInput('0')
    }
  }, [open, defaultMarginPercent])

  // Recalculate unit sales when cost or margin changes
  useEffect(() => {
    const newUnitSales = calculateUnitSalesFromMargin(unitCost, marginPercent)
    setUnitSales(newUnitSales)
    setUnitSalesInput(Math.round(newUnitSales * 100) / 100 + '')
  }, [unitCost, marginPercent])

  const totalSales = quantity * unitSales
  const totalCost = quantity * unitCost
  const profit = totalSales - totalCost

  // Handle unit cost blur
  const handleUnitCostBlur = () => {
    const newCost = parseFloat(unitCostInput) || 0
    setUnitCost(Math.max(0, newCost))
    setUnitCostInput(Math.round(Math.max(0, newCost) * 100) / 100 + '')
  }

  // Handle margin blur
  const handleMarginBlur = () => {
    const newMargin = parseFloat(marginInput) || 0
    const clampedMargin = Math.min(99, Math.max(0, newMargin))
    setMarginPercent(clampedMargin)
    setMarginInput(Math.round(clampedMargin * 100) / 100 + '')
  }

  // Handle unit sales blur
  const handleUnitSalesBlur = () => {
    const newUnitSales = parseFloat(unitSalesInput) || 0
    const clampedUnitSales = Math.max(unitCost, newUnitSales)
    setUnitSales(clampedUnitSales)
    setUnitSalesInput(Math.round(clampedUnitSales * 100) / 100 + '')
    const newMargin = calculateMarginFromUnitSales(unitCost, clampedUnitSales)
    setMarginPercent(newMargin)
    setMarginInput(Math.round(newMargin * 100) / 100 + '')
  }

  const isValid = productName.trim() !== '' && chargeCode && unitCost > 0

  const handleConfirm = () => {
    if (!isValid) return

    onConfirm({
      productName: productName.trim(),
      chargeCode,
      productType,
      containerSize,
      providerName: providerName.trim() || undefined,
      quantity,
      unitCost,
      currencyCode: defaultCurrency,
      marginPercent,
      unitSales,
    })

    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isValid) {
      handleConfirm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Add Custom Product</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="productName">Product Name *</Label>
            <Input
              id="productName"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Enter product or charge name"
              autoFocus
            />
          </div>

          {/* Charge Code and Product Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chargeCode">Charge Code *</Label>
              <select
                id="chargeCode"
                value={chargeCode}
                onChange={(e) => setChargeCode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CHARGE_CODES.map((code) => (
                  <option key={code.value} value={code.value}>
                    {code.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="productType">Product Type</Label>
              <select
                id="productType"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Container Size and Provider Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="containerSize">Container Size</Label>
              <select
                id="containerSize"
                value={containerSize || ''}
                onChange={(e) => setContainerSize(e.target.value || undefined)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">None</option>
                {CONTAINER_SIZES.map((size) => (
                  <option key={size.value} value={size.value}>
                    {size.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="providerName">Provider Name</Label>
              <Input
                id="providerName"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Quantity and Unit Cost */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  setQuantity(Math.max(1, val))
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitCost">Unit Cost ({defaultCurrency}) *</Label>
              <Input
                id="unitCost"
                type="text"
                inputMode="decimal"
                value={unitCostInput}
                onChange={(e) => setUnitCostInput(e.target.value)}
                onBlur={handleUnitCostBlur}
              />
            </div>
          </div>

          {/* Margin and Unit Sales */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="margin">Margin %</Label>
              <Input
                id="margin"
                type="text"
                inputMode="decimal"
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                onBlur={handleMarginBlur}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitSales">Unit Sales Price</Label>
              <Input
                id="unitSales"
                type="text"
                inputMode="decimal"
                value={unitSalesInput}
                onChange={(e) => setUnitSalesInput(e.target.value)}
                onBlur={handleUnitSalesBlur}
              />
            </div>
          </div>

          {/* Calculated values */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-muted-foreground text-xs">Total Sales</div>
              <div className="font-mono font-medium">
                {formatCurrency(totalSales, defaultCurrency)}
              </div>
            </div>
            <div className="p-2 bg-muted/30 rounded">
              <div className="text-muted-foreground text-xs">Profit</div>
              <div className={`font-mono ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(profit, defaultCurrency)}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Add to Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
