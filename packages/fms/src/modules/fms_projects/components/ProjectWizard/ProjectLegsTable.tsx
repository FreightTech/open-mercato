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
import { Trash2, Route, Plus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
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

  // Title content for top bar
  const titleContent = (
    <div className="flex items-center gap-2">
      <Route className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">Route Legs</span>
      <Badge variant="secondary">{legs.length}</Badge>
    </div>
  )

  // Buttons for top bar
  const toolbarButtons = onAddLeg ? (
    <Button onClick={onAddLeg} size="sm" variant="outline">
      <Plus className="h-4 w-4 mr-1" />
      Add Leg
    </Button>
  ) : null

  // Empty state
  if (legs.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          {titleContent}
          {toolbarButtons}
        </div>
        <div className="p-6 text-center text-muted-foreground">
          <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No route legs added yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
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
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true,
          toolbarPosition: 'bottom',
          hideFilterPopover: true,
          hideSortButton: true,
          topBarStart: titleContent,
          topBarEnd: toolbarButtons,
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
