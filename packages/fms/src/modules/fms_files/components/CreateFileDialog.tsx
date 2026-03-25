'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ContractorSearchInput } from '../../fms_offers/components/ContractorSearchInput'
import { LocationSearchInput } from '../../tasks_board/components/LocationSearchInput'
import { CONTAINER_TYPES, PACKAGE_TYPES, WEIGHT_UNITS } from '../data/types'

type ContainerRow = { containerType: string; count: number }
type PackageRow = { packageType: string; count: number; grossWeight: string; weightUnit: string }

type CreateFileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_CONTAINER_ROW: ContainerRow = { containerType: '20GP', count: 1 }
const DEFAULT_PACKAGE_ROW: PackageRow = { packageType: 'PLT', count: 0, grossWeight: '', weightUnit: 'kg' }

export function CreateFileDialog({ open, onOpenChange }: CreateFileDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [shipmentType, setShipmentType] = useState('EXP')
  const [cargoType, setCargoType] = useState<'FCL' | 'LCL'>('FCL')
  const [contractorId, setContractorId] = useState<string | null>(null)
  const [originLocationId, setOriginLocationId] = useState<string | null>(null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(null)
  const [containerRows, setContainerRows] = useState<ContainerRow[]>([{ ...DEFAULT_CONTAINER_ROW }])
  const [packageRows, setPackageRows] = useState<PackageRow[]>([{ ...DEFAULT_PACKAGE_ROW }])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setShipmentType('EXP')
    setCargoType('FCL')
    setContractorId(null)
    setOriginLocationId(null)
    setDestinationLocationId(null)
    setContainerRows([{ ...DEFAULT_CONTAINER_ROW }])
    setPackageRows([{ ...DEFAULT_PACKAGE_ROW }])
    setNotes('')
    setError(null)
    setIsSubmitting(false)
  }, [])

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) resetForm()
    onOpenChange(newOpen)
  }, [onOpenChange, resetForm])

  const updateContainer = useCallback((index: number, field: keyof ContainerRow, value: string | number) => {
    setContainerRows(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }, [])

  const addContainerRow = useCallback(() => {
    setContainerRows(rows => [...rows, { ...DEFAULT_CONTAINER_ROW }])
  }, [])

  const removeContainerRow = useCallback((index: number) => {
    setContainerRows(rows => rows.filter((_, i) => i !== index))
  }, [])

  const updatePackage = useCallback((index: number, field: keyof PackageRow, value: string | number) => {
    setPackageRows(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }, [])

  const addPackageRow = useCallback(() => {
    setPackageRows(rows => [...rows, { ...DEFAULT_PACKAGE_ROW }])
  }, [])

  const removePackageRow = useCallback((index: number) => {
    setPackageRows(rows => rows.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!contractorId) {
      setError('Please select a client')
      return
    }
    if (!originLocationId || !destinationLocationId) {
      setError('Please select origin and destination locations')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const fileResponse = await apiCall<{ id: string; referenceNumber: string }>('/api/fms_files/files', {
        method: 'POST',
        body: JSON.stringify({
          shipmentType,
          cargoType,
          contractorId,
          notes: notes.trim() || null,
        }),
      })

      if (!fileResponse.ok || !fileResponse.result?.id) {
        setError('Failed to create file')
        setIsSubmitting(false)
        return
      }

      const fileId = fileResponse.result.id

      if (cargoType === 'FCL') {
        const unitRequests = containerRows.flatMap((row, i) =>
          Array.from({ length: row.count }, (_, j) =>
            apiCall(`/api/fms_files/files/${fileId}/units`, {
              method: 'POST',
              body: JSON.stringify({
                fileId,
                cargoType: 'FCL',
                originLocationId,
                destinationLocationId,
                containerType: row.containerType,
                sortOrder: i * 100 + j,
              }),
            })
          )
        )
        await Promise.all(unitRequests)
      } else {
        const unitRequests = packageRows.map((row, i) =>
          apiCall(`/api/fms_files/files/${fileId}/units`, {
            method: 'POST',
            body: JSON.stringify({
              fileId,
              cargoType: 'LCL',
              originLocationId,
              destinationLocationId,
              packageCount: row.count || null,
              grossWeight: row.grossWeight ? parseFloat(row.grossWeight) : null,
              weightUnit: row.grossWeight ? row.weightUnit : null,
              packagesDetail: [{ packageType: row.packageType, packageCount: row.count || null }],
              sortOrder: i,
            }),
          })
        )
        await Promise.all(unitRequests)
      }

      queryClient.invalidateQueries({ queryKey: ['fms-files'] })
      handleOpenChange(false)
      router.push(`/backend/fms-files/${fileId}`)
    } catch {
      setError('An unexpected error occurred')
      setIsSubmitting(false)
    }
  }, [
    contractorId, originLocationId, destinationLocationId,
    shipmentType, cargoType, notes,
    containerRows, packageRows,
    handleOpenChange, queryClient, router,
  ])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const selectClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground'
  const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Create New File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Shipment Type *</label>
              <select value={shipmentType} onChange={(e) => setShipmentType(e.target.value)} className={`mt-1 ${selectClass}`}>
                <option value="EXP">Export (EXP)</option>
                <option value="IMP">Import (IMP)</option>
                <option value="LOC">Local (LOC)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Cargo Type *</label>
              <select value={cargoType} onChange={(e) => setCargoType(e.target.value as 'FCL' | 'LCL')} className={`mt-1 ${selectClass}`}>
                <option value="FCL">FCL</option>
                <option value="LCL">LCL</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Client (BCO) *</label>
            <ContractorSearchInput
              value={contractorId}
              onChange={(id) => setContractorId(id)}
              placeholder="Search contractors..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Origin *</label>
              <LocationSearchInput
                value={originLocationId}
                onChange={(id) => setOriginLocationId(id)}
                placeholder="Origin location"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Destination *</label>
              <LocationSearchInput
                value={destinationLocationId}
                onChange={(id) => setDestinationLocationId(id)}
                placeholder="Destination location"
              />
            </div>
          </div>

          {cargoType === 'FCL' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-2 block">Containers</label>
              <div className="space-y-2">
                {containerRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={row.containerType}
                      onChange={(e) => updateContainer(i, 'containerType', e.target.value)}
                      className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                    >
                      {CONTAINER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={row.count}
                        onChange={(e) => updateContainer(i, 'count', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground text-center"
                      />
                      <span className="text-xs text-muted-foreground">pcs</span>
                    </div>
                    {containerRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContainerRow(i)}
                        className="text-muted-foreground hover:text-destructive text-base leading-none px-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addContainerRow}
                className="mt-2 text-xs text-primary hover:underline"
              >
                + Add container type
              </button>
            </div>
          )}

          {cargoType === 'LCL' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-2 block">Packages</label>
              <div className="space-y-2">
                {packageRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={row.packageType}
                      onChange={(e) => updatePackage(i, 'packageType', e.target.value)}
                      className="w-24 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground"
                    >
                      {PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={row.count || ''}
                        onChange={(e) => updatePackage(i, 'count', parseInt(e.target.value) || 0)}
                        className="w-16 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground text-center"
                        placeholder="Qty"
                      />
                      <span className="text-xs text-muted-foreground">pcs</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={row.grossWeight}
                        onChange={(e) => updatePackage(i, 'grossWeight', e.target.value)}
                        className="flex-1 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground"
                        placeholder="Weight"
                      />
                      <select
                        value={row.weightUnit}
                        onChange={(e) => updatePackage(i, 'weightUnit', e.target.value)}
                        className="w-16 rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground"
                      >
                        {WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    {packageRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePackageRow(i)}
                        className="text-muted-foreground hover:text-destructive text-base leading-none px-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPackageRow}
                className="mt-2 text-xs text-primary hover:underline"
              >
                + Add package line
              </button>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className={`mt-1 ${inputClass} placeholder:text-muted-foreground resize-none`}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !contractorId}>
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
