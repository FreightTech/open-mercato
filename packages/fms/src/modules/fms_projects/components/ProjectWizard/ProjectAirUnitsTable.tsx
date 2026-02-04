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
import type { ProjectAirUnit } from './hooks/useProjectWizard'

type ProjectAirUnitsTableProps = {
  airUnits: ProjectAirUnit[]
  isLoading: boolean
  onAirUnitUpdate: (airUnitId: string, field: string, value: unknown) => void
  onAddAirUnit: () => void
  onRemoveAirUnit: (airUnitId: string) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
}

const DELIVERY_STATUS_OPTIONS = ['awaiting', 'booked', 'in_transit', 'delivered']
const UNIT_TYPE_OPTIONS = ['pmc', 'ake', 'pag', 'paj', 'pla', 'rkn']
const ORIGIN_TYPE_OPTIONS = ['airport', 'warehouse', 'door']

export function ProjectAirUnitsTable({
  airUnits,
  isLoading,
  onAirUnitUpdate,
  onAddAirUnit,
  onRemoveAirUnit,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
}: ProjectAirUnitsTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'deliveryStatus',
      title: 'Status',
      width: 90,
      type: 'dropdown',
      source: DELIVERY_STATUS_OPTIONS,
    },
    {
      data: 'isLoose',
      title: 'Loose',
      width: 60,
      type: 'boolean',
    },
    {
      data: 'pieces',
      title: 'Pcs',
      width: 60,
      type: 'numeric',
    },
    {
      data: 'grossWeight',
      title: 'Weight (kg)',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'chargeableWeight',
      title: 'Chg Wt',
      width: 80,
      type: 'numeric',
    },
    {
      data: 'volume',
      title: 'Vol (cbm)',
      width: 80,
      type: 'numeric',
    },
    {
      data: 'originAirport',
      title: 'Origin',
      width: 70,
      type: 'text',
    },
    {
      data: 'destinationAirport',
      title: 'Dest',
      width: 70,
      type: 'text',
    },
    {
      data: 'mawbNumber',
      title: 'MAWB',
      width: 120,
      type: 'text',
    },
    {
      data: 'hawbNumber',
      title: 'HAWB',
      width: 100,
      type: 'text',
    },
    {
      data: 'flightNumber',
      title: 'Flight',
      width: 80,
      type: 'text',
    },
    {
      data: 'isDgr',
      title: 'DGR',
      width: 50,
      type: 'boolean',
    },
    {
      data: 'isStackable',
      title: 'Stack',
      width: 55,
      type: 'boolean',
    },
  ], [])

  const tableData = useMemo(() => {
    return airUnits.map((unit) => ({
      id: unit.id,
      deliveryStatus: unit.deliveryStatus || 'awaiting',
      isLoose: unit.isLoose ?? true,
      pieces: unit.pieces || '',
      grossWeight: unit.grossWeight || '',
      chargeableWeight: unit.chargeableWeight || '',
      volume: unit.volume || '',
      originAirport: unit.originAirport || '',
      destinationAirport: unit.destinationAirport || '',
      mawbNumber: unit.mawbNumber || '',
      hawbNumber: unit.hawbNumber || '',
      flightNumber: unit.flightNumber || '',
      isDgr: unit.isDgr ?? false,
      isStackable: unit.isStackable ?? true,
    }))
  }, [airUnits])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onAirUnitUpdate(payload.id as string, payload.prop, payload.newValue)

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

  const handleRemoveAirUnit = useCallback(
    (airUnitId: string) => {
      if (confirm('Remove this air unit from the project?')) {
        onRemoveAirUnit(airUnitId)
      }
    },
    [onRemoveAirUnit]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={13} />
  }

  const tableHeight = Math.min(Math.max(airUnits.length * 40 + 100, 150), 300)

  const toolbarButtons = (
    <Button onClick={onAddAirUnit} size="sm" variant="outline">
      <Plus className="h-4 w-4 mr-1" />
      Add Air Unit
    </Button>
  )

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Air Units"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          topBarEnd: toolbarButtons,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemoveAirUnit(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title="Remove air unit"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  )
}
