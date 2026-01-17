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
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

export type ProductDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

type SearchResultItem = {
  entityId: string
  recordId: string
  score: number
  source: string
  presenter?: {
    title: string
    subtitle?: string
    icon?: string
    badge?: string
  }
  url?: string
}

type SearchResponse = {
  results: SearchResultItem[]
  strategiesUsed: string[]
  timing: number
  query: string
  limit: number
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

const PRODUCT_TYPES = [
  { value: 'GFRT', label: 'Freight (GFRT)' },
  { value: 'GTHC', label: 'Terminal Handling (GTHC)' },
  { value: 'GBAF', label: 'BAF - Container (GBAF)' },
  { value: 'GBAF_PIECE', label: 'BAF - Piece (GBAF_PIECE)' },
  { value: 'GBOL', label: 'Bill of Lading (GBOL)' },
  { value: 'GCUS', label: 'Customs (GCUS)' },
  { value: 'CUSTOM', label: 'Custom (CUSTOM)' },
] as const

type FormData = {
  name: string
  productType: string
  chargeCodeId: string
  serviceProviderId: string
  internalNotes: string
  loop: string
  transitTime: string
  description: string
}

export function ProductDrawer({ open, onOpenChange, onCreated }: ProductDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    productType: '',
    chargeCodeId: '',
    serviceProviderId: '',
    internalNotes: '',
    loop: '',
    transitTime: '',
    description: '',
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

  const loadContractors = React.useCallback(async (query?: string): Promise<ComboboxOption[]> => {
    if (!query || query.trim().length === 0) return []
    const params = new URLSearchParams({
      q: query.trim(),
      limit: '20',
      entityTypes: 'contractors:contractor',
    })
    const response = await apiCall<SearchResponse>(`/api/search/search?${params}`)
    if (!response.ok || !response.result?.results) return []
    return response.result.results.map((item) => ({
      value: item.recordId,
      label: item.presenter?.title ?? '',
      description: item.presenter?.subtitle || null,
    }))
  }, [])

  const resetForm = React.useCallback(() => {
    setFormData({
      name: '',
      productType: '',
      chargeCodeId: '',
      serviceProviderId: '',
      internalNotes: '',
      loop: '',
      transitTime: '',
      description: '',
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
    if (!formData.productType) {
      newErrors.productType = 'Product type is required'
    }
    if (!formData.chargeCodeId) {
      newErrors.chargeCodeId = 'Charge code is required'
    }
    if (!formData.serviceProviderId.trim()) {
      newErrors.serviceProviderId = 'Service provider is required'
    }

    if (formData.productType === 'GFRT') {
      if (!formData.loop.trim()) {
        newErrors.loop = 'Service loop is required for freight products'
      }
    }

    if (formData.transitTime && isNaN(parseInt(formData.transitTime, 10))) {
      newErrors.transitTime = 'Must be a number'
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
        productType: formData.productType,
        chargeCodeId: formData.chargeCodeId,
        serviceProviderId: formData.serviceProviderId.trim(),
        internalNotes: formData.internalNotes.trim() || null,
        description: formData.description.trim() || null,
      }

      if (formData.productType === 'GFRT') {
        payload.loop = formData.loop.trim()
        if (formData.transitTime.trim()) {
          payload.transitTime = parseInt(formData.transitTime, 10)
        }
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
      if (event.key === 'Escape') {
        event.preventDefault()
        handleOpenChange(false)
      }
    },
    [handleSubmit, handleOpenChange]
  )

  const showFreightFields = formData.productType === 'GFRT'

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full max-w-md sm:max-w-lg overflow-y-auto">
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
                placeholder="e.g. MSC Shanghai-Gdansk Freight"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="productType" className="text-sm font-medium">
                Product Type <span className="text-red-500">*</span>
              </Label>
              <select
                id="productType"
                value={formData.productType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormData((prev) => ({ ...prev, productType: e.target.value }))
                }
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.productType ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select product type</option>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {errors.productType && <p className="text-sm text-red-500">{errors.productType}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="chargeCodeId" className="text-sm font-medium">
                Charge Code <span className="text-red-500">*</span>
              </Label>
              <select
                id="chargeCodeId"
                value={formData.chargeCodeId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormData((prev) => ({ ...prev, chargeCodeId: e.target.value }))
                }
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.chargeCodeId ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select charge code</option>
                {chargeCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} {cc.description ? `- ${cc.description}` : ''}
                  </option>
                ))}
              </select>
              {errors.chargeCodeId && <p className="text-sm text-red-500">{errors.chargeCodeId}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceProviderId" className="text-sm font-medium">
                Service Provider <span className="text-red-500">*</span>
              </Label>
              <ComboboxInput
                value={formData.serviceProviderId}
                onChange={(next) => setFormData((prev) => ({ ...prev, serviceProviderId: next }))}
                placeholder="Search for contractor..."
                loadSuggestions={loadContractors}
                allowCustomValues={false}
              />
              {errors.serviceProviderId && (
                <p className="text-sm text-red-500">{errors.serviceProviderId}</p>
              )}
            </div>

            {showFreightFields && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="loop" className="text-sm font-medium">
                    Service Loop <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="loop"
                    placeholder="e.g. AE1, AW1"
                    value={formData.loop}
                    onChange={(e) => setFormData((prev) => ({ ...prev, loop: e.target.value }))}
                    className={errors.loop ? 'border-red-500' : ''}
                  />
                  {errors.loop && <p className="text-sm text-red-500">{errors.loop}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transitTime" className="text-sm font-medium">
                    Transit Time (days)
                  </Label>
                  <Input
                    id="transitTime"
                    type="number"
                    min="1"
                    placeholder="e.g. 28"
                    value={formData.transitTime}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, transitTime: e.target.value }))
                    }
                    className={errors.transitTime ? 'border-red-500' : ''}
                  />
                  {errors.transitTime && (
                    <p className="text-sm text-red-500">{errors.transitTime}</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Product description..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="internalNotes" className="text-sm font-medium">
                Internal Notes
              </Label>
              <Textarea
                id="internalNotes"
                placeholder="Internal notes (not visible to clients)..."
                value={formData.internalNotes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, internalNotes: e.target.value }))
                }
                rows={3}
              />
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
