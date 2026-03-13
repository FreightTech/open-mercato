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
import { Button } from '@open-mercato/ui/primitives/button'
import { Plus, Trash2 } from 'lucide-react'
import type { ProjectRoadUnit } from './hooks/useProjectWizard'

type ProjectRoadUnitsTableProps = {
  roadUnits: ProjectRoadUnit[]
  isLoading: boolean
  onRoadUnitUpdate: (roadUnitId: string, field: string, value: unknown) => void
  onAddRoadUnit: () => void
  onRemoveRoadUnit: (roadUnitId: string) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  enableComments?: boolean
  commentsEntityType?: string
  commentsViewContext?: string
}

const VEHICLE_TYPE_OPTIONS = ['ftl_truck', 'ltl_truck', 'van', 'flatbed', 'reefer_truck', 'tanker']
const STATUS_OPTIONS = ['not_ready', 'ready', 'in_transit', 'delivered']

export function ProjectRoadUnitsTable({
  roadUnits,
  isLoading,
  onRoadUnitUpdate,
  onAddRoadUnit,
  onRemoveRoadUnit,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
  enableComments,
  commentsEntityType,
  commentsViewContext,
}: ProjectRoadUnitsTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'vehicleType',
      title: 'Type',
      width: 100,
      type: 'dropdown',
      source: VEHICLE_TYPE_OPTIONS,
    },
    {
      data: 'truckNumber',
      title: 'Truck #',
      width: 100,
      type: 'text',
    },
    {
      data: 'trailerNumber',
      title: 'Trailer #',
      width: 100,
      type: 'text',
    },
    {
      data: 'cmrNumber',
      title: 'CMR #',
      width: 100,
      type: 'text',
    },
    {
      data: 'carrierName',
      title: 'Carrier',
      width: 120,
      type: 'text',
    },
    {
      data: 'driverName',
      title: 'Driver',
      width: 100,
      type: 'text',
    },
    {
      data: 'originAddress',
      title: 'Pickup',
      width: 150,
      type: 'text',
    },
    {
      data: 'destinationAddress',
      title: 'Delivery',
      width: 150,
      type: 'text',
    },
    {
      data: 'pieces',
      title: 'Pcs',
      width: 60,
      type: 'numeric',
    },
    {
      data: 'grossWeight',
      title: 'Weight',
      width: 80,
      type: 'numeric',
    },
    {
      data: 'loadingMeters',
      title: 'LDM',
      width: 60,
      type: 'numeric',
    },
    {
      data: 'status',
      title: 'Status',
      width: 100,
      type: 'dropdown',
      source: STATUS_OPTIONS,
    },
  ], [])

  const tableData = useMemo(() => {
    return roadUnits.map((unit) => ({
      id: unit.id,
      vehicleType: unit.vehicleType || 'ftl_truck',
      truckNumber: unit.truckNumber || '',
      trailerNumber: unit.trailerNumber || '',
      cmrNumber: unit.cmrNumber || '',
      carrierName: unit.carrierName || '',
      driverName: unit.driverName || '',
      originAddress: unit.originAddress || '',
      destinationAddress: unit.destinationAddress || '',
      pieces: unit.pieces || '',
      grossWeight: unit.grossWeight || '',
      loadingMeters: unit.loadingMeters || '',
      status: unit.status || 'not_ready',
    }))
  }, [roadUnits])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onRoadUnitUpdate(payload.id as string, payload.prop, payload.newValue)

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

  const handleRemoveRoadUnit = useCallback(
    (roadUnitId: string) => {
      if (confirm('Remove this road unit from the project?')) {
        onRemoveRoadUnit(roadUnitId)
      }
    },
    [onRemoveRoadUnit]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={12} />
  }

  const tableHeight = Math.min(Math.max(roadUnits.length * 40 + 100, 150), 300)

  const toolbarButtons = (
    <Button onClick={onAddRoadUnit} size="sm" variant="outline">
      <Plus className="h-4 w-4 mr-1" />
      Add Truck
    </Button>
  )

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Road Units"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        enableComments={enableComments}
        commentsEntityType={commentsEntityType}
        commentsViewContext={commentsViewContext}
        uiConfig={{
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          topBarEnd: toolbarButtons,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemoveRoadUnit(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title="Remove road unit"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  )
}
