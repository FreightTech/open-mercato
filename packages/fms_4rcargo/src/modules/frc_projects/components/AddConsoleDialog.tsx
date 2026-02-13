'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface AddConsoleDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface TruckOption {
  id: string
  name: string
}

interface AirportOption {
  id: string
  code: string
  city: string | null
}

const TRUCK_PRESETS = [
  { id: 'standard', label: 'Standard Semi-Trailer (245x1360x280cm)' },
  { id: 'mega', label: 'Mega Trailer (245x1360x300cm)' },
  { id: 'tandem', label: 'Tandem (245x770x300cm)' },
  { id: 'container_20ft', label: '20ft Container (235x590x239cm)' },
  { id: 'container_40ft', label: '40ft Container (235x1203x239cm)' },
  { id: 'container_40hc', label: '40ft HC Container (235x1203x269cm)' },
]

export function AddConsoleDialog({ projectId, open, onOpenChange, onSuccess }: AddConsoleDialogProps) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [truckId, setTruckId] = useState<string>('')
  const [originAirportId, setOriginAirportId] = useState<string>('')
  const [destinationAirportId, setDestinationAirportId] = useState<string>('')
  const [truckPresetId, setTruckPresetId] = useState('standard')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch trucks
  const { data: trucksData } = useQuery({
    queryKey: ['frc_trucks_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: TruckOption[] }>('/api/frc_trucks/trucks?limit=100&isActive=true')
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
    enabled: open,
  })

  // Fetch airports
  const { data: airportsData } = useQuery({
    queryKey: ['frc_airports_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: AirportOption[] }>('/api/frc_airports/airports?limit=200&isActive=true')
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
    enabled: open,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!truckId) {
      flash('Please select a truck', 'error')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await apiCall<{ id: string; name: string }>('/api/frc_console/console', {
        method: 'POST',
        body: JSON.stringify({
          date,
          truckId,
          originAirportId: originAirportId || null,
          destinationAirportId: destinationAirportId || null,
          truckPresetId,
          projectId,
        }),
      })

      if (response.ok && response.result) {
        flash(`Console "${response.result.name}" created`, 'success')
        onSuccess()
        // Reset form
        setDate(new Date().toISOString().split('T')[0])
        setTruckId('')
        setOriginAirportId('')
        setDestinationAirportId('')
        setTruckPresetId('standard')
      } else {
        flash('Failed to create console', 'error')
      }
    } catch {
      flash('Failed to create console', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isSubmitting) {
      e.preventDefault()
      const form = e.currentTarget.closest('form')
      if (form) form.requestSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onKeyDown={handleKeyDown}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Console to Project</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Date
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="truck" className="text-right">
                Truck
              </Label>
              <select
                id="truck"
                value={truckId}
                onChange={(e) => setTruckId(e.target.value)}
                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                <option value="">Select truck...</option>
                {trucksData?.items.map((truck) => (
                  <option key={truck.id} value={truck.id}>
                    {truck.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="origin" className="text-right">
                Origin
              </Label>
              <select
                id="origin"
                value={originAirportId}
                onChange={(e) => setOriginAirportId(e.target.value)}
                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select origin airport...</option>
                {airportsData?.items.map((airport) => (
                  <option key={airport.id} value={airport.id}>
                    {airport.code} - {airport.city ?? 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="destination" className="text-right">
                Destination
              </Label>
              <select
                id="destination"
                value={destinationAirportId}
                onChange={(e) => setDestinationAirportId(e.target.value)}
                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select destination airport...</option>
                {airportsData?.items.map((airport) => (
                  <option key={airport.id} value={airport.id}>
                    {airport.code} - {airport.city ?? 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="preset" className="text-right">
                Truck Type
              </Label>
              <select
                id="preset"
                value={truckPresetId}
                onChange={(e) => setTruckPresetId(e.target.value)}
                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TRUCK_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Add Console'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
