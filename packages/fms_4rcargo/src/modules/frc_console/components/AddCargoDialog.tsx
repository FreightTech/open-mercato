'use client'

import * as React from 'react'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Package, Calendar, CheckCircle2, Plus, Minus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface CargoWithAllocation {
  id: string
  name: string
  numberOfPieces: number
  allocatedPieces: number
  availablePieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string
  stackableType: string
}

interface BookingSuggestion {
  id: string
  name: string
  date: string | null
  status: string
  isMatching: boolean
  airCargo: CargoWithAllocation[]
  rfqName: string | null
}

interface BookingsResponse {
  suggestions: BookingSuggestion[]
}

interface AddCargoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  consoleId: string
}

interface CargoSelection {
  cargoId: string
  bookingId: string
  quantity: number
  cargo: CargoWithAllocation
}

export function AddCargoDialog({ open, onOpenChange, onSuccess, consoleId }: AddCargoDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selections, setSelections] = useState<Map<string, CargoSelection>>(new Map())
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch booking suggestions
  const { data, isLoading } = useQuery({
    queryKey: ['frc_console_bookings', consoleId],
    queryFn: async () => {
      const result = await apiCall<BookingsResponse>(`/api/frc_console/console/${consoleId}/bookings`)
      if (!result.ok) throw new Error('Failed to load bookings')
      return result.result
    },
    enabled: open,
  })

  const suggestions = data?.suggestions ?? []

  // Filter suggestions by search query
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return suggestions
    const query = searchQuery.toLowerCase()
    return suggestions.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.rfqName?.toLowerCase().includes(query) ||
        s.airCargo.some((c) => c.name.toLowerCase().includes(query))
    )
  }, [suggestions, searchQuery])

  // Count total selected items
  const totalSelected = useMemo(() => {
    let count = 0
    for (const selection of selections.values()) {
      count += selection.quantity
    }
    return count
  }, [selections])

  const updateQuantity = (cargo: CargoWithAllocation, bookingId: string, delta: number) => {
    setSelections((prev) => {
      const next = new Map(prev)
      const key = `${cargo.id}-${bookingId}`
      const existing = next.get(key)

      if (existing) {
        const newQty = Math.max(0, Math.min(cargo.availablePieces, existing.quantity + delta))
        if (newQty === 0) {
          next.delete(key)
        } else {
          next.set(key, { ...existing, quantity: newQty })
        }
      } else if (delta > 0) {
        const newQty = Math.min(delta, cargo.availablePieces)
        if (newQty > 0) {
          next.set(key, { cargoId: cargo.id, bookingId, quantity: newQty, cargo })
        }
      }

      return next
    })
  }

  const setQuantity = (cargo: CargoWithAllocation, bookingId: string, value: number) => {
    setSelections((prev) => {
      const next = new Map(prev)
      const key = `${cargo.id}-${bookingId}`

      const clampedValue = Math.max(0, Math.min(cargo.availablePieces, value))
      if (clampedValue === 0) {
        next.delete(key)
      } else {
        next.set(key, { cargoId: cargo.id, bookingId, quantity: clampedValue, cargo })
      }

      return next
    })
  }

  const getQuantity = (cargoId: string, bookingId: string): number => {
    return selections.get(`${cargoId}-${bookingId}`)?.quantity ?? 0
  }

  const handleSubmit = async () => {
    if (selections.size === 0) {
      flash('Please select at least one cargo item', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      // Group by booking for single POST per booking
      const byBooking = new Map<string, Array<{ airCargoId: string; quantity: number }>>()
      for (const selection of selections.values()) {
        const list = byBooking.get(selection.bookingId) || []
        list.push({ airCargoId: selection.cargoId, quantity: selection.quantity })
        byBooking.set(selection.bookingId, list)
      }

      // Submit all items
      const items: Array<{ airCargoId: string; quantity: number; truckBookingId: string }> = []
      for (const [bookingId, cargoList] of byBooking) {
        for (const cargo of cargoList) {
          items.push({
            airCargoId: cargo.airCargoId,
            quantity: cargo.quantity,
            truckBookingId: bookingId,
          })
        }
      }

      const result = await apiCall(`/api/frc_console/console/${consoleId}/cargo`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      })

      if (result.ok) {
        flash(`Added ${totalSelected} cargo item(s) to console`, 'success')
        setSelections(new Map())
        setSearchQuery('')
        onSuccess()
      } else {
        flash('Failed to add cargo items', 'error')
      }
    } catch {
      flash('Failed to add cargo items', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSelections(new Map())
    setSearchQuery('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Cargo to Console</DialogTitle>
          <DialogDescription>
            Select cargo items from bookings to add to this truck loading console.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bookings or cargo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Bookings list */}
        <div className="flex-1 overflow-y-auto space-y-4 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? 'No bookings match your search' : 'No bookings available'}
            </p>
          ) : (
            filteredSuggestions.map((booking) => (
              <div
                key={booking.id}
                className="border rounded-lg p-4 space-y-3"
              >
                {/* Booking header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{booking.name}</span>
                    {booking.isMatching && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Matching
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {booking.rfqName && <span>{booking.rfqName}</span>}
                    {booking.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(booking.date).toLocaleDateString()}
                      </span>
                    )}
                    <Badge variant="outline">{booking.status}</Badge>
                  </div>
                </div>

                {/* Cargo items */}
                {booking.airCargo.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No cargo items in this booking</p>
                ) : (
                  <div className="space-y-2">
                    {booking.airCargo.map((cargo) => {
                      const currentQty = getQuantity(cargo.id, booking.id)
                      const isDisabled = cargo.availablePieces === 0

                      return (
                        <div
                          key={cargo.id}
                          className={`flex items-center justify-between p-2 rounded-md bg-muted/50 ${
                            isDisabled ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">{cargo.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {cargo.widthCm ?? '?'}x{cargo.lengthCm ?? '?'}x{cargo.heightCm ?? '?'} cm |{' '}
                              {cargo.actualWeightKg} kg |{' '}
                              {cargo.stackableType === 'stackable'
                                ? 'Stackable'
                                : cargo.stackableType === 'top_only'
                                ? 'Top only'
                                : 'Not stackable'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Available: {cargo.availablePieces} / {cargo.numberOfPieces}
                              {cargo.allocatedPieces > 0 && (
                                <span className="text-amber-600"> ({cargo.allocatedPieces} already allocated)</span>
                              )}
                            </div>
                          </div>

                          {/* Quantity controls */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(cargo, booking.id, -1)}
                              disabled={isDisabled || currentQty === 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              max={cargo.availablePieces}
                              value={currentQty}
                              onChange={(e) => setQuantity(cargo, booking.id, parseInt(e.target.value) || 0)}
                              disabled={isDisabled}
                              className="w-16 h-8 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(cargo, booking.id, 1)}
                              disabled={isDisabled || currentQty >= cargo.availablePieces}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex-1 text-sm text-muted-foreground">
            {totalSelected > 0 && <span>{totalSelected} item(s) selected</span>}
          </div>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || totalSelected === 0}>
            {isSubmitting ? <Spinner className="mr-2" size="sm" /> : null}
            Add to Console
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
