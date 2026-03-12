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

import type { ProjectDraft } from './types'
import { loadInitialAirports } from '../../../../lib/initialSuggestions'

interface ProjectWizardRouteTableProps {
  draft: ProjectDraft
  onDraftChange: (updates: Partial<ProjectDraft>) => void
  prevTableRef?: React.RefObject<HTMLDivElement>
  nextTableRef?: React.RefObject<HTMLDivElement>
}

export function ProjectWizardRouteTable({
  draft,
  onDraftChange,
  prevTableRef,
  nextTableRef,
}: ProjectWizardRouteTableProps) {
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
      data: 'requiredDeliveryDate',
      title: 'Required Delivery',
      width: 130,
      type: 'date',
    },
  ], [airportEditorConfig])

  const tableData = useMemo(() => [{
    id: 'draft',
    originAirportCode: draft.originAirportCode ?? '',
    destinationAirportCode: draft.destinationAirportCode ?? '',
    shipmentReadyDate: draft.shipmentReadyDate ?? '',
    requiredDeliveryDate: draft.requiredDeliveryDate ?? '',
  }], [draft])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    const updates: Partial<ProjectDraft> = {}

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
    } else if (field === 'requiredDeliveryDate') {
      updates.requiredDeliveryDate = value ? String(value) : null
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
        <h3 className="text-sm font-medium">Route & Dates</h3>
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
