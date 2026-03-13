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
import type { ProjectCargo } from './hooks/useProjectWizard'

type ProjectCargoTableProps = {
  cargo: ProjectCargo[]
  isLoading: boolean
  onCargoUpdate: (cargoId: string, field: string, value: unknown) => void
  onAddCargo: () => void
  onRemoveCargo: (cargoId: string) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  enableComments?: boolean
  commentsTableId?: string
}

const PACKAGE_TYPE_OPTIONS = ['Pallets', 'Boxes', 'Crates', 'Bags', 'Drums', 'Bundles', 'Pieces', 'Other']

export function ProjectCargoTable({
  cargo,
  isLoading,
  onCargoUpdate,
  onAddCargo,
  onRemoveCargo,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
  enableComments,
  commentsTableId,
}: ProjectCargoTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'description',
      title: 'Description',
      width: 200,
      type: 'text',
    },
    {
      data: 'packageCount',
      title: 'Qty',
      width: 60,
      type: 'numeric',
    },
    {
      data: 'packageType',
      title: 'Package',
      width: 100,
      type: 'dropdown',
      source: PACKAGE_TYPE_OPTIONS,
    },
    {
      data: 'grossWeight',
      title: 'Weight (kg)',
      width: 100,
      type: 'numeric',
    },
    {
      data: 'volume',
      title: 'Volume (cbm)',
      width: 100,
      type: 'numeric',
    },
    {
      data: 'length',
      title: 'L (cm)',
      width: 70,
      type: 'numeric',
    },
    {
      data: 'width',
      title: 'W (cm)',
      width: 70,
      type: 'numeric',
    },
    {
      data: 'height',
      title: 'H (cm)',
      width: 70,
      type: 'numeric',
    },
  ], [])

  const tableData = useMemo(() => {
    return cargo.map((item) => ({
      id: item.id,
      description: item.description || '',
      packageCount: item.packageCount || '',
      packageType: item.packageType || '',
      grossWeight: item.grossWeight || '',
      volume: item.volume || '',
      length: item.length || '',
      width: item.width || '',
      height: item.height || '',
    }))
  }, [cargo])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onCargoUpdate(payload.id as string, payload.prop, payload.newValue)

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

  const handleRemoveCargo = useCallback(
    (cargoId: string) => {
      if (confirm('Remove this cargo item from the project?')) {
        onRemoveCargo(cargoId)
      }
    },
    [onRemoveCargo]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={8} />
  }

  const tableHeight = Math.min(Math.max(cargo.length * 40 + 100, 150), 300)

  const toolbarButtons = (
    <Button onClick={onAddCargo} size="sm" variant="outline">
      <Plus className="h-4 w-4 mr-1" />
      Add Cargo
    </Button>
  )

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Cargo Items"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        enableComments={enableComments}
        commentsTableId={commentsTableId}
        uiConfig={{
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          topBarEnd: toolbarButtons,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemoveCargo(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title="Remove cargo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  )
}
