'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { Eye, Plus, X, Truck } from 'lucide-react'
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
import { Button } from '@open-mercato/ui/primitives/button'
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

export interface ConsoleData {
  id: string
  name: string
  customName: string | null
  status: string
  airRoutingId: string | null
}

interface ProjectRoutingLegsTableProps {
  projectId: string
  offerId: string
  routingLegs: AirRoutingRow[]
  consoles: ConsoleData[]
  onRoutingUpdate: (legId: string, field: string, value: unknown) => Promise<void>
  onConsoleAssign: (consoleId: string, routingLegId: string | null) => Promise<void>
  onCreateConsole: (routingLegId: string) => void
  onViewOffer: () => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const ROUTING_TYPE_OPTIONS = [
  { value: 'direct_flight', label: 'Direct Flight' },
  { value: 'connection', label: 'Connection' },
  { value: 'truck_connection', label: 'Truck' },
]

const ROUTING_TYPE_LABELS: Record<string, string> = {
  direct_flight: 'Direct',
  connection: 'Connection',
  truck_connection: 'Truck',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toISOString().split('T')[0]
  } catch {
    return dateStr
  }
}

export function ProjectRoutingLegsTable({
  projectId,
  offerId,
  routingLegs,
  consoles,
  onRoutingUpdate,
  onConsoleAssign,
  onCreateConsole,
  onViewOffer,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectRoutingLegsTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

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

  // Get consoles assigned to a specific routing leg
  const getConsolesForLeg = useCallback(
    (legId: string) => {
      return consoles.filter((c) => c.airRoutingId === legId)
    },
    [consoles]
  )

  // Get unassigned consoles (can be assigned to any leg)
  const unassignedConsoles = useMemo(() => {
    return consoles.filter((c) => !c.airRoutingId)
  }, [consoles])

  // Custom renderer for consoles column
  const consolesRenderer = useCallback(
    (value: unknown, row: Record<string, unknown>) => {
      const legId = row.id as string
      const assignedConsoles = getConsolesForLeg(legId)

      return (
        <div className="flex items-center gap-1 flex-wrap py-1">
          {/* Assigned console chips */}
          {assignedConsoles.map((console_) => (
            <span
              key={console_.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
            >
              <Truck className="h-3 w-3 mr-1" />
              {console_.customName || console_.name}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onConsoleAssign(console_.id, null)
                }}
                className="ml-1 hover:text-red-600"
                title={t('frc_projects.detail.routing.unassignConsole', 'Unassign')}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Dropdown to assign unassigned console */}
          {unassignedConsoles.length > 0 && (
            <select
              className="text-xs border rounded px-1.5 py-0.5 bg-transparent cursor-pointer hover:border-primary"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onConsoleAssign(e.target.value, legId)
                }
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">+ {t('frc_projects.detail.routing.assign', 'Assign')}</option>
              {unassignedConsoles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customName || c.name}
                </option>
              ))}
            </select>
          )}

          {/* Create new console button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCreateConsole(legId)
            }}
            className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
            title={t('frc_projects.detail.routing.createConsole', 'Create new console for this leg')}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )
    },
    [getConsolesForLeg, unassignedConsoles, onConsoleAssign, onCreateConsole, t]
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
                type === 'connection' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
                type === 'truck_connection' && 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200'
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
      {
        data: '_consoles',
        title: t('frc_projects.detail.routing.consoles', 'Consoles'),
        width: 220,
        type: 'text',
        readOnly: true,
        renderer: consolesRenderer,
      },
      {
        data: '_actions',
        title: '',
        width: 50,
        type: 'text',
        readOnly: true,
        renderer: () => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onViewOffer()
            }}
            className="h-7 w-7 p-0"
            title={t('frc_projects.detail.routing.viewOffer', 'View Offer')}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [t, airportEditorConfig, consolesRenderer, onViewOffer]
  )

  const tableData = useMemo(
    () =>
      routingLegs.map((leg) => ({
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
        _consoles: '',
        _actions: '',
      })),
    [routingLegs]
  )

  const handleCellSave = useCallback(
    async (legId: string, field: string, value: unknown, rowIndex: number, colIndex: number) => {
      // Skip non-editable fields
      if (field === '_consoles' || field === '_actions') return

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

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        handleCellSave(payload.id as string, payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (routingLegs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_projects.detail.routing.empty', 'No routing legs defined in the offer')}
      </div>
    )
  }

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
        onRowClick={() => onViewOffer()}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
