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
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import {
  FMS_OFFER_STATUSES,
  type FmsOfferStatus,
} from '../data/types'

export type OfferDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  quoteId: string
  mode: 'create' | 'edit'
  initialValues?: {
    id?: string
    offerNumber?: string
    status?: FmsOfferStatus
    notes?: string
  }
  onSuccess?: () => void
}

type FormData = {
  offerNumber: string
  status: FmsOfferStatus
  notes: string
}

const STATUS_OPTIONS = FMS_OFFER_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

export function OfferDialog({
  open,
  onOpenChange,
  quoteId,
  mode,
  initialValues,
  onSuccess,
}: OfferDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState<FormData>({
    offerNumber: initialValues?.offerNumber || '',
    status: initialValues?.status || 'draft',
    notes: initialValues?.notes || '',
  })

  React.useEffect(() => {
    if (open) {
      setFormData({
        offerNumber: initialValues?.offerNumber || '',
        status: initialValues?.status || 'draft',
        notes: initialValues?.notes || '',
      })
    }
  }, [open, initialValues])

  const handleSubmit = React.useCallback(async () => {
    if (!formData.offerNumber.trim()) {
      flash('Offer number is required', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        quoteId,
        offerNumber: formData.offerNumber.trim(),
        status: formData.status,
        notes: formData.notes.trim() || null,
      }

      let response
      if (mode === 'create') {
        response = await apiCall('/api/fms_quotes/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        response = await apiCall(`/api/fms_quotes/offers/${initialValues?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (response.ok) {
        flash(mode === 'create' ? 'Offer created' : 'Offer updated', 'success')
        onOpenChange(false)
        onSuccess?.()
      } else {
        flash('Failed to save offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, quoteId, mode, initialValues?.id, onOpenChange, onSuccess])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New Offer' : 'Edit Offer'}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Create a new offer for this quote.'
                : 'Update the offer details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="offerNumber">Offer Number *</Label>
                <Input
                  id="offerNumber"
                  placeholder="e.g. OFF-001"
                  value={formData.offerNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, offerNumber: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      status: e.target.value as FmsOfferStatus,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                placeholder="Add any notes about this offer..."
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
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Offer' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
