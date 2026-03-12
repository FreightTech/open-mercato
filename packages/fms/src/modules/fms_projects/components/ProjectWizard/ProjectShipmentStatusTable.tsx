'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import {
  DynamicTable,
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
import type { Project } from './hooks/useProjectWizard'

type ProjectShipmentStatusTableProps = {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
}

export function ProjectShipmentStatusTable({
  project,
  onUpdate,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
}: ProjectShipmentStatusTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Simple cutoff columns - just dates at project level
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'cargoReadyDate',
      title: 'Cargo Ready',
      width: 130,
      type: 'date',
    },
    {
      data: 'vgmCutoffDate',
      title: 'VGM Cutoff',
      width: 130,
      type: 'date',
    },
    {
      data: 'docCutoffDate',
      title: 'Doc Cutoff',
      width: 130,
      type: 'date',
    },
    {
      data: 'gateInDate',
      title: 'Gate In',
      width: 130,
      type: 'date',
    },
    {
      data: 'gateCloseDate',
      title: 'Gate Close',
      width: 130,
      type: 'date',
    },
  ], [])

  // Single row with project-level cutoff dates
  const tableData = useMemo(() => [{
    id: project.id,
    cargoReadyDate: project.cargoReadyDate || null,
    vgmCutoffDate: project.vgmCutoffDate || null,
    docCutoffDate: project.docCutoffDate || null,
    gateInDate: project.gateInDate || null,
    gateCloseDate: project.gateCloseDate || null,
  }], [project])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Update project with the new cutoff date
          onUpdate({ [payload.prop]: payload.newValue || null })

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

  return (
    <div className="border rounded-lg">
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Cutoffs"
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          hideBottomBar: true,
          hideColumnsButton: true,
          hideFilterButton: true,
          hideSortButton: true,
        }}
      />
    </div>
  )
}
