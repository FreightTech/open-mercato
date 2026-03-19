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

export type UnitOption = {
  id: string
  cargoType: string
  containerNumber?: string | null
  containerType?: string | null
  packageCount?: number | null
}

export type ExistingAssignment = {
  id: string   // unit-leg record id
  unitId: string
}

type AssignUnitsDialogProps = {
  legId: string
  units: UnitOption[]
  existingAssignments: ExistingAssignment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function unitLabel(unit: UnitOption): string {
  return unit.cargoType === 'FCL'
    ? `${unit.containerType ?? '?'} – ${unit.containerNumber ?? '(no number)'}`
    : `LCL – ${unit.packageCount ?? 0} pkgs`
}

export function AssignUnitsDialog({
  legId,
  units,
  existingAssignments,
  open,
  onOpenChange,
  onSaved,
}: AssignUnitsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(existingAssignments.map((a) => a.unitId)))
      setError(null)
    }
  }, [open, existingAssignments])

  const toggleUnit = useCallback((unitId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    setError(null)

    const existingByUnitId = Object.fromEntries(existingAssignments.map((a) => [a.unitId, a.id]))
    const currentUnitIds = new Set(existingAssignments.map((a) => a.unitId))

    const toAdd = [...selectedIds].filter((id) => !currentUnitIds.has(id))
    const toRemove = [...currentUnitIds].filter((id) => !selectedIds.has(id))

    try {
      await Promise.all([
        ...toAdd.map((unitId) =>
          apiCall('/api/fms_files/unit-legs', {
            method: 'POST',
            body: JSON.stringify({ unitId, legId }),
          })
        ),
        ...toRemove.map((unitId) =>
          apiCall(`/api/fms_files/unit-legs/${existingByUnitId[unitId]}`, {
            method: 'DELETE',
          })
        ),
      ])
      onSaved()
      onOpenChange(false)
    } catch {
      setError('Failed to update assignments')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedIds, existingAssignments, legId, onSaved, onOpenChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Assign Units to Leg</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive mb-3">
              {error}
            </div>
          )}

          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No units in this file.</p>
          ) : (
            <div className="space-y-0.5">
              {units.map((unit) => (
                <label
                  key={unit.id}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(unit.id)}
                    onChange={() => toggleUnit(unit.id)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground">{unitLabel(unit)}</span>
                </label>
              ))}
            </div>
          )}
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
