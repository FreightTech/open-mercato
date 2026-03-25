'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
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
import { CONTAINER_TYPES, PACKAGE_TYPES, WEIGHT_UNITS } from '../data/types'

type AddUnitDialogProps = {
  fileId: string
  cargoType: 'FCL' | 'LCL'
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  /** Pre-fill origin/destination from existing units so users don't re-enter the route */
  defaultOriginLocationId?: string | null
  defaultDestinationLocationId?: string | null
}

export function AddUnitDialog({
  fileId,
  cargoType,
  open,
  onOpenChange,
  onSaved,
  defaultOriginLocationId,
  defaultDestinationLocationId,
}: AddUnitDialogProps) {
  const isFCL = cargoType === 'FCL'

  const [originLocationId, setOriginLocationId] = useState<string | null>(defaultOriginLocationId ?? null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(defaultDestinationLocationId ?? null)
  const [containerType, setContainerType] = useState('20GP')
  const [containerNumber, setContainerNumber] = useState('')
  const [packageType, setPackageType] = useState('PLT')
  const [packageCount, setPackageCount] = useState('')
  const [grossWeight, setGrossWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('kg')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync defaults when dialog opens with new defaults
  React.useEffect(() => {
    if (open) {
      setOriginLocationId(defaultOriginLocationId ?? null)
      setDestinationLocationId(defaultDestinationLocationId ?? null)
      setContainerType('20GP')
      setContainerNumber('')
      setPackageType('PLT')
      setPackageCount('')
      setGrossWeight('')
      setWeightUnit('kg')
      setError(null)
    }
  }, [open, defaultOriginLocationId, defaultDestinationLocationId])

  const handleSubmit = useCallback(async () => {
    if (!originLocationId || !destinationLocationId) {
      setError('Please select origin and destination locations')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = {
      fileId,
      cargoType,
      originLocationId,
      destinationLocationId,
    }

    if (isFCL) {
      body.containerType = containerType
      body.containerNumber = containerNumber.trim() || null
    } else {
      body.packageCount = packageCount ? parseInt(packageCount) : null
      body.grossWeight = grossWeight ? parseFloat(grossWeight) : null
      body.weightUnit = grossWeight ? weightUnit : null
      body.packagesDetail = [{ packageType, packageCount: packageCount ? parseInt(packageCount) : null }]
    }

    const res = await apiCall(`/api/fms_files/files/${fileId}/units`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      setError('Failed to add unit')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    onSaved()
    onOpenChange(false)
  }, [
    fileId, cargoType, isFCL,
    originLocationId, destinationLocationId,
    containerType, containerNumber,
    packageType, packageCount, grossWeight, weightUnit,
    onSaved, onOpenChange,
  ])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground'
  const selectClass = inputClass

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Add {isFCL ? 'Container' : 'Package'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Origin *</label>
              <LocationSearchInput
                value={originLocationId}
                onChange={(id) => setOriginLocationId(id)}
                placeholder="Origin"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Destination *</label>
              <LocationSearchInput
                value={destinationLocationId}
                onChange={(id) => setDestinationLocationId(id)}
                placeholder="Destination"
              />
            </div>
          </div>

          {isFCL ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Type</label>
                <select value={containerType} onChange={(e) => setContainerType(e.target.value)} className={`mt-1 ${selectClass}`}>
                  {CONTAINER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Container #</label>
                <input
                  type="text"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value)}
                  placeholder="e.g. MSCU1234567"
                  className={`mt-1 ${inputClass} font-mono`}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Package Type</label>
                  <select value={packageType} onChange={(e) => setPackageType(e.target.value)} className={`mt-1 ${selectClass}`}>
                    {PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Count</label>
                  <input
                    type="number"
                    min={0}
                    value={packageCount}
                    onChange={(e) => setPackageCount(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Gross Weight</label>
                <div className="mt-1 flex gap-1">
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={grossWeight}
                    onChange={(e) => setGrossWeight(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                  <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} className="w-20 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground">
                    {WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
