'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, MapPin, Building2, Warehouse, FileText, Package, MoreHorizontal, Check, Star } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  DynamicTable,
  TableSkeleton,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { LocationDrawer } from '../../fms_locations/components/LocationDrawer'
import type { LocationType, ContractorAddressType } from '../../fms_locations/data/types'

interface ContractorLocation {
  id: string
  code: string
  name: string
  type: LocationType
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  isPrimary: boolean
  isActive: boolean
}

interface ContractorLocationsTabProps {
  contractorId: string
  onUpdated?: () => void
}

// Type colors
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  contractor_office: { bg: '#e0e7ff', text: '#3730a3' },
  contractor_warehouse: { bg: '#dcfce7', text: '#166534' },
  contractor_billing: { bg: '#f3e8ff', text: '#7c3aed' },
  contractor_shipping: { bg: '#cffafe', text: '#0e7490' },
  contractor_other: { bg: '#f3f4f6', text: '#374151' },
}

const TYPE_LABELS: Record<ContractorAddressType, string> = {
  contractor_office: 'Office',
  contractor_warehouse: 'Warehouse',
  contractor_billing: 'Billing',
  contractor_shipping: 'Shipping',
  contractor_other: 'Other',
}

function formatAddress(location: ContractorLocation): string {
  const parts = [
    location.addressLine1,
    location.city,
    location.state,
    location.postalCode,
    location.country,
  ].filter(Boolean)
  return parts.join(', ') || '-'
}

// Store edit handler ref for use in renderer
let editHandlerRef: ((row: ContractorLocation) => void) | null = null

const TypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = TYPE_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = TYPE_LABELS[value as ContractorAddressType] || value
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const AddressRenderer = ({ value, rowData }: { value: string; rowData: ContractorLocation }) => {
  const address = formatAddress(rowData)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        editHandlerRef?.(rowData)
      }}
      className="text-left text-blue-600 hover:text-blue-800 hover:underline cursor-pointer truncate max-w-[400px]"
      title={address}
    >
      {address}
    </button>
  )
}

const PrimaryRenderer = ({ value }: { value: boolean }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  return <Star className="h-4 w-4 text-yellow-500 mx-auto" fill="currentColor" />
}

const ActiveRenderer = ({ value }: { value: boolean }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  return <Check className="h-4 w-4 text-green-500 mx-auto" />
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  TypeRenderer: (value) => <TypeRenderer value={value} />,
  AddressRenderer: (value, rowData) => <AddressRenderer value={value} rowData={rowData} />,
  PrimaryRenderer: (value) => <PrimaryRenderer value={value} />,
  ActiveRenderer: (value) => <ActiveRenderer value={value} />,
}

const COLUMNS: ColumnDef[] = [
  {
    data: 'type',
    title: 'Type',
    width: 100,
    renderer: RENDERERS.TypeRenderer,
  },
  {
    data: 'addressLine1',
    title: 'Address',
    width: 300,
    renderer: RENDERERS.AddressRenderer,
  },
  {
    data: 'city',
    title: 'City',
    width: 120,
  },
  {
    data: 'country',
    title: 'Country',
    width: 100,
  },
  {
    data: 'isPrimary',
    title: 'Primary',
    width: 70,
    renderer: RENDERERS.PrimaryRenderer,
  },
  {
    data: 'isActive',
    title: 'Active',
    width: 70,
    renderer: RENDERERS.ActiveRenderer,
  },
]

export function ContractorLocationsTab({
  contractorId,
  onUpdated,
}: ContractorLocationsTabProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const tableRef = useRef<HTMLDivElement>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [selectedLocationType, setSelectedLocationType] = useState<LocationType | undefined>(undefined)

  // Fetch contractor locations
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contractor-locations', contractorId],
    queryFn: async () => {
      const response = await apiCall<{
        items: ContractorLocation[]
        total: number
      }>(`/api/fms_locations/contractor-addresses?contractorId=${contractorId}&includeInactive=true`)
      if (!response.ok) throw new Error('Failed to load locations')
      return response.result
    },
    enabled: !!contractorId,
  })

  const locations = data?.items ?? []

  // Handle opening the drawer for creating a new location
  const handleAddLocation = useCallback((type?: LocationType) => {
    setDrawerMode('create')
    setSelectedLocationId(null)
    setSelectedLocationType(type || 'contractor_office')
    setIsDrawerOpen(true)
  }, [])

  // Handle opening the drawer for editing a location
  const handleEditLocation = useCallback((location: ContractorLocation) => {
    setDrawerMode('edit')
    setSelectedLocationId(location.id)
    setSelectedLocationType(location.type)
    setIsDrawerOpen(true)
  }, [])

  // Set handler ref for AddressRenderer
  useEffect(() => {
    editHandlerRef = handleEditLocation
    return () => {
      editHandlerRef = null
    }
  }, [handleEditLocation])

  // Handle delete location
  const handleDeleteLocation = useCallback(
    async (locationId: string) => {
      if (!confirm(t('contractors.locations.confirmDelete', 'Are you sure you want to delete this address?'))) {
        return
      }

      try {
        const response = await apiCall(`/api/fms_locations/unified/${locationId}`, {
          method: 'DELETE',
        })

        if (response.ok) {
          flash(t('contractors.locations.deleted', 'Address deleted'), 'success')
          refetch()
          onUpdated?.()
        } else {
          const error = (response.result as { error?: string })?.error ?? 'Delete failed'
          flash(error, 'error')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        flash(errorMessage, 'error')
      }
    },
    [t, refetch, onUpdated]
  )

  // Handle location saved
  const handleLocationSaved = useCallback(() => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['contractor', contractorId] })
    onUpdated?.()
  }, [refetch, queryClient, contractorId, onUpdated])

  // Actions renderer for delete button
  const actionsRenderer = useCallback((rowData: any) => {
    const row = rowData as ContractorLocation
    if (!row.id) return null
    return (
      <div className="flex items-center justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteLocation(row.id)
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [handleDeleteLocation])

  if (isLoading) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('contractors.locations.title', 'Locations')}
          </h3>
        </div>
        <TableSkeleton rows={3} columns={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {t('contractors.locations.title', 'Locations')}
        </h3>
        <div className="text-sm text-red-500 py-4">
          {error instanceof Error ? error.message : 'Failed to load locations'}
        </div>
      </div>
    )
  }

  if (locations.length === 0) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('contractors.locations.title', 'Locations')}
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleAddLocation()}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('contractors.locations.addLocation', 'Add Location')}
          </Button>
        </div>
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('contractors.locations.noLocations', 'No locations added yet')}</p>
          <Button
            type="button"
            size="sm"
            variant="link"
            onClick={() => handleAddLocation()}
            className="mt-2"
          >
            {t('contractors.locations.addFirstLocation', 'Add your first location')}
          </Button>
        </div>
        <LocationDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          mode={drawerMode}
          locationType={selectedLocationType}
          contractorId={contractorId}
          locationId={selectedLocationId ?? undefined}
          onSaved={handleLocationSaved}
        />
      </div>
    )
  }

  const topBarButtons = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => handleAddLocation()}
      className="h-7 text-xs"
    >
      <Plus className="h-3 w-3 mr-1" />
      {t('contractors.locations.addLocation', 'Add Location')}
    </Button>
  )

  return (
    <div className="mb-4">
      <DynamicTable
        tableRef={tableRef}
        data={locations}
        columns={COLUMNS}
        tableName={t('contractors.locations.title', 'Locations')}
        idColumnName="id"
        height="auto"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={false}
        actionsRenderer={actionsRenderer}
        uiConfig={{
          hideToolbar: false,
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideColumnsButton: true,
          hideFilterPopover: true,
          hideSortButton: true,
          topBarEnd: topBarButtons,
        }}
      />
      <LocationDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        mode={drawerMode}
        locationType={selectedLocationType}
        contractorId={contractorId}
        locationId={selectedLocationId ?? undefined}
        onSaved={handleLocationSaved}
      />
    </div>
  )
}
