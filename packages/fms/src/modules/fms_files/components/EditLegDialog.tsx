'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LocationSearchInput } from '../../tasks_board/components/LocationSearchInput'

type LegForEdit = {
  id: string
  originLocationId?: string | null
  destinationLocationId?: string | null
}

type EditLegDialogProps = {
  fileId: string
  leg: LegForEdit | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditLegDialog({ fileId, leg, open, onOpenChange, onSaved }: EditLegDialogProps) {
  const [originLocationId, setOriginLocationId] = useState<string | null>(null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (leg) {
      setOriginLocationId(leg.originLocationId ?? null)
      setDestinationLocationId(leg.destinationLocationId ?? null)
      setError(null)
    }
  }, [leg])

  const handleSubmit = useCallback(async () => {
    if (!leg) return
    setIsSubmitting(true)
    setError(null)

    const res = await apiCall(`/api/fms_files/files/${fileId}/legs/${leg.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        originLocationId: originLocationId ?? undefined,
        destinationLocationId: destinationLocationId ?? undefined,
      }),
    })

    if (!res.ok) {
      setError('Failed to save leg route')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    onSaved()
    onOpenChange(false)
  }, [leg, fileId, originLocationId, destinationLocationId, onSaved, onOpenChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Edit Leg Route</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Origin</label>
            <LocationSearchInput
              value={originLocationId}
              onChange={(id) => setOriginLocationId(id)}
              placeholder="Origin location"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Destination</label>
            <LocationSearchInput
              value={destinationLocationId}
              onChange={(id) => setDestinationLocationId(id)}
              placeholder="Destination location"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
