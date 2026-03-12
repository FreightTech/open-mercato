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
} from '@open-mercato/ui/backend/dynamic-table'

import type { OpportunityDraft } from './types'
import { LOOSE_OR_UNITISED_OPTIONS } from './types'
import { loadInitialAirports } from '../../../../lib/initialSuggestions'

interface OpportunityRouteTableProps {
  draft: OpportunityDraft
  onDraftChange: (updates: Partial<OpportunityDraft>) => void
  prevTableRef?: React.RefObject<HTMLDivElement>
  nextTableRef?: React.RefObject<HTMLDivElement>
}

export function OpportunityRouteTable({
  draft,
  onDraftChange,
  prevTableRef,
  nextTableRef,
}: OpportunityRouteTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Entity search editor config for airports
  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: 'Search airports...',
    minQueryLength: 2,
    additionalFilters: { type: 'airport' },
    initialSuggestions: {
      loadItems: loadInitialAirports,
      limit: 4,
    },
  }), [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'originAirportCode',
      title: 'Origin Airport',
      width: 180,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'destinationAirportCode',
      title: 'Destination Airport',
      width: 180,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'shipmentReadyDate',
      title: 'Shipment Ready',
      width: 130,
      type: 'date',
    },
    {
      data: 'requiredAtDestinationDate',
      title: 'Required At Dest.',
      width: 130,
      type: 'date',
    },
    {
      data: 'looseOrUnitised',
      title: 'Loose/Unitised',
      width: 120,
      type: 'dropdown',
      source: LOOSE_OR_UNITISED_OPTIONS,
    },
    {
      data: 'targetRate',
      title: 'Target Rate',
      width: 100,
      type: 'numeric',
    },
  ], [airportEditorConfig])

  const tableData = useMemo(() => [{
    id: 'draft',
    originAirportCode: draft.originAirportCode ?? '',
    destinationAirportCode: draft.destinationAirportCode ?? '',
    shipmentReadyDate: draft.shipmentReadyDate ?? '',
    requiredAtDestinationDate: draft.requiredAtDestinationDate ?? '',
    looseOrUnitised: draft.looseOrUnitised ?? '',
    targetRate: draft.targetRate ?? '',
  }], [draft])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    const updates: Partial<OpportunityDraft> = {}

    if (field === 'originAirportCode') {
      try {
        const parsed = JSON.parse(String(value))
        updates.originAirportId = parsed.id
        updates.originAirportCode = parsed.code
      } catch {
        updates.originAirportId = null
        updates.originAirportCode = value ? String(value) : null
      }
    } else if (field === 'destinationAirportCode') {
      try {
        const parsed = JSON.parse(String(value))
        updates.destinationAirportId = parsed.id
        updates.destinationAirportCode = parsed.code
      } catch {
        updates.destinationAirportId = null
        updates.destinationAirportCode = value ? String(value) : null
      }
    } else if (field === 'shipmentReadyDate') {
      updates.shipmentReadyDate = value ? String(value) : null
    } else if (field === 'requiredAtDestinationDate') {
      updates.requiredAtDestinationDate = value ? String(value) : null
    } else if (field === 'looseOrUnitised') {
      updates.looseOrUnitised = value ? (String(value) as OpportunityDraft['looseOrUnitised']) : null
    } else if (field === 'targetRate') {
      updates.targetRate = value ? String(value) : null
    }

    onDraftChange(updates)
  }, [onDraftChange])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        handleCellChange(payload.prop, payload.newValue)

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveSuccessEvent)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-1.5 border-b">
        <h3 className="text-sm font-medium">Route</h3>
      </div>
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
        siblingTableRefs={{ prev: prevTableRef, next: nextTableRef }}
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
