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
import { CONTAINER_TYPES, WEIGHT_UNITS, VOLUME_UNITS } from '../data/types'
import { LocationSearchInput } from '../../tasks_board/components/LocationSearchInput'

type UnitRow = {
  id: string
  cargoType: string
  originLocationId?: string | null
  destinationLocationId?: string | null
  containerNumber?: string | null
  containerType?: string | null
  commodityDescription?: string | null
  grossWeight?: string | number | null
  weightUnit?: string | null
  volume?: string | number | null
  volumeUnit?: string | null
  isHazardous?: boolean
  packageCount?: number | null
}

type EditUnitDialogProps = {
  fileId: string
  unit: UnitRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditUnitDialog({ fileId, unit, open, onOpenChange, onSaved }: EditUnitDialogProps) {
  const isFCL = unit?.cargoType === 'FCL'

  const [originLocationId, setOriginLocationId] = useState<string | null>(null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(null)
  const [containerNumber, setContainerNumber] = useState('')
  const [containerType, setContainerType] = useState('20GP')
  const [commodityDescription, setCommodityDescription] = useState('')
  const [grossWeight, setGrossWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('kg')
  const [volume, setVolume] = useState('')
  const [volumeUnit, setVolumeUnit] = useState('cbm')
  const [packageCount, setPackageCount] = useState('')
  const [isHazardous, setIsHazardous] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (unit) {
      setOriginLocationId(unit.originLocationId ?? null)
      setDestinationLocationId(unit.destinationLocationId ?? null)
      setContainerNumber(unit.containerNumber ?? '')
      setContainerType(unit.containerType ?? '20GP')
      setCommodityDescription(unit.commodityDescription ?? '')
      setGrossWeight(unit.grossWeight != null ? String(unit.grossWeight) : '')
      setWeightUnit(unit.weightUnit ?? 'kg')
      setVolume(unit.volume != null ? String(unit.volume) : '')
      setVolumeUnit(unit.volumeUnit ?? 'cbm')
      setPackageCount(unit.packageCount != null ? String(unit.packageCount) : '')
      setIsHazardous(unit.isHazardous ?? false)
      setError(null)
    }
  }, [unit])

  const handleSubmit = useCallback(async () => {
    if (!unit) return
    setIsSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = {
      originLocationId: originLocationId ?? undefined,
      destinationLocationId: destinationLocationId ?? undefined,
      commodityDescription: commodityDescription.trim() || null,
      grossWeight: grossWeight ? parseFloat(grossWeight) : null,
      weightUnit: grossWeight ? weightUnit : null,
      isHazardous,
    }

    if (isFCL) {
      body.containerNumber = containerNumber.trim() || null
      body.containerType = containerType || null
    } else {
      body.packageCount = packageCount ? parseInt(packageCount) : null
      body.volume = volume ? parseFloat(volume) : null
      body.volumeUnit = volume ? volumeUnit : null
    }

    const res = await apiCall(`/api/fms_files/files/${fileId}/units/${unit.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      setError('Failed to save unit')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    onSaved()
    onOpenChange(false)
  }, [
    unit, fileId, isFCL,
    originLocationId, destinationLocationId,
    containerNumber, containerType,
    commodityDescription, grossWeight, weightUnit,
    volume, volumeUnit, packageCount, isHazardous,
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
          <DialogTitle>Edit Unit</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Origin</label>
              <LocationSearchInput value={originLocationId} onChange={(id) => setOriginLocationId(id)} placeholder="Origin" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Destination</label>
              <LocationSearchInput value={destinationLocationId} onChange={(id) => setDestinationLocationId(id)} placeholder="Destination" />
            </div>
          </div>

          {isFCL && (
            <>
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Type</label>
                  <select value={containerType} onChange={(e) => setContainerType(e.target.value)} className={`mt-1 ${selectClass}`}>
                    {CONTAINER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {!isFCL && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Package Count</label>
                <input
                  type="number"
                  min={0}
                  value={packageCount}
                  onChange={(e) => setPackageCount(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Volume</label>
                <div className="mt-1 flex gap-1">
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                  <select value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value)} className="w-20 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground">
                    {VOLUME_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

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

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Commodity Description</label>
            <input
              type="text"
              value={commodityDescription}
              onChange={(e) => setCommodityDescription(e.target.value)}
              placeholder="e.g. Electronic goods"
              className={`mt-1 ${inputClass}`}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isHazardous}
              onChange={(e) => setIsHazardous(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Hazardous cargo</span>
          </label>
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
