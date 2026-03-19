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
import { LEG_TYPES } from '../data/types'
import type { UnitOption } from './AssignUnitsDialog'

type AddLegDialogProps = {
  fileId: string
  nextSequence: number
  units?: UnitOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function AddLegDialog({ fileId, nextSequence, units = [], open, onOpenChange, onSaved }: AddLegDialogProps) {
  const [type, setType] = useState<string>('SHIP')
  const [originLocationId, setOriginLocationId] = useState<string | null>(null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(null)
  const [bookingNumber, setBookingNumber] = useState('')
  const [blNumber, setBlNumber] = useState('')
  const [vesselName, setVesselName] = useState('')
  const [vesselImo, setVesselImo] = useState('')
  const [voyageNumber, setVoyageNumber] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setType('SHIP')
      setOriginLocationId(null)
      setDestinationLocationId(null)
      setBookingNumber('')
      setBlNumber('')
      setVesselName('')
      setVesselImo('')
      setVoyageNumber('')
      setFlightNumber('')
      setAircraftType('')
      setNotes('')
      setSelectedUnitIds(new Set())
      setError(null)
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    if (!originLocationId || !destinationLocationId) {
      setError('Please select origin and destination locations')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = {
      fileId,
      legSequence: nextSequence,
      type,
      originLocationId,
      destinationLocationId,
      bookingNumber: bookingNumber.trim() || null,
      blNumber: blNumber.trim() || null,
      notes: notes.trim() || null,
    }

    if (type === 'SHIP') {
      body.vesselName = vesselName.trim() || null
      body.vesselImo = vesselImo.trim() || null
      body.voyageNumber = voyageNumber.trim() || null
    }

    if (type === 'AIR') {
      body.flightNumber = flightNumber.trim() || null
      body.aircraftType = aircraftType.trim() || null
    }

    const res = await apiCall(`/api/fms_files/files/${fileId}/legs`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      setError('Failed to create leg')
      setIsSubmitting(false)
      return
    }

    const legId = (res.result as any)?.id
    if (legId && selectedUnitIds.size > 0) {
      await Promise.all(
        [...selectedUnitIds].map((unitId) =>
          apiCall('/api/fms_files/unit-legs', {
            method: 'POST',
            body: JSON.stringify({ unitId, legId }),
          })
        )
      )
    }

    setIsSubmitting(false)
    onSaved()
    onOpenChange(false)
  }, [
    fileId, nextSequence, type,
    originLocationId, destinationLocationId,
    bookingNumber, blNumber, notes,
    vesselName, vesselImo, voyageNumber,
    flightNumber, aircraftType,
    selectedUnitIds,
    onSaved, onOpenChange,
  ])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground'
  const selectClass = inputClass

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Add Leg {nextSequence}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Transport Mode *</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={`mt-1 ${selectClass}`}>
              {LEG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Origin *</label>
              <LocationSearchInput
                value={originLocationId}
                onChange={(id) => setOriginLocationId(id)}
                placeholder="Origin port / place"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Destination *</label>
              <LocationSearchInput
                value={destinationLocationId}
                onChange={(id) => setDestinationLocationId(id)}
                placeholder="Destination port / place"
              />
            </div>
          </div>

          {(type === 'SHIP' || type === 'TRUCK' || type === 'RAIL') && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Booking Number</label>
              <input type="text" value={bookingNumber} onChange={(e) => setBookingNumber(e.target.value)} className={`mt-1 ${inputClass} font-mono`} placeholder="e.g. BOOK123456" />
            </div>
          )}

          {type === 'SHIP' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Vessel Name</label>
                  <input type="text" value={vesselName} onChange={(e) => setVesselName(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="e.g. MSC OSCAR" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Voyage</label>
                  <input type="text" value={voyageNumber} onChange={(e) => setVoyageNumber(e.target.value)} className={`mt-1 ${inputClass} font-mono`} placeholder="e.g. 043W" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Master B/L</label>
                  <input type="text" value={blNumber} onChange={(e) => setBlNumber(e.target.value)} className={`mt-1 ${inputClass} font-mono`} placeholder="e.g. MSCUAB123456" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Vessel IMO</label>
                  <input type="text" value={vesselImo} onChange={(e) => setVesselImo(e.target.value)} className={`mt-1 ${inputClass} font-mono`} placeholder="e.g. 9703291" />
                </div>
              </div>
            </>
          )}

          {type === 'AIR' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Flight Number</label>
                <input type="text" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} className={`mt-1 ${inputClass} font-mono`} placeholder="e.g. LH8400" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">AWB</label>
                <input type="text" value={blNumber} onChange={(e) => setBlNumber(e.target.value)} className={`mt-1 ${inputClass} font-mono`} placeholder="e.g. 020-12345678" />
              </div>
            </div>
          )}

          {units.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Units on this leg</label>
              <div className="mt-1 space-y-0.5 rounded-md border border-border bg-card px-2 py-1">
                {units.map((unit) => {
                  const label = unit.cargoType === 'FCL'
                    ? `${unit.containerType ?? '?'} – ${unit.containerNumber ?? '(no number)'}`
                    : `LCL – ${unit.packageCount ?? 0} pkgs`
                  return (
                    <label key={unit.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted rounded px-1">
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.has(unit.id)}
                        onChange={() => setSelectedUnitIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(unit.id)) next.delete(unit.id)
                          else next.add(unit.id)
                          return next
                        })}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-foreground">{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`mt-1 ${inputClass} resize-none`} placeholder="Optional notes..." />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : `Add Leg ${nextSequence}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
