'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { LOOSE_OR_UNITISED_OPTIONS } from './OpportunityWizard/types'
import { formatDateForApi } from '../../../lib/dateUtils'

export type AirRoutingData = {
  id: string
  originAirport: { id: string; code: string; longCode?: string } | null
  destinationAirport: { id: string; code: string; longCode?: string } | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  looseOrUnitised: string | null
  targetRate: string | null
}

interface AirRoutingEditTableProps {
  rfqId: string
  data: AirRoutingData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export function AirRoutingEditTable({
  rfqId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: AirRoutingEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: t('frc_rfqs.detail.searchAirports', 'Search airports...'),
    minQueryLength: 2,
    additionalFilters: { type: 'airport' },
  }), [t])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'originAirportDisplay',
      title: t('frc_rfqs.detail.columns.originAirport', 'Origin Airport'),
      width: 180,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'destinationAirportDisplay',
      title: t('frc_rfqs.detail.columns.destinationAirport', 'Destination Airport'),
      width: 180,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'shipmentReadyDate',
      title: t('frc_rfqs.detail.columns.shipmentReadyDate', 'Shipment Ready'),
      width: 130,
      type: 'date',
    },
    {
      data: 'requiredAtDestinationDate',
      title: t('frc_rfqs.detail.columns.requiredAtDestination', 'Required At Dest.'),
      width: 130,
      type: 'date',
    },
    {
      data: 'looseOrUnitised',
      title: t('frc_rfqs.detail.columns.looseOrUnitised', 'Loose/Unitised'),
      width: 120,
      type: 'dropdown',
      source: LOOSE_OR_UNITISED_OPTIONS,
    },
    {
      data: 'targetRate',
      title: t('frc_rfqs.detail.columns.targetRate', 'Target Rate'),
      width: 110,
      type: 'numeric',
    },
  ], [t, airportEditorConfig])

  const tableData = useMemo(() => [{
    id: data.id,
    originAirportDisplay: data.originAirport?.code ?? '',
    destinationAirportDisplay: data.destinationAirport?.code ?? '',
    shipmentReadyDate: data.shipmentReadyDate ?? '',
    requiredAtDestinationDate: data.requiredAtDestinationDate ?? '',
    looseOrUnitised: data.looseOrUnitised ?? '',
    targetRate: data.targetRate ?? '',
  }], [data])

  const handleCellSave = useCallback(async (field: string, value: unknown, rowIndex: number, colIndex: number) => {
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
      } else if (field === 'shipmentReadyDate' || field === 'requiredAtDestinationDate') {
        processedValue = formatDateForApi(value)
      } else if (field === 'looseOrUnitised') {
        processedValue = value ? String(value) : null
      } else if (field === 'targetRate') {
        processedValue = value ? String(value) : null
      }

      await onFieldSave(apiField, processedValue)

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
  }, [onFieldSave, tableRef])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        handleCellSave(payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

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
