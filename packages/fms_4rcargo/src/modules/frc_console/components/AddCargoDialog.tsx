'use client'

import * as React from 'react'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Package, Calendar, Plus, Minus } from 'lucide-react'
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

interface ConsoleSuggestion {
  id: string
  name: string
  date: string | null
  status: string
  airCargo: CargoWithAllocation[]
  rfqName: string | null
}

interface SuggestionsResponse {
  suggestions: ConsoleSuggestion[]
}

interface AddCargoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  consoleId: string
}

interface CargoSelection {
  cargoId: string
  quantity: number
  cargo: CargoWithAllocation
}

export function AddCargoDialog({ open, onOpenChange, onSuccess, consoleId }: AddCargoDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selections, setSelections] = useState<Map<string, CargoSelection>>(new Map())
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch cargo suggestions (available cargo from linked RFQs)
  const { data, isLoading } = useQuery({
    queryKey: ['frc_console_cargo_suggestions', consoleId],
    queryFn: async () => {
      const result = await apiCall<SuggestionsResponse>(`/api/frc_console/console/${consoleId}/bookings`)
      if (!result.ok) throw new Error('Failed to load available cargo')
      return result.result
    },
    enabled: open,
  })

  const suggestions = data?.suggestions ?? []

  // Flatten all cargo with available pieces
  const allAvailableCargo = useMemo(() => {
    const cargoList: Array<CargoWithAllocation & { rfqName: string | null }> = []
    for (const suggestion of suggestions) {
      for (const cargo of suggestion.airCargo) {
        if (cargo.availablePieces > 0) {
          cargoList.push({ ...cargo, rfqName: suggestion.rfqName })
        }
      }
    }
    return cargoList
  }, [suggestions])

  // Filter by search query
  const filteredCargo = useMemo(() => {
    if (!searchQuery.trim()) return allAvailableCargo
    const query = searchQuery.toLowerCase()
    return allAvailableCargo.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.rfqName?.toLowerCase().includes(query)
    )
  }, [allAvailableCargo, searchQuery])

  // Count total selected items
  const totalSelected = useMemo(() => {
    let count = 0
    for (const selection of selections.values()) {
      count += selection.quantity
    }
    return count
  }, [selections])

  const updateQuantity = (cargo: CargoWithAllocation, delta: number) => {
    setSelections((prev) => {
      const next = new Map(prev)
      const key = cargo.id
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
          next.set(key, { cargoId: cargo.id, quantity: newQty, cargo })
        }
      }

      return next
    })
  }

  const setQuantity = (cargo: CargoWithAllocation, value: number) => {
    setSelections((prev) => {
      const next = new Map(prev)
      const key = cargo.id

      const clampedValue = Math.max(0, Math.min(cargo.availablePieces, value))
      if (clampedValue === 0) {
        next.delete(key)
      } else {
        next.set(key, { cargoId: cargo.id, quantity: clampedValue, cargo })
      }

      return next
    })
  }

  const getQuantity = (cargoId: string): number => {
    return selections.get(cargoId)?.quantity ?? 0
  }

  const handleSubmit = async () => {
    if (selections.size === 0) {
      flash('Please select at least one cargo item', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      // Build items array
      const items: Array<{ airCargoId: string; quantity: number }> = []
      for (const selection of selections.values()) {
        items.push({
          airCargoId: selection.cargoId,
          quantity: selection.quantity,
        })
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
            Select cargo items to add to this truck loading console.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cargo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Cargo list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : filteredCargo.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? 'No cargo matches your search' : 'No cargo available to add'}
            </p>
          ) : (
            filteredCargo.map((cargo) => {
              const currentQty = getQuantity(cargo.id)
              const isDisabled = cargo.availablePieces === 0

              return (
                <div
                  key={cargo.id}
                  className={`flex items-center justify-between p-3 rounded-lg border bg-card ${
                    isDisabled ? 'opacity-50' : ''
                  } ${currentQty > 0 ? 'border-primary' : ''}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{cargo.name}</span>
                      {cargo.rfqName && (
                        <Badge variant="secondary" className="text-xs">
                          {cargo.rfqName}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {cargo.widthCm ?? '?'}x{cargo.lengthCm ?? '?'}x{cargo.heightCm ?? '?'} cm |{' '}
                      {cargo.actualWeightKg} kg |{' '}
                      {cargo.stackableType === 'fully_stackable'
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
                      onClick={() => updateQuantity(cargo, -1)}
                      disabled={isDisabled || currentQty === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={cargo.availablePieces}
                      value={currentQty}
                      onChange={(e) => setQuantity(cargo, parseInt(e.target.value) || 0)}
                      disabled={isDisabled}
                      className="w-16 h-8 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(cargo, 1)}
                      disabled={isDisabled || currentQty >= cargo.availablePieces}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })
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
