'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Trash2, Truck } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface TruckOption {
  id: string
  name: string
}

interface AirportOption {
  id: string
  code: string
  city: string | null
}

interface OfferDetails {
  id: string
  name: string
  rfqId: string
  originAirport?: { id: string; code: string; city: string | null } | null
  destinationAirport?: { id: string; code: string; city: string | null } | null
}

interface ConsoleConfig {
  id: string
  truckId: string
  originAirportId: string
  destinationAirportId: string
  truckPresetId: string
  date: string
}

const TRUCK_PRESETS = [
  { id: 'standard', label: 'Standard Semi-Trailer (245x1360x280cm)' },
  { id: 'mega', label: 'Mega Trailer (245x1360x300cm)' },
  { id: 'tandem', label: 'Tandem (245x770x300cm)' },
  { id: 'container_20ft', label: '20ft Container (235x590x239cm)' },
  { id: 'container_40ft', label: '40ft Container (235x1203x239cm)' },
  { id: 'container_40hc', label: '40ft HC Container (235x1203x269cm)' },
]

interface AcceptOfferDialogProps {
  offer: OfferDetails | null
  open: boolean
  onClose: () => void
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function AcceptOfferDialog({ offer, open, onClose }: AcceptOfferDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isAccepting, setIsAccepting] = useState(false)

  // Console configurations (multiple trucks)
  const [consoles, setConsoles] = useState<ConsoleConfig[]>([])

  // Initialize with one console when dialog opens
  useEffect(() => {
    if (open && offer) {
      setConsoles([
        {
          id: generateId(),
          truckId: '',
          originAirportId: offer.originAirport?.id ?? '',
          destinationAirportId: offer.destinationAirport?.id ?? '',
          truckPresetId: 'standard',
          date: new Date().toISOString().split('T')[0],
        },
      ])
    }
  }, [open, offer])

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

  const addConsole = useCallback(() => {
    setConsoles((prev) => [
      ...prev,
      {
        id: generateId(),
        truckId: '',
        originAirportId: offer?.originAirport?.id ?? '',
        destinationAirportId: offer?.destinationAirport?.id ?? '',
        truckPresetId: 'standard',
        date: new Date().toISOString().split('T')[0],
      },
    ])
  }, [offer])

  const removeConsole = useCallback((id: string) => {
    setConsoles((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateConsole = useCallback((id: string, field: keyof ConsoleConfig, value: string) => {
    setConsoles((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }, [])

  const handleAccept = useCallback(async () => {
    if (!offer) return

    // Validate all consoles have a truck selected
    const invalidConsoles = consoles.filter((c) => !c.truckId)
    if (invalidConsoles.length > 0) {
      flash('Please select a truck for all consoles', 'error')
      return
    }

    if (consoles.length === 0) {
      flash('Please add at least one console', 'error')
      return
    }

    setIsAccepting(true)

    try {
      const response = await apiCall<{
        ok: boolean
        projectId: string
        projectNumber: string
        consoleIds: string[]
      }>(`/api/frc_offers/offers/${offer.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consoles: consoles.map((c) => ({
            truckId: c.truckId,
            originAirportId: c.originAirportId || null,
            destinationAirportId: c.destinationAirportId || null,
            truckPresetId: c.truckPresetId,
            date: c.date,
          })),
        }),
      })

      if (response.ok && response.result?.ok) {
        flash(`Project ${response.result.projectNumber} created with ${response.result.consoleIds.length} console(s)`, 'success')
        queryClient.invalidateQueries({ queryKey: ['frc_offers'] })
        queryClient.invalidateQueries({ queryKey: ['frc_projects'] })
        onClose()
        router.push(`/backend/frc-projects/${response.result.projectId}`)
      } else {
        flash('Failed to accept offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsAccepting(false)
    }
  }, [offer, consoles, queryClient, onClose, router])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isAccepting) {
        e.preventDefault()
        handleAccept()
      }
    },
    [handleAccept, isAccepting]
  )

  if (!offer) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent style={{ width: '100%', maxWidth: 700 }} onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            Accept Offer &amp; Create Project
          </DialogTitle>
          <DialogDescription>
            Accept offer &quot;{offer.name}&quot; and configure truck loading consoles
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Offer Info */}
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <div className="text-sm">
              <span className="font-medium">Route: </span>
              <span>{offer.originAirport?.code ?? '?'} - {offer.destinationAirport?.code ?? '?'}</span>
            </div>
          </div>

          {/* Console Configurations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Truck Loading Consoles</h3>
              <Button type="button" variant="outline" size="sm" onClick={addConsole}>
                <Plus className="h-4 w-4 mr-1" />
                Add Console
              </Button>
            </div>

            {consoles.map((console_, index) => (
              <div
                key={console_.id}
                className="border rounded-lg p-4 space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Console {index + 1}</span>
                  </div>
                  {consoles.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeConsole(console_.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`truck-${console_.id}`}>Truck *</Label>
                    <select
                      id={`truck-${console_.id}`}
                      value={console_.truckId}
                      onChange={(e) => updateConsole(console_.id, 'truckId', e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

                  <div className="space-y-2">
                    <Label htmlFor={`date-${console_.id}`}>Date</Label>
                    <Input
                      id={`date-${console_.id}`}
                      type="date"
                      value={console_.date}
                      onChange={(e) => updateConsole(console_.id, 'date', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`origin-${console_.id}`}>Origin Airport</Label>
                    <select
                      id={`origin-${console_.id}`}
                      value={console_.originAirportId}
                      onChange={(e) => updateConsole(console_.id, 'originAirportId', e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select origin...</option>
                      {airportsData?.items.map((airport) => (
                        <option key={airport.id} value={airport.id}>
                          {airport.code} - {airport.city ?? 'Unknown'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`dest-${console_.id}`}>Destination Airport</Label>
                    <select
                      id={`dest-${console_.id}`}
                      value={console_.destinationAirportId}
                      onChange={(e) => updateConsole(console_.id, 'destinationAirportId', e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select destination...</option>
                      {airportsData?.items.map((airport) => (
                        <option key={airport.id} value={airport.id}>
                          {airport.code} - {airport.city ?? 'Unknown'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label htmlFor={`preset-${console_.id}`}>Truck Type</Label>
                    <select
                      id={`preset-${console_.id}`}
                      value={console_.truckPresetId}
                      onChange={(e) => updateConsole(console_.id, 'truckPresetId', e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {TRUCK_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

            {consoles.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No consoles configured. Click &quot;Add Console&quot; to add a truck.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isAccepting}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={isAccepting || consoles.length === 0}>
            {isAccepting ? 'Creating...' : `Accept & Create Project`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
