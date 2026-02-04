'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Star, Check, MapPin } from 'lucide-react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  type ColumnDef,
  type CellEditSaveEvent,
  type NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { createGooglePlacesEditor } from '../../fms_locations/components/GooglePlacesEditor'
import type { ContractorAddressType } from '../../fms_locations/data/types'

interface ContractorLocation {
  id: string
  code: string
  name: string
  type: ContractorAddressType
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
  googlePlaceId?: string | null
}

interface ContractorLocationsTabProps {
  contractorId: string
  onUpdated?: () => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
  autoSelectOnFocus?: boolean
}

const TYPE_VALUES = ['contractor_office', 'contractor_warehouse', 'contractor_billing', 'contractor_shipping', 'contractor_other'] as const

const TYPE_LABELS: Record<ContractorAddressType, string> = {
  contractor_office: 'Office',
  contractor_warehouse: 'Warehouse',
  contractor_billing: 'Billing',
  contractor_shipping: 'Shipping',
  contractor_other: 'Other',
}

// Reverse mapping for dropdown selection
const LABEL_TO_TYPE: Record<string, ContractorAddressType> = {
  'Office': 'contractor_office',
  'Warehouse': 'contractor_warehouse',
  'Billing': 'contractor_billing',
  'Shipping': 'contractor_shipping',
  'Other': 'contractor_other',
}

// Labels for dropdown display
const TYPE_OPTIONS = Object.values(TYPE_LABELS)

const DeleteButton = ({ id, onDelete }: { id: string; onDelete: (id: string) => void }) => {
  if (!id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onDelete(id)
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

function formatAddress(location: ContractorLocation): string {
  const parts = [
    location.addressLine1,
    location.city,
    location.postalCode,
    location.country,
  ].filter(Boolean)
  return parts.join(', ') || '-'
}

export function ContractorLocationsTab({
  contractorId,
  onUpdated,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
}: ContractorLocationsTabProps) {
  const internalTableRef = React.useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const t = useT()
  const queryClient = useQueryClient()

  // Track selected address data for new rows (not yet saved)
  const [pendingAddressData, setPendingAddressData] = React.useState<{
    city?: string
    country?: string
    addressLine1?: string
    state?: string
    postalCode?: string
  } | null>(null)

  // Counter to force table re-render when address is selected
  const [addressUpdateCounter, setAddressUpdateCounter] = React.useState(0)

  // Callback when address is selected from Google Places
  const handleAddressSelected = React.useCallback(
    (addressData: {
      addressLine1?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
    }, rowData: Record<string, unknown>) => {
      // For new rows (no id), store the address data in state
      if (!rowData.id) {
        setPendingAddressData({
          addressLine1: addressData.addressLine1,
          city: addressData.city,
          state: addressData.state,
          postalCode: addressData.postalCode,
          country: addressData.country,
        })
        // Increment counter to trigger re-render
        setAddressUpdateCounter((c) => c + 1)
      }
    },
    []
  )

  // Fetch locations
  const { data, isLoading, refetch } = useQuery({
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

  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!confirm(t('contractors.locations.confirmDelete', 'Are you sure you want to delete this address?'))) {
        return
      }
      try {
        const response = await apiCall(`/api/fms_locations/unified/${id}`, {
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

  // Helper to parse addressSearch JSON
  const parseAddressSearch = React.useCallback((rowData: Record<string, unknown>) => {
    const addressSearch = rowData?.addressSearch as string
    if (addressSearch) {
      try {
        return JSON.parse(addressSearch)
      } catch {
        // Not JSON
      }
    }
    return null
  }, [])

  // Address renderer - shows formatted address
  const addressRenderer = React.useCallback(
    (_value: unknown, rowData: Record<string, unknown>) => {
      if (!rowData) return '-'

      // Try to parse from addressSearch JSON (for new/edited rows)
      const parsed = parseAddressSearch(rowData)
      if (parsed?.addressLine1) {
        const parts = [
          parsed.addressLine1,
          parsed.city,
          parsed.postalCode,
          parsed.country,
        ].filter(Boolean)
        return parts.join(', ') || '-'
      }

      // Fall back to direct field values
      return formatAddress(rowData as unknown as ContractorLocation)
    },
    [parseAddressSearch]
  )

  // City renderer - extracts from addressSearch JSON or pending data
  const cityRenderer = React.useCallback(
    (_value: unknown, rowData: Record<string, unknown>) => {
      if (!rowData) return ''
      // For new rows, use pending address data
      if (!rowData.id && pendingAddressData?.city) {
        return pendingAddressData.city
      }
      const parsed = parseAddressSearch(rowData)
      return parsed?.city || (rowData.city as string) || ''
    },
    [parseAddressSearch, pendingAddressData]
  )

  // Country renderer - extracts from addressSearch JSON or pending data
  const countryRenderer = React.useCallback(
    (_value: unknown, rowData: Record<string, unknown>) => {
      if (!rowData) return ''
      // For new rows, use pending address data
      if (!rowData.id && pendingAddressData?.country) {
        return pendingAddressData.country
      }
      const parsed = parseAddressSearch(rowData)
      return parsed?.country || (rowData.country as string) || ''
    },
    [parseAddressSearch, pendingAddressData]
  )


  // Boolean renderer for primary
  const primaryRenderer = React.useCallback((value: unknown) => {
    if (!value) return <span className="text-muted-foreground">-</span>
    return <Star className="h-4 w-4 text-yellow-500 mx-auto" fill="currentColor" />
  }, [])

  // Boolean renderer for active
  const activeRenderer = React.useCallback((value: unknown) => {
    if (!value) return <span className="text-muted-foreground">-</span>
    return <Check className="h-4 w-4 text-green-500 mx-auto" />
  }, [])

  const columns: ColumnDef[] = React.useMemo(
    () => [
      {
        data: 'type',
        title: t('contractors.locations.columns.type', 'Type'),
        type: 'dropdown',
        width: 100,
        source: TYPE_OPTIONS,
      },
      {
        data: 'name',
        title: t('contractors.locations.columns.name', 'Name'),
        type: 'text',
        width: 120,
      },
      {
        data: 'addressSearch',
        title: t('contractors.locations.columns.address', 'Address'),
        width: 280,
        editor: createGooglePlacesEditor({
          placeholder: t('contractors.locations.addressPlaceholder', 'Type address or postal code...'),
          onAddressSelected: handleAddressSelected,
        }),
        renderer: addressRenderer,
      },
      {
        data: 'city',
        title: t('contractors.locations.columns.city', 'City'),
        width: 100,
        readOnly: true,
        renderer: cityRenderer,
      },
      {
        data: 'country',
        title: t('contractors.locations.columns.country', 'Country'),
        width: 80,
        readOnly: true,
        renderer: countryRenderer,
      },
      {
        data: 'isPrimary',
        title: t('contractors.locations.columns.primary', 'Primary'),
        type: 'boolean',
        width: 70,
        renderer: primaryRenderer,
      },
      {
        data: 'isActive',
        title: t('contractors.locations.columns.active', 'Active'),
        type: 'boolean',
        width: 70,
        renderer: activeRenderer,
      },
    ],
    [t, addressRenderer, cityRenderer, countryRenderer, primaryRenderer, activeRenderer, handleAddressSelected]
  )

  const actionsRenderer = React.useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      return <DeleteButton id={rowData.id} onDelete={handleDelete} />
    },
    [handleDelete]
  )

  const tableData = React.useMemo(() => {
    const items = data?.items ?? []
    return items.map((loc) => ({
      id: loc.id,
      type: TYPE_LABELS[loc.type] || loc.type, // Display label in table
      typeValue: loc.type, // Keep original value for saving
      name: loc.name ?? '',
      addressSearch: '', // Virtual column for editing
      addressLine1: loc.addressLine1 ?? '',
      city: loc.city ?? '',
      state: loc.state ?? '',
      postalCode: loc.postalCode ?? '',
      country: loc.country ?? '',
      lat: loc.lat,
      lng: loc.lng,
      isPrimary: loc.isPrimary,
      isActive: loc.isActive,
      googlePlaceId: loc.googlePlaceId ?? '',
    }))
  }, [data?.items])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        const { prop, newValue, oldValue, rowIndex, colIndex, id } = payload

        if (newValue === oldValue) return

        if (tableRef.current) {
          dispatch(tableRef.current, TableEvents.CELL_SAVE_START, { rowIndex, colIndex })
        }

        try {
          let updateData: Record<string, unknown> = {}

          if (prop === 'addressSearch') {
            // Parse JSON from GooglePlacesEditor
            try {
              const addressData = JSON.parse(newValue as string)
              updateData = {
                addressLine1: addressData.addressLine1,
                city: addressData.city,
                state: addressData.state,
                postalCode: addressData.postalCode,
                country: addressData.country,
                lat: addressData.lat,
                lng: addressData.lng,
                googlePlaceId: addressData.googlePlaceId,
              }
            } catch {
              // Not valid JSON - user might have typed manually
              updateData = { addressLine1: newValue }
            }
          } else if (prop === 'type') {
            // Map label back to value for type field
            const typeValue = LABEL_TO_TYPE[newValue as string] || newValue
            updateData = { type: typeValue }
          } else {
            // Regular field update
            const finalValue = newValue === '' ? null : newValue
            updateData = { [prop]: finalValue }
          }

          const response = await apiCall(`/api/fms_locations/unified/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (response.ok) {
            flash(t('contractors.locations.updated', 'Location updated'), 'success')
            if (tableRef.current) {
              dispatch(tableRef.current, TableEvents.CELL_SAVE_SUCCESS, { rowIndex, colIndex })
            }
            refetch()
            onUpdated?.()
          } else {
            const error = (response.result as { error?: string })?.error ?? 'Update failed'
            flash(error, 'error')
            if (tableRef.current) {
              dispatch(tableRef.current, TableEvents.CELL_SAVE_ERROR, { rowIndex, colIndex, error })
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          if (tableRef.current) {
            dispatch(tableRef.current, TableEvents.CELL_SAVE_ERROR, { rowIndex, colIndex, error: errorMessage })
          }
        }
      },

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        const { rowData, rowIndex } = payload

        try {
          // Parse address data if present
          let addressFields: Record<string, unknown> = {}
          if (rowData.addressSearch) {
            try {
              const addressData = JSON.parse(rowData.addressSearch)
              addressFields = {
                addressLine1: addressData.addressLine1,
                city: addressData.city,
                state: addressData.state,
                postalCode: addressData.postalCode,
                country: addressData.country,
                lat: addressData.lat,
                lng: addressData.lng,
                googlePlaceId: addressData.googlePlaceId,
              }
            } catch {
              // Not valid JSON
              addressFields = { addressLine1: rowData.addressSearch }
            }
          }

          // Map type label to value
          const typeValue = LABEL_TO_TYPE[rowData.type] || rowData.type || 'contractor_office'

          const createPayload = {
            contractorId,
            type: typeValue,
            name: rowData.name || 'New Location',
            isPrimary: rowData.isPrimary ?? false,
            isActive: rowData.isActive ?? true,
            ...addressFields,
          }

          const response = await apiCall<{ id: string; error?: string }>(
            '/api/fms_locations/contractor-addresses',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createPayload),
            }
          )

          if (response.ok && response.result) {
            flash(t('contractors.locations.created', 'Location created'), 'success')
            if (tableRef.current) {
              dispatch(tableRef.current, TableEvents.NEW_ROW_SAVE_SUCCESS, {
                rowIndex,
                savedRowData: { ...rowData, id: response.result.id },
              })
            }
            // Clear pending address data after successful save
            setPendingAddressData(null)
            refetch()
            onUpdated?.()
          } else {
            const error = response.result?.error ?? 'Creation failed'
            flash(error, 'error')
            if (tableRef.current) {
              dispatch(tableRef.current, TableEvents.NEW_ROW_SAVE_ERROR, { rowIndex, error })
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          if (tableRef.current) {
            dispatch(tableRef.current, TableEvents.NEW_ROW_SAVE_ERROR, { rowIndex, error: errorMessage })
          }
        }
      },
    },
    tableRef
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        Loading locations...
      </div>
    )
  }

  return (
    <DynamicTable
      tableRef={tableRef}
      data={tableData}
      columns={columns}
      idColumnName="id"
      tableName={t('contractors.locations.title', 'Locations')}
      emptyMessage={t('contractors.locations.noLocations', 'No locations added yet')}
      height={Math.max(150, Math.min(300, 80 + (tableData.length + 1) * 35))}
      colHeaders={true}
      rowHeaders={false}
      stretchColumns={true}
      actionsRenderer={actionsRenderer}
      autoSelectOnFocus={autoSelectOnFocus}
      siblingTableRefs={siblingTableRefs}
      uiConfig={{
        hideToolbar: false,
        hideSearch: true,
        hideFilterButton: true,
        hideAddRowButton: false,
        hideBottomBar: true,
        topBarStart: <span className="flex items-center"><MapPin className="h-4 w-4 text-muted-foreground" /></span>,
      }}
    />
  )
}
