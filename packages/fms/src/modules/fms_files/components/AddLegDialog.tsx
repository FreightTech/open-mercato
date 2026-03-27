'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
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

type CarrierOption = { id: string; name: string }

type AddLegDialogProps = {
  fileId: string
  nextSequence: number
  units?: UnitOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function CarrierSearchInput({
  value,
  onChange,
  inputClass,
}: {
  value: CarrierOption | null
  onChange: (carrier: CarrierOption | null) => void
  inputClass: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CarrierOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) setQuery('')
    else setQuery(value.name)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (!value) setQuery('')
        else setQuery(value.name)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await apiCall(`/api/fms_products/carriers?q=${encodeURIComponent(q)}&limit=20&sortField=name&sortDir=asc`)
      if (res.ok) {
        const data = res.result as any
        setResults((data?.items ?? []).map((c: any) => ({ id: c.id, name: c.name })))
      }
      setLoading(false)
    }, 200)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    onChange(null)
    setOpen(true)
    search(q)
  }

  const handleFocus = () => {
    setOpen(true)
    if (results.length === 0) search(query)
  }

  const handleSelect = (carrier: CarrierOption) => {
    onChange(carrier)
    setQuery(carrier.name)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setQuery('')
    setResults([])
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          className={`${inputClass} pr-7`}
          placeholder="Search carrier..."
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-md max-h-48 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No carriers found</div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(c) }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function AddLegDialog({ fileId, nextSequence, units = [], open, onOpenChange, onSaved }: AddLegDialogProps) {
  const [type, setType] = useState<string>('SHIP')
  const [originLocationId, setOriginLocationId] = useState<string | null>(null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(null)
  const [carrier, setCarrier] = useState<CarrierOption | null>(null)
  const [bookingNumber, setBookingNumber] = useState('')
  const [blNumber, setBlNumber] = useState('')
  const [vesselName, setVesselName] = useState('')
  const [vesselImo, setVesselImo] = useState('')
  const [voyageNumber, setVoyageNumber] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [gateInCutoff, setGateInCutoff] = useState('')
  const [documentationCutoff, setDocumentationCutoff] = useState('')
  const [vgmCutoff, setVgmCutoff] = useState('')
  const [dangerousGoodsCutoff, setDangerousGoodsCutoff] = useState('')
  const [demFreeTime, setDemFreeTime] = useState('')
  const [detFreeTime, setDetFreeTime] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setType('SHIP')
      setOriginLocationId(null)
      setDestinationLocationId(null)
      setCarrier(null)
      setBookingNumber('')
      setBlNumber('')
      setVesselName('')
      setVesselImo('')
      setVoyageNumber('')
      setFlightNumber('')
      setAircraftType('')
      setGateInCutoff('')
      setDocumentationCutoff('')
      setVgmCutoff('')
      setDangerousGoodsCutoff('')
      setDemFreeTime('')
      setDetFreeTime('')
      setNotes('')
      setSelectedUnitIds(new Set())
      setError(null)
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = {
      fileId,
      legSequence: nextSequence,
      type,
      originLocationId: originLocationId ?? null,
      destinationLocationId: destinationLocationId ?? null,
      carrierId: carrier?.id ?? null,
      bookingNumber: bookingNumber.trim() || null,
      blNumber: blNumber.trim() || null,
      notes: notes.trim() || null,
    }

    if (type === 'SHIP') {
      const toIso = (v: string) => {
        const t = v.trim()
        if (!t) return null
        const d = new Date(t.includes('T') && !t.includes(':00', t.indexOf('T') + 4) ? t + ':00' : t)
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
      }
      body.vesselName = vesselName.trim() || null
      body.vesselImo = vesselImo.trim() || null
      body.voyageNumber = voyageNumber.trim() || null
      body.gateInCutoff = toIso(gateInCutoff)
      body.documentationCutoff = toIso(documentationCutoff)
      body.vgmCutoff = toIso(vgmCutoff)
      body.dangerousGoodsCutoff = toIso(dangerousGoodsCutoff)
      body.demFreeTime = demFreeTime !== '' ? parseInt(demFreeTime, 10) : null
      body.detFreeTime = detFreeTime !== '' ? parseInt(detFreeTime, 10) : null
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
    carrier, bookingNumber, blNumber, notes,
    vesselName, vesselImo, voyageNumber,
    gateInCutoff, documentationCutoff, vgmCutoff, dangerousGoodsCutoff,
    demFreeTime, detFreeTime,
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
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Origin</label>
              <LocationSearchInput
                value={originLocationId}
                onChange={(id) => setOriginLocationId(id)}
                placeholder="Origin port / place"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Destination</label>
              <LocationSearchInput
                value={destinationLocationId}
                onChange={(id) => setDestinationLocationId(id)}
                placeholder="Destination port / place"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Carrier</label>
            <div className="mt-1">
              <CarrierSearchInput value={carrier} onChange={setCarrier} inputClass={inputClass} />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Gate-in Cut-off</label>
                  <input type="datetime-local" value={gateInCutoff} onChange={(e) => setGateInCutoff(e.target.value)} className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Documentation Cut-off</label>
                  <input type="datetime-local" value={documentationCutoff} onChange={(e) => setDocumentationCutoff(e.target.value)} className={`mt-1 ${inputClass}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">VGM Cut-off</label>
                  <input type="datetime-local" value={vgmCutoff} onChange={(e) => setVgmCutoff(e.target.value)} className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Dangerous Goods Cut-off</label>
                  <input type="datetime-local" value={dangerousGoodsCutoff} onChange={(e) => setDangerousGoodsCutoff(e.target.value)} className={`mt-1 ${inputClass}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">DEM Free Time (days)</label>
                  <input type="number" min={0} value={demFreeTime} onChange={(e) => setDemFreeTime(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="e.g. 14" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">DET Free Time (days)</label>
                  <input type="number" min={0} value={detFreeTime} onChange={(e) => setDetFreeTime(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="e.g. 7" />
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
