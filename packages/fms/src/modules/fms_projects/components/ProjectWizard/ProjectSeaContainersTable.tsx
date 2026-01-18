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
import type { ProjectSeaContainer } from './hooks/useProjectWizard'

type ProjectSeaContainersTableProps = {
  seaContainers: ProjectSeaContainer[]
  isLoading: boolean
  onSeaContainerUpdate: (containerId: string, field: string, value: unknown) => void
  onAddSeaContainer: () => void
  onRemoveSeaContainer: (containerId: string) => void
}

const CONTAINER_TYPE_OPTIONS = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR']
const OWNERSHIP_TYPE_OPTIONS = ['soc', 'coc']
const STATUS_OPTIONS = ['not_ready', 'ready', 'in_transit', 'delivered']

export function ProjectSeaContainersTable({
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

  const tableHeight = Math.min(Math.max(seaContainers.length * 40 + 100, 150), 300)

  const toolbarButtons = (
    <Button onClick={onAddSeaContainer} size="sm" variant="outline">
      <Plus className="h-4 w-4 mr-1" />
      Add Container
    </Button>
  )

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Sea Containers"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          topBarEnd: toolbarButtons,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemoveSeaContainer(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title="Remove container"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  )
}
