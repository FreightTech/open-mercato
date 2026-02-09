'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Building2, Warehouse, FileText, Package, MoreHorizontal, Anchor, Ship, ToggleLeft } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs/ComboboxInput'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { GooglePlacesAutocomplete, type PlaceDetails } from './GooglePlacesAutocomplete'
import type { LocationType } from '../data/types'
import {
  MARITIME_LOCATION_TYPES,
  CONTRACTOR_ADDRESS_TYPES,
  isContractorAddressType,
} from '../data/types'

// Location type options with icons and labels
const LOCATION_TYPE_OPTIONS: Array<{
  value: LocationType
  label: string
  icon: React.ComponentType<{ className?: string }>
  group: 'maritime' | 'address'
  description?: string
}> = [
  { value: 'port', label: 'Port', icon: Anchor, group: 'maritime', description: 'Maritime port' },
  { value: 'terminal', label: 'Terminal', icon: Ship, group: 'maritime', description: 'Port terminal' },
  { value: 'contractor_office', label: 'Office', icon: Building2, group: 'address', description: 'Main office' },
  { value: 'contractor_warehouse', label: 'Warehouse', icon: Warehouse, group: 'address', description: 'Storage facility' },
  { value: 'contractor_billing', label: 'Billing', icon: FileText, group: 'address', description: 'Billing address' },
  { value: 'contractor_shipping', label: 'Shipping', icon: Package, group: 'address', description: 'Shipping address' },
  { value: 'contractor_other', label: 'Other', icon: MoreHorizontal, group: 'address', description: 'Other address' },
]

interface Port {
  id: string
  code: string
  name: string
}

interface LocationFormData {
  code: string
  name: string
  type: LocationType
  locode: string
  portId: string
  lat: string
  lng: string
  city: string
  country: string
  contractorId: string
  addressLine1: string
  addressLine2: string
  state: string
  postalCode: string
  isPrimary: boolean
  isActive: boolean
  googlePlaceId: string
}

interface LocationData {
  id: string
  code: string
  name: string
  type: LocationType
  locode?: string | null
  portId?: string | null
  lat?: number | null
  lng?: number | null
  city?: string | null
  country?: string | null
  contractorId?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  state?: string | null
  postalCode?: string | null
  isPrimary?: boolean
  isActive?: boolean
  googlePlaceId?: string | null
}

interface LocationDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  /** Pre-select location type (for create mode) */
  locationType?: LocationType
  /** Auto-link to contractor (for contractor addresses) */
  contractorId?: string
  /** Location ID (for edit mode) */
  locationId?: string
  /** Callback when location is saved */
  onSaved?: (location: { id: string }) => void
}

const initialFormData: LocationFormData = {
  code: '',
  name: '',
  type: 'port',
  locode: '',
  portId: '',
  lat: '',
  lng: '',
  city: '',
  country: '',
  contractorId: '',
  addressLine1: '',
  addressLine2: '',
  state: '',
  postalCode: '',
  isPrimary: false,
  isActive: true,
  googlePlaceId: '',
}

export function LocationDrawer({
  open,
  onOpenChange,
  mode,
  locationType,
  contractorId,
  locationId,
  onSaved,
}: LocationDrawerProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [useAutocomplete, setUseAutocomplete] = useState(true)
  const [formData, setFormData] = useState<LocationFormData>({
    ...initialFormData,
    type: locationType || 'port',
    contractorId: contractorId || '',
  })

  // Fetch location data for edit mode
  const { data: locationData, isLoading: isLoadingLocation } = useQuery({
    queryKey: ['fms_location', locationId],
    queryFn: async () => {
      if (!locationId) return null
      const response = await apiCall<LocationData>(`/api/fms_locations/locations/${locationId}`)
      if (!response.ok) throw new Error('Failed to load location')
      return response.result
    },
    enabled: mode === 'edit' && !!locationId && open,
  })

  // Fetch parent port details if portId is set
  const { data: parentPortData } = useQuery({
    queryKey: ['fms_port', locationData?.portId],
    queryFn: async () => {
      if (!locationData?.portId) return null
      const response = await apiCall<Port>(`/api/fms_locations/ports/${locationData.portId}`)
      if (!response.ok) return null
      return response.result
    },
    enabled: !!locationData?.portId && open,
  })

  // Load ports for terminal type (async search)
  const loadPorts = useCallback(async (query?: string): Promise<ComboboxOption[]> => {
    const params = new URLSearchParams({ limit: '20' })
    if (query) params.set('search', query)
    const response = await apiCall<{ items: Port[] }>(`/api/fms_locations/ports?${params.toString()}`)
    if (!response.ok) return []
    return (response.result?.items ?? []).map((port) => ({
      value: port.id,
      label: `${port.code} - ${port.name}`,
      description: port.name,
    }))
  }, [])

  // Resolve port label for display
  const resolvePortLabel = useCallback((portId: string) => {
    if (parentPortData && parentPortData.id === portId) {
      return `${parentPortData.code} - ${parentPortData.name}`
    }
    return portId
  }, [parentPortData])

  // Reset form when drawer opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && locationData) {
        setFormData({
          code: locationData.code || '',
          name: locationData.name || '',
          type: locationData.type || 'port',
          locode: locationData.locode || '',
          portId: locationData.portId || '',
          lat: locationData.lat?.toString() || '',
          lng: locationData.lng?.toString() || '',
          city: locationData.city || '',
          country: locationData.country || '',
          contractorId: locationData.contractorId || contractorId || '',
          addressLine1: locationData.addressLine1 || '',
          addressLine2: locationData.addressLine2 || '',
          state: locationData.state || '',
          postalCode: locationData.postalCode || '',
          isPrimary: locationData.isPrimary ?? false,
          isActive: locationData.isActive ?? true,
          googlePlaceId: locationData.googlePlaceId || '',
        })
      } else {
        setFormData({
          ...initialFormData,
          type: locationType || 'port',
          contractorId: contractorId || '',
        })
      }
    }
  }, [open, mode, locationData, locationType, contractorId])

  // Handle Google Places selection
  const handlePlaceSelect = useCallback((details: PlaceDetails) => {
    setFormData((prev) => {
      const isAddress = isContractorAddressType(prev.type)
      // For addresses use postal code as-is, for ports/terminals use city code
      const autoCode = isAddress
        ? (details.postalCode || '').trim()
        : (details.city || '').toUpperCase().substring(0, 10).replace(/\s+/g, '-')

      return {
        ...prev,
        addressLine1: details.addressLine1 || '',
        addressLine2: details.addressLine2 || '',
        city: details.city || '',
        state: details.state || '',
        postalCode: details.postalCode || '',
        country: details.country || '',
        lat: details.location.lat.toString(),
        lng: details.location.lng.toString(),
        googlePlaceId: details.placeId,
        // Always update code from postal code when selecting an address
        code: autoCode || prev.code,
        // Auto-set name from formatted address if empty
        name: prev.name || details.formattedAddress.split(',')[0] || '',
      }
    })
  }, [])

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setIsSubmitting(true)

      try {
        const isContractorAddress = isContractorAddressType(formData.type)

        // Auto-generate code from postal code if empty (for addresses)
        let code = formData.code
        if (!code && isContractorAddress && formData.postalCode) {
          code = formData.postalCode.trim()
        }

        const payload = {
          code: code || null,
          name: formData.name,
          type: formData.type,
          locode: formData.locode || null,
          portId: formData.portId || null,
          lat: formData.lat ? parseFloat(formData.lat) : null,
          lng: formData.lng ? parseFloat(formData.lng) : null,
          city: formData.city || null,
          country: formData.country || null,
          contractorId: isContractorAddress ? (formData.contractorId || null) : null,
          addressLine1: formData.addressLine1 || null,
          addressLine2: formData.addressLine2 || null,
          state: formData.state || null,
          postalCode: formData.postalCode || null,
          isPrimary: formData.isPrimary,
          isActive: formData.isActive,
          googlePlaceId: formData.googlePlaceId || null,
        }

        let response: { ok: boolean; result?: { id: string; error?: string } | null }

        if (mode === 'edit' && locationId) {
          response = await apiCall<{ id: string; error?: string }>(
            `/api/fms_locations/unified/${locationId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          )
        } else {
          response = await apiCall<{ id: string; error?: string }>('/api/fms_locations/unified', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        }

        if (response.ok && response.result?.id) {
          flash(
            mode === 'edit' ? 'Location updated successfully' : 'Location created successfully',
            'success'
          )
          queryClient.invalidateQueries({ queryKey: ['fms_locations'] })
          queryClient.invalidateQueries({ queryKey: ['fms_location', locationId] })
          onSaved?.({ id: response.result.id })
          onOpenChange(false)
        } else {
          flash(response.result?.error || 'Failed to save location', 'error')
        }
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Failed to save location', 'error')
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, mode, locationId, queryClient, onSaved, onOpenChange]
  )

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit(e as unknown as React.FormEvent)
      }
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    },
    [handleSubmit, onOpenChange]
  )

  // Determine which fields to show based on location type
  const isContractorAddress = isContractorAddressType(formData.type)
  const isPort = formData.type === 'port'
  const isTerminal = formData.type === 'terminal'

  // Group location type options
  const maritimeOptions = LOCATION_TYPE_OPTIONS.filter((opt) => opt.group === 'maritime')
  const addressOptions = LOCATION_TYPE_OPTIONS.filter((opt) => opt.group === 'address')

  const title = useMemo(() => {
    if (mode === 'edit') {
      return t('fms_locations.drawer.editTitle', 'Edit Location')
    }
    const typeOption = LOCATION_TYPE_OPTIONS.find((opt) => opt.value === formData.type)
    return `Create ${typeOption?.label || 'Location'}`
  }, [mode, formData.type, t])

  if (mode === 'edit' && isLoadingLocation) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="flex flex-col p-0"
          style={{ width: '500px', maxWidth: '500px' }}
          overlayClassName="backdrop-blur-none"
        >
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Spinner className="h-6 w-6" />
            <span className="text-sm text-gray-500">Loading location...</span>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex flex-col p-0"
        style={{ width: '500px', maxWidth: '500px' }}
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        <div className="flex-shrink-0 p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {title}
            </SheetTitle>
            <SheetDescription>
              {isContractorAddress
                ? 'Add or edit a contractor address with Google Places autocomplete.'
                : 'Add or edit a maritime location (port or terminal).'}
            </SheetDescription>
          </SheetHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Location Type Selector */}
          <div className="space-y-2">
            <Label>Location Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Maritime</div>
                <div className="space-y-1">
                  {maritimeOptions.map((option) => {
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: option.value })}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors ${
                          formData.type === option.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input hover:bg-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Address</div>
                <div className="space-y-1">
                  {addressOptions.map((option) => {
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: option.value })}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors ${
                          formData.type === option.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input hover:bg-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Google Places Autocomplete (for address types) */}
          {isContractorAddress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Address Search</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Autocomplete</span>
                  <Switch
                    checked={useAutocomplete}
                    onCheckedChange={setUseAutocomplete}
                    className="scale-75"
                  />
                </div>
              </div>
              {useAutocomplete && (
                <GooglePlacesAutocomplete
                  placeholder="Search for an address..."
                  onPlaceSelect={handlePlaceSelect}
                />
              )}
            </div>
          )}

          {/* Basic Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder={isPort ? 'PLGDN' : isTerminal ? 'PLGDN-DCT' : 'Auto from postal code'}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder={isPort ? 'Port of Gdansk' : isTerminal ? 'Baltic Hub' : 'Main Office'}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Port-specific: LOCODE */}
          {isPort && (
            <div className="space-y-2">
              <Label htmlFor="locode">UN/LOCODE *</Label>
              <Input
                id="locode"
                placeholder="PLGDN"
                value={formData.locode}
                onChange={(e) => setFormData({ ...formData, locode: e.target.value.toUpperCase() })}
                required={isPort}
              />
            </div>
          )}

          {/* Terminal-specific: Port selector */}
          {isTerminal && (
            <div className="space-y-2">
              <Label>Parent Port</Label>
              <ComboboxInput
                value={formData.portId}
                onChange={(value) => setFormData({ ...formData, portId: value })}
                placeholder="Search for a port..."
                loadSuggestions={loadPorts}
                resolveLabel={resolvePortLabel}
                allowCustomValues={false}
              />
            </div>
          )}

          {/* Address Fields (for contractor addresses) */}
          {isContractorAddress && (
            <>
              <div className="space-y-2">
                <Label htmlFor="addressLine1">Address Line 1</Label>
                <Input
                  id="addressLine1"
                  placeholder="123 Main Street"
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressLine2">Address Line 2</Label>
                <Input
                  id="addressLine2"
                  placeholder="Suite 100"
                  value={formData.addressLine2}
                  onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="New York"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    placeholder="NY"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    placeholder="10001"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    placeholder="United States"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {/* Location/City/Country for maritime types */}
          {!isContractorAddress && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="Gdansk"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    placeholder="Poland"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                type="number"
                step="any"
                placeholder="54.3520"
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                type="number"
                step="any"
                placeholder="18.6466"
                value={formData.lng}
                onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
              />
            </div>
          </div>

          {/* Primary/Active flags (for contractor addresses) */}
          {isContractorAddress && (
            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="isPrimary"
                  checked={formData.isPrimary}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPrimary: checked })}
                />
                <Label htmlFor="isPrimary" className="cursor-pointer">
                  Primary Address
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
          )}
          </div>

          {/* Sticky footer */}
          <div className="flex-shrink-0 border-t bg-background p-6">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Saving...
                  </>
                ) : mode === 'edit' ? (
                  'Save Changes'
                ) : (
                  'Create Location'
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export type { LocationDrawerProps, LocationData }
