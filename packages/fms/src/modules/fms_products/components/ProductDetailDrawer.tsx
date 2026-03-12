'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Edit2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Label } from '@open-mercato/ui/primitives/label'
import { Input } from '@open-mercato/ui/primitives/input'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type ProductDetail = {
  id: string
  name: string
  chargeCode: string | null
  chargeUnit: string | null
  transportMode: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

const CHARGE_UNIT_LABELS: Record<string, string> = {
  container: 'Per Container',
  file: 'Per File',
  weight_measure: 'Per W/M',
  cargo_value_percent: '% Cargo Value',
}

const TRANSPORT_MODE_LABELS: Record<string, string> = {
  sea: 'Sea',
  air: 'Air',
  rail: 'Rail',
}

export type ProductDetailDrawerProps = {
  productId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

export function ProductDetailDrawer({
  productId,
  open,
  onOpenChange,
  onUpdated,
}: ProductDetailDrawerProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editForm, setEditForm] = React.useState({
    name: '',
    isActive: true,
  })

  const {
    data: product,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['fms_product_detail', productId],
    queryFn: async () => {
      if (!productId) return null
      const response = await apiCall<ProductDetail>(`/api/fms_products/products/${productId}`)
      if (!response.ok) throw new Error('Failed to load product')
      return response.result
    },
    enabled: !!productId && open,
  })

  // Reset edit form when product loads
  React.useEffect(() => {
    if (product) {
      setEditForm({
        name: product.name,
        isActive: product.isActive,
      })
    }
  }, [product])

  // Reset editing state when drawer closes
  React.useEffect(() => {
    if (!open) {
      setIsEditing(false)
    }
  }, [open])

  const handleSave = async () => {
    if (!productId) return

    setIsSaving(true)
    try {
      const response = await apiCall<{ error?: string }>(
        `/api/fms_products/products/${productId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editForm.name,
            isActive: editForm.isActive,
          }),
        }
      )

      if (response.ok) {
        flash('Product updated', 'success')
        setIsEditing(false)
        queryClient.invalidateQueries({ queryKey: ['fms_product_detail', productId] })
        queryClient.invalidateQueries({ queryKey: ['fms_products'] })
        onUpdated?.()
      } else {
        flash(response.result?.error || 'Failed to update product', 'error')
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to update product', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (product) {
      setEditForm({
        name: product.name,
        isActive: product.isActive,
      })
    }
    setIsEditing(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md sm:max-w-lg flex flex-col p-0"
        overlayClassName="backdrop-blur-none"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 p-6">
            <Spinner className="h-6 w-6" />
            <span className="text-sm text-gray-500">Loading product...</span>
          </div>
        ) : error || !product ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 p-6">
            <p className="text-sm text-gray-500">
              {error instanceof Error ? error.message : 'Product not found'}
            </p>
          </div>
        ) : (
          <>
            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto p-6">
              <SheetHeader className="pb-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 rounded p-2">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <SheetTitle className="text-lg">
                      {isEditing ? (
                        <Input
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, name: e.target.value }))
                          }
                          className="text-lg font-semibold"
                        />
                      ) : (
                        product.name
                      )}
                    </SheetTitle>
                    <p className="text-sm text-gray-500">
                      {product.chargeCode || 'No charge code'}
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Basic Info
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">Charge Code</Label>
                      <p className="text-sm font-medium font-mono">
                        {product.chargeCode || '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Charge Unit</Label>
                      <p className="text-sm font-medium">
                        {product.chargeUnit ? (CHARGE_UNIT_LABELS[product.chargeUnit] ?? product.chargeUnit) : '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Transport Mode</Label>
                      <p className="text-sm font-medium">
                        {product.transportMode ? (TRANSPORT_MODE_LABELS[product.transportMode] ?? product.transportMode) : '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Status</Label>
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Switch
                            checked={editForm.isActive}
                            onCheckedChange={(checked) =>
                              setEditForm((prev) => ({ ...prev, isActive: checked }))
                            }
                          />
                          <span className="text-sm">
                            {editForm.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm font-medium">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                              product.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {product.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Timestamps
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-xs text-gray-500">Created</Label>
                      <p className="font-medium">
                        {product.createdAt
                          ? new Date(product.createdAt).toLocaleString()
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Updated</Label>
                      <p className="font-medium">
                        {product.updatedAt
                          ? new Date(product.updatedAt).toLocaleString()
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed footer */}
            <div className="flex-shrink-0 p-4 border-t bg-white">
              {isEditing ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full"
                  variant="default"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Product
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
