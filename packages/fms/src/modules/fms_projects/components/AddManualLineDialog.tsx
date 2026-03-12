'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Input } from '@open-mercato/ui/primitives/input'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

export type AddManualLineDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (lineData: NewProjectLineData) => Promise<void>
}

export type NewProjectLineData = {
  productName: string
  chargeCode: string | null
  containerSize: string | null
  quantity: number
  soldUnitPrice: number
  currencyCode: string
  notes: string | null
  estimatedUnitCost?: number | null
}

type FormData = {
  productName: string
  chargeCode: string
  containerSize: string
  quantity: string
  soldUnitPrice: string
  currencyCode: string
  notes: string
}

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'PLN', label: 'PLN' },
  { value: 'GBP', label: 'GBP' },
]

// Standard charge codes
const CHARGE_CODES = [
  { value: '', label: 'None' },
  { value: 'GFRT', label: 'Ocean Freight (GFRT)' },
  { value: 'GTHC', label: 'Terminal Handling (GTHC)' },
  { value: 'GBAF', label: 'Bunker Adjustment (GBAF)' },
  { value: 'GBOL', label: 'Bill of Lading (GBOL)' },
  { value: 'GCUS', label: 'Customs Clearance (GCUS)' },
  { value: 'GOTH', label: 'Other Charges (GOTH)' },
]

// Standard container sizes
const CONTAINER_SIZES = [
  { value: '', label: 'None' },
  { value: '20ft', label: '20ft' },
  { value: '40ft', label: '40ft' },
  { value: '40HC', label: '40HC' },
  { value: '45ft', label: '45ft' },
]

export function AddManualLineDialog({
  open,
  onOpenChange,
  onAdd,
}: AddManualLineDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState<FormData>({
    productName: '',
    chargeCode: '',
    containerSize: '',
    quantity: '1',
    soldUnitPrice: '0',
    currencyCode: 'USD',
    notes: '',
  })

  React.useEffect(() => {
    if (open) {
      // Reset form when opening
      setFormData({
        productName: '',
        chargeCode: '',
        containerSize: '',
        quantity: '1',
        soldUnitPrice: '0',
        currencyCode: 'USD',
        notes: '',
      })
    }
  }, [open])

  const handleSubmit = React.useCallback(async () => {
    if (!formData.productName.trim()) {
      flash('Product name is required', 'error')
      return
    }

    const qty = parseFloat(formData.quantity) || 1
    if (qty <= 0) {
      flash('Quantity must be greater than 0', 'error')
      return
    }

    const unitPrice = parseFloat(formData.soldUnitPrice) || 0
    if (unitPrice < 0) {
      flash('Unit price cannot be negative', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      await onAdd({
        productName: formData.productName.trim(),
        chargeCode: formData.chargeCode.trim() || null,
        containerSize: formData.containerSize.trim() || null,
        quantity: qty,
        soldUnitPrice: unitPrice,
        currencyCode: formData.currencyCode,
        notes: formData.notes.trim() || null,
      })

      flash('Line added successfully', 'success')
      onOpenChange(false)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to add line', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, onAdd, onOpenChange])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    },
    [handleSubmit, onOpenChange]
  )

  // Calculate total
  const total = React.useMemo(() => {
    const qty = parseFloat(formData.quantity) || 0
    const unitPrice = parseFloat(formData.soldUnitPrice) || 0
    return (qty * unitPrice).toFixed(2)
  }, [formData.quantity, formData.soldUnitPrice])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle>Add Manual Line</DialogTitle>
            <DialogDescription>
              Add a custom line item to track costs for this project.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productName">Product/Service Name *</Label>
              <Input
                id="productName"
                placeholder="e.g. Ocean Freight, Handling Fee"
                value={formData.productName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, productName: e.target.value }))
                }
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chargeCode">Charge Code</Label>
                <select
                  id="chargeCode"
                  value={formData.chargeCode}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, chargeCode: e.target.value }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {CHARGE_CODES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="containerSize">Container Size</Label>
                <select
                  id="containerSize"
                  value={formData.containerSize}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, containerSize: e.target.value }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {CONTAINER_SIZES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="soldUnitPrice">Unit Price</Label>
                <Input
                  id="soldUnitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.soldUnitPrice}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, soldUnitPrice: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currencyCode">Currency</Label>
                <select
                  id="currencyCode"
                  value={formData.currencyCode}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, currencyCode: e.target.value }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Total display */}
            <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Total Amount</span>
              <span className="text-lg font-semibold">
                {formData.currencyCode} {total}
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                placeholder="Add any notes about this line item..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="w-full h-20 px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Line'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
