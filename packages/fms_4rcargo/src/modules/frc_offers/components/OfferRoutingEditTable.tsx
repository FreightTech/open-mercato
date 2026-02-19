'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
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
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { FRC_ROUTING_TYPES } from '../../../lib/types'

export type AirRoutingData = {
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

interface OfferRoutingEditTableProps {
  offerId: string
  routingItems: AirRoutingData[]
  onRoutingSave: (routingId: string, field: string, value: unknown) => Promise<void>
  onRoutingCreate: (data: Record<string, unknown>) => Promise<{ id: string }>
  onRoutingDelete: (routingId: string) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const ROUTING_TYPE_OPTIONS = FRC_ROUTING_TYPES.map((t) => t)

export function OfferRoutingEditTable({
  offerId,
  routingItems,
  onRoutingSave,
  onRoutingCreate,
  onRoutingDelete,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OfferRoutingEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: t('frc_offers.detail.routing.searchAirports', 'Search airports...'),
    minQueryLength: 2,
    additionalFilters: { type: 'airport' },
  }), [t])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'type',
      title: t('frc_offers.detail.routing.type', 'Type'),
      width: 150,
      type: 'dropdown',
      source: ROUTING_TYPE_OPTIONS,
    },
    {
      data: 'flightNumber',
      title: t('frc_offers.detail.routing.flightNumber', 'Flight #'),
      width: 100,
      type: 'text',
    },
    {
      data: 'originAirportDisplay',
      title: t('frc_offers.detail.routing.origin', 'Origin'),
      width: 120,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'destinationAirportDisplay',
      title: t('frc_offers.detail.routing.destination', 'Destination'),
      width: 120,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'departureDate',
      title: t('frc_offers.detail.routing.departureDate', 'Depart Date'),
      width: 120,
      type: 'date',
    },
    {
      data: 'departureTime',
      title: t('frc_offers.detail.routing.departureTime', 'Depart Time'),
      width: 90,
      type: 'text',
    },
    {
      data: 'arrivalDate',
      title: t('frc_offers.detail.routing.arrivalDate', 'Arrive Date'),
      width: 120,
      type: 'date',
    },
    {
      data: 'arrivalTime',
      title: t('frc_offers.detail.routing.arrivalTime', 'Arrive Time'),
      width: 90,
      type: 'text',
    },
  ], [t, airportEditorConfig])

  const tableData = useMemo(() =>
    routingItems.map((item) => ({
      id: item.id,
      type: item.type,
      flightNumber: item.flightNumber ?? '',
      originAirportDisplay: item.originAirport?.code ?? '',
      destinationAirportDisplay: item.destinationAirport?.code ?? '',
      departureDate: item.departureDate ?? '',
      departureTime: item.departureTime ?? '',
      arrivalDate: item.arrivalDate ?? '',
      arrivalTime: item.arrivalTime ?? '',
      // Store full airport objects for reference
      _originAirport: item.originAirport,
      _destinationAirport: item.destinationAirport,
    })),
  [routingItems])

  const handleCellSave = useCallback(async (
    routingId: string,
    field: string,
    value: unknown,
    rowIndex: number,
    colIndex: number
  ) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex,
      colIndex,
    } as CellSaveStartEvent)

    try {
      let apiField = field
      let processedValue: unknown = value

      if (field === 'originAirportDisplay') {
        apiField = 'originAirportId'
        try {
          const parsed = JSON.parse(String(value))
          processedValue = parsed.id
        } catch {
          processedValue = null
        }
      } else if (field === 'destinationAirportDisplay') {
        apiField = 'destinationAirportId'
        try {
          const parsed = JSON.parse(String(value))
          processedValue = parsed.id
        } catch {
          processedValue = null
        }
      } else if (field === 'type') {
        processedValue = String(value)
      } else if (field === 'flightNumber' || field === 'departureTime' || field === 'arrivalTime') {
        processedValue = value ? String(value) : null
      } else if (field === 'departureDate' || field === 'arrivalDate') {
        processedValue = value ? String(value) : null
      }

      await onRoutingSave(routingId, apiField, processedValue)

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex,
        colIndex,
      } as CellSaveSuccessEvent)
    } catch (error) {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex,
        colIndex,
        error: error instanceof Error ? error.message : 'Failed to save',
      } as CellSaveErrorEvent)
    }
  }, [onRoutingSave, tableRef])

  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    try {
      const { _isNew, id, ...rowData } = payload.rowData as Record<string, unknown>

      // Parse airport data
      let originAirportId: string | null = null
      let destinationAirportId: string | null = null

      if (rowData.originAirportDisplay) {
        try {
          const parsed = JSON.parse(String(rowData.originAirportDisplay))
          originAirportId = parsed.id
        } catch {
          // ignore
        }
      }

      if (rowData.destinationAirportDisplay) {
        try {
          const parsed = JSON.parse(String(rowData.destinationAirportDisplay))
          destinationAirportId = parsed.id
        } catch {
          // ignore
        }
      }

      const result = await onRoutingCreate({
        type: rowData.type || 'direct_flight',
        flightNumber: rowData.flightNumber || null,
        originAirportId,
        destinationAirportId,
        departureDate: rowData.departureDate || null,
        departureTime: rowData.departureTime || null,
        arrivalDate: rowData.arrivalDate || null,
        arrivalTime: rowData.arrivalTime || null,
      })

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        savedRowData: { ...rowData, id: result.id },
      } as NewRowSaveSuccessEvent)
    } catch (error) {
      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        error: error instanceof Error ? error.message : 'Failed to create routing',
      } as NewRowSaveErrorEvent)
    }
  }, [onRoutingCreate, tableRef])

  const handleDeleteRouting = useCallback(async (routingId: string) => {
    await onRoutingDelete(routingId)
  }, [onRoutingDelete])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        const routingId = payload.id as string
        handleCellSave(routingId, payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
      },
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (routingItems.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <DynamicTable
          tableRef={tableRef}
          data={[]}
          columns={columns}
          tableName=""
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideColumnsButton: true,
            hideFilterButton: true,
            hideSortButton: true,
          }}
          emptyMessage={t('frc_offers.detail.routing.empty', 'No routing legs. Click + to add.')}
        />
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
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: false,
          hideBottomBar: true,
          hideColumnsButton: true,
          hideFilterButton: true,
          hideSortButton: true,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => {
          if (rowData._isNew) return null
          return (
            <button
              onClick={() => handleDeleteRouting(rowData.id as string)}
              className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
              title={t('frc_offers.detail.routing.delete', 'Delete routing leg')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )
        }}
      />
    </div>
  )
}
