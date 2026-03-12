'use client'

import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Trash2, Truck, Package, Plane } from 'lucide-react'
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

interface TruckPresetOption {
  id: string
  name: string
  width: number
  length: number
  height: number
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
  totalRate?: string | null
  currencyCode?: string
  departureDate?: string | null
  totalChargeableWeight?: string | null
  totalPieces?: number | null
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

interface AcceptOfferDialogProps {
  offer: OfferDetails | null
  open: boolean
  onClose: () => void
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

export function AcceptOfferDialog({ offer, open, onClose }: AcceptOfferDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isAccepting, setIsAccepting] = useState(false)

  // Console configurations (multiple trucks) - starts EMPTY (optional)
  const [consoles, setConsoles] = useState<ConsoleConfig[]>([])

  // Reset consoles when dialog opens (start with empty list)
  useEffect(() => {
    if (open) {
      setConsoles([])
    }
  }, [open])

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

  // Fetch truck presets from API
  const { data: presetsData } = useQuery({
    queryKey: ['frc_truck_presets_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: TruckPresetOption[] }>('/api/frc_trucks/presets?limit=100&isActive=true')
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
    const firstPreset = presetsData?.items[0]
    setConsoles((prev) => [
      ...prev,
      {
        id: generateId(),
        truckId: '',
        originAirportId: offer?.originAirport?.id ?? '',
        destinationAirportId: offer?.destinationAirport?.id ?? '',
        truckPresetId: firstPreset?.id ?? '',
        date: new Date().toISOString().split('T')[0],
      },
    ])
  }, [offer, presetsData])

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

    // Only validate consoles if there are any configured
    if (consoles.length > 0) {
      const invalidConsoles = consoles.filter((c) => !c.truckId)
      if (invalidConsoles.length > 0) {
        flash('Please select a truck for all consoles', 'error')
        return
      }
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
            truckPresetId: c.truckPresetId || null,
            date: c.date,
          })),
        }),
      })

      if (response.ok && response.result?.ok) {
        const consoleCount = response.result.consoleIds.length
        const message = consoleCount > 0
          ? `Project ${response.result.projectNumber} created with ${consoleCount} console(s)`
          : `Project ${response.result.projectNumber} created`
        flash(message, 'success')
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

  const routeDisplay = [offer.originAirport?.code, offer.destinationAirport?.code]
    .filter(Boolean)
    .join(' - ') || 'Route not specified'

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent style={{ width: '100%', maxWidth: 700 }} onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            Accept Offer &amp; Create Project
          </DialogTitle>
          <DialogDescription>
            Accept offer &quot;{offer.name}&quot; and optionally configure truck loading consoles
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Offer Summary */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plane className="h-4 w-4" />
              Offer Summary
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Route</span>
                <p className="font-mono font-medium">{routeDisplay}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Departure</span>
                <p className="font-medium">{formatDate(offer.departureDate)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total Rate</span>
                <p className="font-medium">
                  {offer.totalRate ? `${formatNumber(offer.totalRate)} ${offer.currencyCode ?? 'EUR'}` : '-'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Cargo</span>
                <p className="font-medium">
                  {offer.totalPieces ?? '-'} pcs, {formatNumber(offer.totalChargeableWeight)} kg
                </p>
              </div>
            </div>
          </div>

          {/* Console Configurations (Optional) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Truck Loading Consoles</h3>
                <span className="text-xs text-muted-foreground">(optional)</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addConsole}>
                <Plus className="h-4 w-4 mr-1" />
                Add Console
              </Button>
            </div>

            {consoles.length === 0 ? (
              <div className="border border-dashed rounded-lg p-6 text-center">
                <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No consoles configured. You can add them later from the project page.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={addConsole}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Console Now
                </Button>
              </div>
            ) : (
              consoles.map((console_, index) => (
                <div
                  key={console_.id}
                  className="border rounded-lg p-4 space-y-3 relative"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Console {index + 1}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeConsole(console_.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
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
                        <option value="">Select truck type...</option>
                        {presetsData?.items.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name} ({preset.width}x{preset.length}x{preset.height}cm)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isAccepting}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={isAccepting}>
            {isAccepting ? 'Creating...' : (
              consoles.length > 0
                ? `Accept & Create Project with ${consoles.length} Console(s)`
                : 'Accept & Create Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
