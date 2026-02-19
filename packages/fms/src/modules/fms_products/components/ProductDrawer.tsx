'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

export type ProductDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

const CHARGE_UNIT_OPTIONS = [
  { value: '', label: 'Select charge unit (optional)' },
  { value: 'container', label: 'Per Container' },
  { value: 'file', label: 'Per File' },
  { value: 'weight_measure', label: 'Per W/M' },
  { value: 'cargo_value_percent', label: '% Cargo Value' },
]

const TRANSPORT_MODE_OPTIONS = [
  { value: '', label: 'Select transport mode (optional)' },
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'rail', label: 'Rail' },
]

type FormData = {
  name: string
  chargeCode: string
  chargeUnit: string
  transportMode: string
}

export function ProductDrawer({ open, onOpenChange, onCreated }: ProductDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    chargeCode: '',
    chargeUnit: '',
    transportMode: '',
  })
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormData, string>>>({})

  const resetForm = React.useCallback(() => {
    setFormData({
      name: '',
      chargeCode: '',
      chargeUnit: '',
      transportMode: '',
    })
    setErrors({})
  }, [])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetForm()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetForm]
  )

  const validate = React.useCallback(() => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  const handleSubmit = React.useCallback(async () => {
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        chargeCode: formData.chargeCode.trim() || null,
        chargeUnit: formData.chargeUnit || null,
        transportMode: formData.transportMode || null,
      }

      const response = await apiCall<{ id: string; error?: string }>(
        '/api/fms_products/products',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (response.ok && response.result?.id) {
        flash('Product created successfully', 'success')
        handleOpenChange(false)
        onCreated?.()
      } else {
        flash(response.result?.error || 'Failed to create product', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An unexpected error occurred', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, validate, handleOpenChange, onCreated])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full max-w-md sm:max-w-lg overflow-y-auto" onEscapeKeyDown={(e) => e.preventDefault()}>
        <div onKeyDown={handleKeyDown}>
          <SheetHeader>
            <SheetTitle>New Product</SheetTitle>
            <SheetDescription>Create a new product in the catalog.</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Product Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g. Ocean Freight Shanghai-Gdansk"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="chargeCode" className="text-sm font-medium">
                Charge Code
              </Label>
              <Input
                id="chargeCode"
                placeholder="e.g. GFFR"
                value={formData.chargeCode}
                onChange={(e) => setFormData((prev) => ({ ...prev, chargeCode: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chargeUnit" className="text-sm font-medium">
                Charge Unit
              </Label>
              <select
                id="chargeUnit"
                value={formData.chargeUnit}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormData((prev) => ({ ...prev, chargeUnit: e.target.value }))
                }
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
              >
                {CHARGE_UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transportMode" className="text-sm font-medium">
                Transport Mode
              </Label>
              <select
                id="transportMode"
                value={formData.transportMode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormData((prev) => ({ ...prev, transportMode: e.target.value }))
                }
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
              >
                {TRANSPORT_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SheetFooter className="mt-8 flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Product'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
