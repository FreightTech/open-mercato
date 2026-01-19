'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Trash2 } from 'lucide-react'
import type { ProjectLeg } from './hooks/useProjectWizard'

type ProjectLegsTableProps = {
  legs: ProjectLeg[]
  isLoading: boolean
  onLegUpdate: (legId: string, field: string, value: unknown) => void
  onAddLeg?: () => void
  onRemoveLeg: (legId: string) => void
}

const TRANSPORT_MODE_OPTIONS = ['SEA', 'RAIL', 'ROAD', 'AIR', 'MULTIMODAL']

export function ProjectLegsTable({
  legs,
  isLoading,
  onLegUpdate,
  onAddLeg,
  onRemoveLeg,
}: ProjectLegsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'legSequence',
      title: '#',
      width: 40,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'transportMode',
      title: 'Mode',
      width: 100,
      type: 'dropdown',
      source: TRANSPORT_MODE_OPTIONS,
    },
    {
      data: 'originAddress',
      title: 'Origin',
      width: 180,
      type: 'text',
    },
    {
      data: 'destinationAddress',
      title: 'Destination',
      width: 180,
      type: 'text',
    },
    {
      data: 'estimatedDeparture',
      title: 'ETD',
      width: 120,
      type: 'date',
    },
    {
      data: 'estimatedArrival',
      title: 'ETA',
      width: 120,
      type: 'date',
    },
    {
      data: 'vesselName',
      title: 'Vessel/Vehicle',
      width: 140,
      type: 'text',
    },
    {
      data: 'voyageNumber',
      title: 'Voyage',
      width: 100,
      type: 'text',
    },
    {
      data: 'bookingNumber',
      title: 'Booking #',
      width: 120,
      type: 'text',
    },
  ], [])

  const tableData = useMemo(() => {
    return legs.map((leg) => ({
      id: leg.id,
      legSequence: leg.legSequence,
      transportMode: leg.transportMode || 'SEA',
      originAddress: leg.originAddress || '',
      destinationAddress: leg.destinationAddress || '',
      estimatedDeparture: leg.estimatedDeparture?.slice(0, 10) || '',
      estimatedArrival: leg.estimatedArrival?.slice(0, 10) || '',
      vesselName: leg.vesselName || '',
      voyageNumber: leg.voyageNumber || '',
      bookingNumber: leg.bookingNumber || '',
    }))
  }, [legs])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onLegUpdate(payload.id as string, payload.prop, payload.newValue)

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleRemoveLeg = useCallback(
    (legId: string) => {
      if (confirm('Remove this leg from the project?')) {
        onRemoveLeg(legId)
      }
    },
    [onRemoveLeg]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={9} />
  }

  const tableHeight = Math.min(Math.max(legs.length * 40 + 60, 100), 300)

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Route Legs"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemoveLeg(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title="Remove leg"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  )
}
