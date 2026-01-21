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
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Trash2 } from 'lucide-react'
import type { ProjectSeaContainer } from './hooks/useProjectWizard'

type ProjectSeaContainersTableProps = {
  projectId: string
  seaContainers: ProjectSeaContainer[]
  isLoading: boolean
  onSeaContainerUpdate: (containerId: string, field: string, value: unknown) => void
  onAddSeaContainer: (data: Partial<ProjectSeaContainer>) => Promise<{ id: string } | null>
  onRemoveSeaContainer: (containerId: string) => void
}

const CONTAINER_TYPE_OPTIONS = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR']
const OWNERSHIP_TYPE_OPTIONS = ['soc', 'coc']
const STATUS_OPTIONS = ['not_ready', 'ready', 'in_transit', 'delivered']

export function ProjectSeaContainersTable({
  projectId,
  seaContainers,
  isLoading,
  onSeaContainerUpdate,
  onAddSeaContainer,
  onRemoveSeaContainer,
}: ProjectSeaContainersTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'containerType',
      title: 'Type',
      width: 80,
      type: 'dropdown',
      source: CONTAINER_TYPE_OPTIONS,
    },
    {
      data: 'containerNumber',
      title: 'Container #',
      width: 130,
      type: 'text',
    },
    {
      data: 'sealNumber',
      title: 'Seal #',
      width: 100,
      type: 'text',
    },
    {
      data: 'bookingNumber',
      title: 'Booking #',
      width: 120,
      type: 'text',
    },
    {
      data: 'blNumber',
      title: 'B/L #',
      width: 120,
      type: 'text',
    },
    {
      data: 'vesselName',
      title: 'Vessel',
      width: 120,
      type: 'text',
    },
    {
      data: 'voyageNumber',
      title: 'Voyage',
      width: 80,
      type: 'text',
    },
    {
      data: 'originPort',
      title: 'Origin',
      width: 80,
      type: 'text',
    },
    {
      data: 'destinationPort',
      title: 'Dest',
      width: 80,
      type: 'text',
    },
    {
      data: 'ownershipType',
      title: 'Own',
      width: 60,
      type: 'dropdown',
      source: OWNERSHIP_TYPE_OPTIONS,
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
    return seaContainers.map((container) => ({
      id: container.id,
      containerType: container.containerType || '40HC',
      containerNumber: container.containerNumber || '',
      sealNumber: container.sealNumber || '',
      bookingNumber: container.bookingNumber || '',
      blNumber: container.blNumber || '',
      vesselName: container.vesselName || '',
      voyageNumber: container.voyageNumber || '',
      originPort: container.originPort || '',
      destinationPort: container.destinationPort || '',
      ownershipType: container.ownershipType || 'coc',
      status: container.status || 'not_ready',
    }))
  }, [seaContainers])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onSeaContainerUpdate(payload.id as string, payload.prop, payload.newValue)

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

      // Handle saving new rows - this is called when user clicks Save on a new row
      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        try {
          // Filter out internal properties and map to API format
          const { _isNew, id, ...rowData } = payload.rowData as Record<string, unknown>

          const result = await onAddSeaContainer({
            projectId, // Include projectId from props
            containerType: (rowData.containerType as string) || '40HC',
            containerNumber: (rowData.containerNumber as string) || null,
            sealNumber: (rowData.sealNumber as string) || null,
            bookingNumber: (rowData.bookingNumber as string) || null,
            blNumber: (rowData.blNumber as string) || null,
            vesselName: (rowData.vesselName as string) || null,
            voyageNumber: (rowData.voyageNumber as string) || null,
            originPort: (rowData.originPort as string) || null,
            destinationPort: (rowData.destinationPort as string) || null,
            ownershipType: (rowData.ownershipType as string) || 'coc',
            status: (rowData.status as string) || 'not_ready',
          })

          if (result?.id) {
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...rowData, id: result.id },
            } as NewRowSaveSuccessEvent)
          } else {
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error: 'Failed to create container',
            } as NewRowSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create container'
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleRemoveSeaContainer = useCallback(
    (containerId: string) => {
      if (confirm('Remove this sea container from the project?')) {
        onRemoveSeaContainer(containerId)
      }
    },
    [onRemoveSeaContainer]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={11} />
  }

  return (
    <div className="border rounded-lg">
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Sea Containers"
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: false, // Enable built-in add row button
          toolbarPosition: 'bottom', // Move Columns button to bottom like Products & Costs
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => {
          // Don't show delete button for new rows (they have a cancel button)
          if (rowData._isNew) return null
          return (
            <button
              onClick={() => handleRemoveSeaContainer(rowData.id as string)}
              className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
              title="Remove container"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )
        }}
      />
    </div>
  )
}
