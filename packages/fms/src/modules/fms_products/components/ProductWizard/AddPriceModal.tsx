'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Input } from '@open-mercato/ui/primitives/input'
import { Loader2 } from 'lucide-react'

type AddPriceModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    validityStart: string
    validityEnd?: string | null
    contractType: 'SPOT' | 'NAC' | 'BASKET'
    contractNumber?: string | null
    price: number
    currencyCode: string
  }) => Promise<void>
}

const CONTRACT_TYPES = [
  { value: 'SPOT', label: 'SPOT' },
  { value: 'NAC', label: 'NAC (Named Account Contract)' },
  { value: 'BASKET', label: 'BASKET' },
]

const CURRENCIES = ['USD', 'EUR', 'PLN', 'CNY', 'GBP']

export function AddPriceModal({ open, onClose, onSubmit }: AddPriceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    validityStart: new Date().toISOString().split('T')[0],
    validityEnd: '',
    contractType: 'SPOT' as 'SPOT' | 'NAC' | 'BASKET',
    contractNumber: '',
    price: '',
    currencyCode: 'USD',
  })

  const resetForm = useCallback(() => {
    setFormData({
      validityStart: new Date().toISOString().split('T')[0],
      validityEnd: '',
      contractType: 'SPOT',
      contractNumber: '',
      price: '',
      currencyCode: 'USD',
    })
    setErrors({})
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.validityStart) {
      newErrors.validityStart = 'Valid from date is required'
    }

    if (!formData.price || isNaN(parseFloat(formData.price))) {
      newErrors.price = 'Valid price is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        validityStart: formData.validityStart,
        validityEnd: formData.validityEnd || null,
        contractType: formData.contractType,
        contractNumber: formData.contractNumber || null,
        price: parseFloat(formData.price),
        currencyCode: formData.currencyCode,
      })
      handleClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Price</DialogTitle>
          <DialogDescription>
            Create a new price entry for this variant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validityStart">Valid From *</Label>
              <Input
                id="validityStart"
                type="date"
                value={formData.validityStart}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, validityStart: e.target.value }))
                }
                className={errors.validityStart ? 'border-red-500' : ''}
              />
              {errors.validityStart && (
                <p className="text-xs text-red-500">{errors.validityStart}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="validityEnd">Valid Until</Label>
              <Input
                id="validityEnd"
                type="date"
                value={formData.validityEnd}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, validityEnd: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contractType">Contract Type *</Label>
            <select
              id="contractType"
              value={formData.contractType}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  contractType: e.target.value as 'SPOT' | 'NAC' | 'BASKET',
                }))
              }
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CONTRACT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contractNumber">Contract Number</Label>
            <Input
              id="contractNumber"
              placeholder="e.g., NAC-2024-001"
              value={formData.contractNumber}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, contractNumber: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price: e.target.value }))
                }
                className={errors.price ? 'border-red-500' : ''}
              />
              {errors.price && <p className="text-xs text-red-500">{errors.price}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currencyCode">Currency</Label>
              <select
                id="currencyCode"
                value={formData.currencyCode}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, currencyCode: e.target.value }))
                }
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCIES.map((ccy) => (
                  <option key={ccy} value={ccy}>
                    {ccy}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Price'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
