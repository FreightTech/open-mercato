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

type AddVariantModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    name?: string | null
    containerSize?: string
    containerType?: string | null
    weightLimit?: number | null
    weightUnit?: string | null
    isDefault?: boolean
  }) => Promise<void>
  variantType: 'container' | 'simple'
}

const CONTAINER_SIZES = ['20GP', '40GP', '40HC', '45HC']

export function AddVariantModal({
  open,
  onClose,
  onSubmit,
  variantType,
}: AddVariantModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    containerSize: '40HC',
    containerType: '',
    weightLimit: '',
    weightUnit: 'kg',
    isDefault: false,
  })

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      containerSize: '40HC',
      containerType: '',
      weightLimit: '',
      weightUnit: 'kg',
      isDefault: false,
    })
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const data: Record<string, unknown> = {
        name: formData.name || null,
        isDefault: formData.isDefault,
      }

      if (variantType === 'container') {
        data.containerSize = formData.containerSize
        data.containerType = formData.containerType || null
        data.weightLimit = formData.weightLimit ? parseFloat(formData.weightLimit) : null
        data.weightUnit = formData.weightUnit || null
      }

      await onSubmit(data)
      handleClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Variant</DialogTitle>
          <DialogDescription>
            {variantType === 'container'
              ? 'Create a new container variant with size specifications.'
              : 'Create a new variant for this product.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {variantType === 'container' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="containerSize">Container Size *</Label>
                <select
                  id="containerSize"
                  value={formData.containerSize}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, containerSize: e.target.value }))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CONTAINER_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="containerType">Container Type</Label>
                <Input
                  id="containerType"
                  placeholder="e.g., Dry, Reefer"
                  value={formData.containerType}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, containerType: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weightLimit">Weight Limit</Label>
                  <Input
                    id="weightLimit"
                    type="number"
                    placeholder="e.g., 28000"
                    value={formData.weightLimit}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, weightLimit: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weightUnit">Weight Unit</Label>
                  <select
                    id="weightUnit"
                    value={formData.weightUnit}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, weightUnit: e.target.value }))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Variant Name</Label>
            <Input
              id="name"
              placeholder="Optional descriptive name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isDefault" className="text-sm">
              Set as default variant
            </Label>
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
              'Create Variant'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
