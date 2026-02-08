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

type ChargeCodeItem = {
  id: string
  code: string
  description: string | null
  chargeUnit: string
}

type ChargeCodesResponse = {
  items: ChargeCodeItem[]
  total: number
}

type FormData = {
  name: string
  chargeCodeId: string
}

export function ProductDrawer({ open, onOpenChange, onCreated }: ProductDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    chargeCodeId: '',
  })
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormData, string>>>({})
  const [chargeCodes, setChargeCodes] = React.useState<ChargeCodeItem[]>([])

  // Load charge codes on mount
  React.useEffect(() => {
    const loadChargeCodes = async () => {
      const response = await apiCall<ChargeCodesResponse>('/api/fms_products/charge-codes?limit=100')
      if (response.ok && response.result?.items) {
        setChargeCodes(response.result.items)
      }
    }
    if (open) {
      loadChargeCodes()
    }
  }, [open])

  const resetForm = React.useCallback(() => {
    setFormData({
      name: '',
      chargeCodeId: '',
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
        chargeCodeId: formData.chargeCodeId || null,
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
              <Label htmlFor="chargeCodeId" className="text-sm font-medium">
                Charge Code
              </Label>
              <select
                id="chargeCodeId"
                value={formData.chargeCodeId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormData((prev) => ({ ...prev, chargeCodeId: e.target.value }))
                }
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
              >
                <option value="">Select charge code (optional)</option>
                {chargeCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} {cc.description ? `- ${cc.description}` : ''}
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
