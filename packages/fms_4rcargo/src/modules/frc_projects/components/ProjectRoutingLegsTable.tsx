'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, forwardRef, useImperativeHandle, useState } from 'react'
import { Eye, Trash2, X } from 'lucide-react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'

export interface AirRoutingRow {
  id: string
  name: string
  type: string
  flightNumber: string | null
  originAirport: { id: string; code: string } | null
  destinationAirport: { id: string; code: string } | null
  departureDate: string | null
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
}

interface ProjectRoutingLegsTableProps {
  projectId: string
  offerId: string | null
  routingLegs: AirRoutingRow[]
  onRoutingUpdate: (legId: string, field: string, value: unknown) => Promise<void>
  onRoutingCreate: (data: Record<string, unknown>) => Promise<{ id: string }>
  onRoutingDelete?: (legId: string) => Promise<void>
  onViewOffer?: () => void
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export interface ProjectRoutingLegsTableHandle {
  addRow: () => void
}

const ROUTING_TYPE_OPTIONS = [
  { value: 'direct_flight', label: 'Direct Flight' },
  { value: 'direct_pickup_truck_management', label: 'Truck Pickup' },
  { value: 'connecting_flight', label: 'Connecting Flight' },
]

const ROUTING_TYPE_LABELS: Record<string, string> = {
  direct_flight: 'Direct',
  direct_pickup_truck_management: 'Truck Pickup',
  connecting_flight: 'Connecting',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toISOString().split('T')[0]
  } catch {
    return dateStr
  }
}

export const ProjectRoutingLegsTable = forwardRef<
  ProjectRoutingLegsTableHandle,
  ProjectRoutingLegsTableProps
>(function ProjectRoutingLegsTable(
  {
    projectId,
    offerId,
    routingLegs,
    onRoutingUpdate,
    onRoutingCreate,
    onRoutingDelete,
    onViewOffer,
    siblingTableRefs,
  },
  ref
) {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)

  // Track new rows being added (pending save)
  const [newRows, setNewRows] = useState<Array<{
    id: string
    type: string
    flightNumber: string
    originAirportCode: string
    destinationAirportCode: string
    departureDate: string
    departureTime: string
    _isNew: true
  }>>([])

  // Add row handler - adds a new pending row to state or focuses existing pending row
  const handleAddRow = useCallback(() => {
    // If there's already a pending row, focus it instead of adding a new one
    if (newRows.length > 0) {
      // Focus the table and the pending row will be at the end
      tableRef.current?.focus()
      return
    }

    const newRow = {
      id: `new-${Date.now()}`,
      type: 'direct_flight',
      flightNumber: '',
      originAirportCode: '',
      destinationAirportCode: '',
      departureDate: '',
      departureTime: '',
      _isNew: true as const,
    }
    setNewRows((prev) => [...prev, newRow])
  }, [newRows.length])

  // Remove a new row (cancel adding)
  const handleRemoveNewRow = useCallback((rowId: string) => {
    setNewRows((prev) => prev.filter((r) => r.id !== rowId))
  }, [])

  // Expose addRow method via ref
  useImperativeHandle(ref, () => ({
    addRow: handleAddRow,
  }), [handleAddRow])

  // Airport editor config
  const airportEditorConfig = useMemo(
    () => ({
      entityType: 'fms_locations:fms_location',
      extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
        JSON.stringify({
          id: r.recordId,
          code: r.presenter?.title || '',
        }),
      formatOption: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) => ({
        primary: r.presenter?.title || `${r.recordId.slice(0, 8)}...`,
        secondary: r.presenter?.subtitle,
      }),
      placeholder: t('frc_projects.detail.routing.searchAirport', 'Search airports...'),
      minQueryLength: 2,
    }),
    [t]
  )

  // Actions renderer for the built-in actions column
  const actionsRenderer = useCallback(
    (row: Record<string, unknown>) => (
      <div className="flex items-center justify-center gap-1">
        {onViewOffer && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onViewOffer()
            }}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title={t('frc_projects.detail.routing.viewOffer', 'View Offer')}
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
        {onRoutingDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRoutingDelete(row.id as string)
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title={t('frc_projects.detail.routing.delete', 'Delete routing leg')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    ),
    [onViewOffer, onRoutingDelete, t]
  )

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'type',
        title: t('frc_projects.detail.routing.type', 'Type'),
        width: 100,
        type: 'dropdown',
        source: ROUTING_TYPE_OPTIONS,
        renderer: (value: unknown) => {
          const type = value as string
          return (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                type === 'direct_flight' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
                type === 'direct_pickup_truck_management' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
                type === 'connecting_flight' && 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200'
              )}
            >
              {ROUTING_TYPE_LABELS[type] || type}
            </span>
          )
        },
      },
      {
        data: 'flightNumber',
        title: t('frc_projects.detail.routing.flight', 'Flight #'),
        width: 90,
        type: 'text',
        renderer: (value: unknown) => {
          const flight = value as string | null
          return flight ? (
            <span className="font-mono text-sm">{flight}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
      },
      {
        data: 'originAirportCode',
        title: t('frc_projects.detail.routing.from', 'From'),
        width: 80,
        type: 'text',
        editor: createEntitySearchEditor(airportEditorConfig),
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const airport = row.originAirport as { code: string } | null
          return airport ? (
            <span className="font-mono">{airport.code}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
      },
      {
        data: 'destinationAirportCode',
        title: t('frc_projects.detail.routing.to', 'To'),
        width: 80,
        type: 'text',
        editor: createEntitySearchEditor(airportEditorConfig),
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const airport = row.destinationAirport as { code: string } | null
          return airport ? (
            <span className="font-mono">{airport.code}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
      },
      {
        data: 'departureDate',
        title: t('frc_projects.detail.routing.departure', 'Departure'),
        width: 110,
        type: 'date',
        renderer: (value: unknown) => {
          const date = value as string | null
          return date ? formatDate(date) : <span className="text-muted-foreground">-</span>
        },
      },
      {
        data: 'departureTime',
        title: t('frc_projects.detail.routing.time', 'Time'),
        width: 70,
        type: 'text',
        renderer: (value: unknown) => {
          const time = value as string | null
          return time ? (
            <span className="font-mono text-sm">{time}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
      },
    ],
    [t, airportEditorConfig]
  )

  const tableData = useMemo(
    () => [
      // Existing routing legs
      ...routingLegs.map((leg) => ({
        id: leg.id,
        name: leg.name,
        type: leg.type,
        flightNumber: leg.flightNumber,
        originAirport: leg.originAirport,
        originAirportCode: leg.originAirport?.code || '',
        destinationAirport: leg.destinationAirport,
        destinationAirportCode: leg.destinationAirport?.code || '',
        departureDate: leg.departureDate,
        departureTime: leg.departureTime,
        arrivalDate: leg.arrivalDate,
        arrivalTime: leg.arrivalTime,
      })),
      // New unsaved rows
      ...newRows.map((row) => ({
        id: row.id,
        name: '',
        type: row.type,
        flightNumber: row.flightNumber,
        originAirport: null,
        originAirportCode: row.originAirportCode,
        destinationAirport: null,
        destinationAirportCode: row.destinationAirportCode,
        departureDate: row.departureDate,
        departureTime: row.departureTime,
        arrivalDate: null,
        arrivalTime: null,
        _isNew: true,
      })),
    ],
    [routingLegs, newRows]
  )

  const handleCellSave = useCallback(
    async (legId: string, field: string, value: unknown, rowIndex: number, colIndex: number) => {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
        rowIndex,
        colIndex,
      } as CellSaveStartEvent)

      try {
        let updateField = field
        let updateValue = value

        // Handle airport fields - parse JSON from entity search
        if (field === 'originAirportCode' || field === 'destinationAirportCode') {
          const apiField = field === 'originAirportCode' ? 'originAirportId' : 'destinationAirportId'

          if (typeof value === 'string' && value.startsWith('{')) {
            try {
              const parsed = JSON.parse(value)
              updateField = apiField
              updateValue = parsed.id || null
            } catch {
              // Not valid JSON, ignore
              dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
                rowIndex,
                colIndex,
              } as CellSaveSuccessEvent)
              return
            }
          } else {
            // Empty value means clear the airport
            updateField = apiField
            updateValue = null
          }
        }

        await onRoutingUpdate(legId, updateField, updateValue)

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex,
          colIndex,
        } as CellSaveSuccessEvent)

        flash(t('frc_projects.detail.routing.updated', 'Routing updated'), 'success')
      } catch (error) {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
          rowIndex,
          colIndex,
          error: error instanceof Error ? error.message : 'Failed to save',
        } as CellSaveErrorEvent)
        flash(error instanceof Error ? error.message : 'Failed to save', 'error')
      }
    },
    [tableRef, onRoutingUpdate, t]
  )

  // Handle saving a new row (creates it on the server)
  const handleNewRowSave = useCallback(
    async (rowId: string, rowData: Record<string, unknown>) => {
      try {
        // Parse airport data from entity search JSON
        let originAirportId: string | null = null
        let destinationAirportId: string | null = null

        if (rowData.originAirportCode) {
          try {
            const parsed = JSON.parse(String(rowData.originAirportCode))
            originAirportId = parsed.id
          } catch {
            // ignore - not valid JSON
          }
        }

        if (rowData.destinationAirportCode) {
          try {
            const parsed = JSON.parse(String(rowData.destinationAirportCode))
            destinationAirportId = parsed.id
          } catch {
            // ignore - not valid JSON
          }
        }

        await onRoutingCreate({
          type: rowData.type || 'direct_flight',
          flightNumber: rowData.flightNumber || null,
          originAirportId,
          destinationAirportId,
          departureDate: rowData.departureDate || null,
          departureTime: rowData.departureTime || null,
        })

        // Remove from new rows state (parent will refetch and show the real row)
        setNewRows((prev) => prev.filter((r) => r.id !== rowId))
        flash(t('frc_projects.detail.routing.created', 'Routing leg created'), 'success')
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Failed to create routing leg', 'error')
      }
    },
    [onRoutingCreate, t]
  )

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        const rowId = payload.id as string
        const isNewRow = rowId.startsWith('new-')

        if (isNewRow) {
          // For new rows, update the local state and check if ready to save
          setNewRows((prev) => {
            const updated = prev.map((r) => {
              if (r.id !== rowId) return r
              
              // Handle airport fields - parse JSON
              let newValue = payload.newValue
              if (payload.prop === 'originAirportCode' || payload.prop === 'destinationAirportCode') {
                if (typeof payload.newValue === 'string' && payload.newValue.startsWith('{')) {
                  try {
                    const parsed = JSON.parse(payload.newValue)
                    newValue = parsed.code || payload.newValue
                  } catch {
                    // keep original
                  }
                }
              }
              
              return { ...r, [payload.prop]: newValue }
            })
            return updated
          })

          // Find the row and check if it has enough data to save
          const currentRow = newRows.find((r) => r.id === rowId)
          if (currentRow) {
            const updatedRow = { ...currentRow, [payload.prop]: payload.newValue }
            // Auto-save when at least origin or destination is set
            const hasOrigin = updatedRow.originAirportCode && updatedRow.originAirportCode.startsWith('{')
            const hasDest = updatedRow.destinationAirportCode && updatedRow.destinationAirportCode.startsWith('{')
            if (hasOrigin || hasDest) {
              handleNewRowSave(rowId, updatedRow)
            }
          }
        } else {
          // For existing rows, use the regular update handler
          handleCellSave(rowId, payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Show table even when empty (for adding new rows)
  return (
    <div className="border rounded-lg overflow-hidden">
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        siblingTableRefs={siblingTableRefs}
        actionsRenderer={(rowData: Record<string, unknown>) => {
          // For new unsaved rows, show cancel button
          if (rowData._isNew) {
            return (
              <div className="flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveNewRow(rowData.id as string)
                  }}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title={t('common.cancel', 'Cancel')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          }
          return actionsRenderer(rowData)
        }}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true, // Add button is in section header
          hideBottomBar: true,
          hideColumnsButton: true,
          hideFilterButton: true,
          hideSortButton: true,
        }}
        emptyMessage={
          offerId
            ? t('frc_projects.detail.routing.emptyWithOffer', 'No routing legs. Click "Sync from Offer" or "Add Routing" to add.')
            : t('frc_projects.detail.routing.empty', 'No routing legs. Click "Add Routing" to add.')
        }
      />
    </div>
  )
})
