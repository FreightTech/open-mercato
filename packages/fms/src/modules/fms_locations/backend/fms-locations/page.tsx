'use client'

import * as React from 'react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Plus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  DynamicTableCreateHandlerContext,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useTableConfig } from '../../components/useTableConfig'
import { ImportDialog } from '../../components/ImportDialog'
import { LocationDrawer } from '../../components/LocationDrawer'
import type { LocationType } from '../../data/types'

interface FmsLocationRow {
  id: string
  code: string
  name: string
  type: LocationType
  portId?: string | null
  locode?: string | null
  lat?: number | null
  lng?: number | null
  city?: string | null
  country?: string | null
  createdAt: string
  updatedAt: string
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  port: { bg: '#dbeafe', text: '#1e40af' },           // blue
  terminal: { bg: '#ffedd5', text: '#c2410c' },       // orange
  contractor_office: { bg: '#e0e7ff', text: '#3730a3' },   // indigo
  contractor_warehouse: { bg: '#dcfce7', text: '#166534' }, // green
  contractor_billing: { bg: '#f3e8ff', text: '#7c3aed' },   // purple
  contractor_shipping: { bg: '#cffafe', text: '#0e7490' },  // cyan
  contractor_other: { bg: '#f3f4f6', text: '#374151' },     // gray
}

const getTypeColor = (type: string) => {
  return TYPE_COLORS[type] || { bg: '#f3f4f6', text: '#374151' }
}

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    port: 'Port',
    terminal: 'Terminal',
    contractor_office: 'Office',
    contractor_warehouse: 'Warehouse',
    contractor_billing: 'Billing',
    contractor_shipping: 'Shipping',
    contractor_other: 'Other',
  }
  return labels[type] || type
}

const CodeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span className="font-mono text-sm font-medium">
      {value}
    </span>
  )
}

const TypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = getTypeColor(value)
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {getTypeLabel(value)}
    </span>
  )
}

// Store edit handler ref for use in renderer
let editHandlerRef: ((row: FmsLocationRow) => void) | null = null

const NameRenderer = ({ value, rowData }: { value: string; rowData: FmsLocationRow }) => {
  if (!value) return <span>-</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        editHandlerRef?.(rowData)
      }}
      className="text-left text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
    >
      {value}
    </button>
  )
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CodeRenderer: (value) => <CodeRenderer value={value} />,
  TypeRenderer: (value) => <TypeRenderer value={value} />,
  NameRenderer: (value, rowData) => <NameRenderer value={value} rowData={rowData} />,
}

export default function FmsLocationsPage() {
  const queryClient = useQueryClient()
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)

  // Location drawer state
  const [isLocationDrawerOpen, setIsLocationDrawerOpen] = useState(false)
  const [locationDrawerMode, setLocationDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [selectedLocationType, setSelectedLocationType] = useState<LocationType | undefined>(undefined)

  const { data: tableConfig, isLoading: configLoading } = useTableConfig('fms_locations')

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col) => ({
      ...col,
      type: col.type === 'checkbox' ? 'boolean' : col.type,
      renderer: col.renderer ? RENDERERS[col.renderer] : undefined,
    })) as ColumnDef[]
  }, [tableConfig])

  const handleAddLocation = useCallback((type?: LocationType) => {
    setLocationDrawerMode('create')
    setSelectedLocationId(null)
    setSelectedLocationType(type || 'port')
    setIsLocationDrawerOpen(true)
  }, [])

  const handleEditLocation = useCallback((location: FmsLocationRow) => {
    setLocationDrawerMode('edit')
    setSelectedLocationId(location.id)
    setSelectedLocationType(location.type)
    setIsLocationDrawerOpen(true)
  }, [])

  // Set handler ref for NameRenderer
  useEffect(() => {
    editHandlerRef = handleEditLocation
    return () => {
      editHandlerRef = null
    }
  }, [handleEditLocation])

  const invalidateLocations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fms_locations'] })
  }, [queryClient])

  const topBarButtons = useMemo(() => (
    <div className="flex items-center gap-2">
      <Button onClick={() => handleAddLocation()} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        Add Location
      </Button>
      <Button onClick={() => setIsImportDialogOpen(true)} size="sm" variant="outline">
        <Upload className="h-4 w-4 mr-1" />
        Import
      </Button>
    </div>
  ), [handleAddLocation])

  const table = useDynamicTablePage<FmsLocationRow>({
    source: '/api/fms_locations/locations',
    columns,
    tableName: 'Locations',
    perspectives: 'fms_locations',
    defaultSort: { field: 'name', direction: 'asc' },
    delete: {
      title: 'Delete Location',
      nameColumn: 'name',
      url: (row) => `/api/fms_locations/unified/${row.id}`,
    },
    create: {
      handler: async (payload: NewRowSaveEvent, ctx: DynamicTableCreateHandlerContext) => {
        const { rowIndex, rowData } = payload

        if (!rowData.type || !rowData.code || !rowData.name) {
          flash('Type, Code and Name are required', 'error')
          dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: 'Type, Code and Name are required',
          } as NewRowSaveErrorEvent)
          return
        }

        const endpoint = rowData.type === 'port'
          ? '/api/fms_locations/ports'
          : '/api/fms_locations/terminals'

        try {
          const response = await apiCall<{ id: string; error?: string }>(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: rowData.code,
              name: rowData.name,
              locode: rowData.locode || null,
              lat: rowData.lat ? parseFloat(rowData.lat) : null,
              lng: rowData.lng ? parseFloat(rowData.lng) : null,
              city: rowData.city || null,
              country: rowData.country || null,
            }),
          })

          if (response.ok && response.result?.id) {
            flash('Location created', 'success')
            dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex,
              savedRowData: { ...rowData, id: response.result.id },
            } as NewRowSaveSuccessEvent)
            ctx.invalidate()
          } else {
            const error = response.result?.error || 'Failed to create location'
            flash(error, 'error')
            dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex,
              error,
            } as NewRowSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(ctx.tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
        }
      },
    },
    hooks: {
      beforeCellEdit: (payload, rowData) => {
        const type = (rowData as FmsLocationRow).type
        const endpoint = type === 'port'
          ? `/api/fms_locations/ports/${payload.id}`
          : `/api/fms_locations/terminals/${payload.id}`
        return { url: endpoint }
      },
    },
    queryKey: 'fms_locations',
    tableProps: {
      height: 'fill',
      stretchColumns: true,
      uiConfig: {
        hideAddRowButton: true,
        topBarEnd: topBarButtons,
        borderless: true,
      },
      keyboardShortcuts: {
        rowActions: [
          { id: 'view', label: 'Edit location', key: 'Enter', shift: true },
          { id: 'delete', label: 'Delete location', key: 'd', ctrlOrCmd: true },
        ],
      },
    },
  })

  const actionsRenderer = useCallback((rowData: any) => {
    const row = rowData as FmsLocationRow
    if (!row.id) return null
    return (
      <div className="flex items-center justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation()
            table.setRowToDelete(row)
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [table.setRowToDelete])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FmsLocationRow
    if (actionId === 'view' && row.id) {
      handleEditLocation(row)
    } else if (actionId === 'delete' && row.id) {
      table.setRowToDelete(row)
    }
  }, [handleEditLocation, table.setRowToDelete])

  if (configLoading || table.isLoading) {
    return (
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TableSkeleton rows={10} columns={5} />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        actionsRenderer={actionsRenderer}
        onRowAction={handleRowAction}
      />
      {table.deleteDialog}
      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImported={invalidateLocations}
      />
      <LocationDrawer
        open={isLocationDrawerOpen}
        onOpenChange={setIsLocationDrawerOpen}
        mode={locationDrawerMode}
        locationType={selectedLocationType}
        locationId={selectedLocationId ?? undefined}
        onSaved={invalidateLocations}
      />
    </div>
  )
}
