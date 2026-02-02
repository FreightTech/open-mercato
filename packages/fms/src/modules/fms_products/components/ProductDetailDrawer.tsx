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
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type ProductDetail = {
  id: string
  name: string
  productType: string
  chargeCodeCode: string | null
  chargeCodeId: string | null
  serviceProviderName: string | null
  serviceProviderId: string | null
  internalNotes: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
  variants?: Array<{
    id: string
    name: string | null
    isDefault: boolean
    isActive: boolean
    priceCount: number
  }>
}

export type ProductDetailDrawerProps = {
  productId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

const getProductTypeColor = (productType: string) => {
  const colors: Record<string, string> = {
    GFRT: 'bg-blue-100 text-blue-800',
    GTHC: 'bg-green-100 text-green-800',
    GBAF: 'bg-orange-100 text-orange-800',
    GBAF_PIECE: 'bg-orange-100 text-orange-800',
    GBOL: 'bg-purple-100 text-purple-800',
    GCUS: 'bg-yellow-100 text-yellow-800',
    CUSTOM: 'bg-gray-100 text-gray-800',
  }
  return colors[productType] || 'bg-gray-100 text-gray-800'
}

const getProductTypeLabel = (productType: string) => {
  const labels: Record<string, string> = {
    GFRT: 'Freight',
    GTHC: 'THC',
    GBAF: 'BAF',
    GBAF_PIECE: 'BAF Piece',
    GBOL: 'B/L',
    GCUS: 'Customs',
    CUSTOM: 'Custom',
  }
  return labels[productType] || productType
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
    internalNotes: '',
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
        internalNotes: product.internalNotes || '',
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
            internalNotes: editForm.internalNotes || null,
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
        internalNotes: product.internalNotes || '',
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
                      {product.chargeCodeCode || 'No charge code'}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${getProductTypeColor(product.productType)}`}
                  >
                    {getProductTypeLabel(product.productType)}
                  </span>
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
                      <Label className="text-xs text-gray-500">Product Type</Label>
                      <p className="text-sm font-medium">
                        {getProductTypeLabel(product.productType)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Charge Code</Label>
                      <p className="text-sm font-medium font-mono">
                        {product.chargeCodeCode || '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Service Provider</Label>
                      <p className="text-sm font-medium">
                        {product.serviceProviderName || '-'}
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

                {/* Variants */}
                {product.variants && product.variants.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Variants ({product.variants.length})
                    </h3>
                    <div className="space-y-2">
                      {product.variants.map((variant) => (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {variant.name || 'Default Variant'}
                              {variant.isDefault && (
                                <span className="ml-2 text-xs text-gray-500">(Default)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {variant.priceCount} price{variant.priceCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              variant.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {variant.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Internal Notes */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Internal Notes
                  </h3>
                  {isEditing ? (
                    <Textarea
                      value={editForm.internalNotes}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, internalNotes: e.target.value }))
                      }
                      placeholder="Internal notes..."
                      rows={4}
                    />
                  ) : product.internalNotes ? (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {product.internalNotes}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No internal notes</p>
                  )}
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
