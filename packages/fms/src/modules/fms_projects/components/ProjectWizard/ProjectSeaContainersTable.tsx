'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Trash2 } from 'lucide-react'
import type { ProjectSeaContainer } from './hooks/useProjectWizard'

type ProjectSeaContainersTableProps = {
  projectId: string
  seaContainers: ProjectSeaContainer[]
  isLoading: boolean
  onSeaContainerUpdate: (containerId: string, field: string, value: unknown) => void
  onAddSeaContainer: (data: Partial<ProjectSeaContainer>) => Promise<{ id: string } | null>
  onRemoveSeaContainer: (containerId: string) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
}

const CONTAINER_TYPE_OPTIONS = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR']
const STATUS_OPTIONS = ['not_ready', 'ready', 'in_transit', 'delivered']
const CUSTOMS_STATUS_OPTIONS = ['pending', 'in_progress', 'cleared']

// Status chip colors
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  not_ready: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Not Ready' },
  ready: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Ready' },
  in_transit: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Transit' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', label: 'Delivered' },
}

const CUSTOMS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Progress' },
  cleared: { bg: 'bg-green-100', text: 'text-green-700', label: 'Cleared' },
}

// Custom renderer for status chip
const statusChipRenderer = (value: string) => {
  const config = STATUS_COLORS[value] || STATUS_COLORS.not_ready
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

// Custom renderer for customs status chip
const customsChipRenderer = (value: string) => {
  const config = CUSTOMS_COLORS[value] || CUSTOMS_COLORS.pending
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

export function ProjectSeaContainersTable({
  projectId,
  seaContainers,
  isLoading,
  onSeaContainerUpdate,
  onAddSeaContainer,
  onRemoveSeaContainer,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
}: ProjectSeaContainersTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [containerToDelete, setContainerToDelete] = useState<string | null>(null)

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'containerNumber',
      title: 'Container Number',
      width: 150,
      type: 'text',
    },
    {
      data: 'containerType',
      title: 'Type',
      width: 80,
      type: 'dropdown',
      source: CONTAINER_TYPE_OPTIONS,
    },
    {
      data: 'sealNumber',
      title: 'Seal',
      width: 100,
      type: 'text',
    },
    {
      data: 'status',
      title: 'Status',
      width: 110,
      type: 'dropdown',
      source: STATUS_OPTIONS,
      renderer: statusChipRenderer,
    },
    {
      data: 'customsClearanceStatus',
      title: 'Customs',
      width: 110,
      type: 'dropdown',
      source: CUSTOMS_STATUS_OPTIONS,
      renderer: customsChipRenderer,
    },
    {
      data: 'etd',
      title: 'ETD',
      width: 110,
      type: 'date',
    },
    {
      data: 'eta',
      title: 'ETA',
      width: 110,
      type: 'date',
    },
  ], [])

  const tableData = useMemo(() => {
    return seaContainers.map((container) => ({
      id: container.id,
      containerNumber: container.containerNumber || '',
      containerType: container.containerType || '40HC',
      sealNumber: container.sealNumber || '',
      status: container.status || 'not_ready',
      customsClearanceStatus: (container as any).customsClearanceStatus || 'pending',
      etd: container.etd || '',
      eta: container.eta || '',
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
            containerNumber: (rowData.containerNumber as string) || null,
            containerType: (rowData.containerType as string) || '40HC',
            sealNumber: (rowData.sealNumber as string) || null,
            status: (rowData.status as string) || 'not_ready',
            customsClearanceStatus: (rowData.customsClearanceStatus as string) || 'pending',
            etd: (rowData.etd as string) || null,
            eta: (rowData.eta as string) || null,
          } as any)

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
      setContainerToDelete(containerId)
      setDeleteConfirmOpen(true)
    },
    []
  )

  const handleConfirmDelete = useCallback(() => {
    if (containerToDelete) {
      onRemoveSeaContainer(containerToDelete)
    }
    setDeleteConfirmOpen(false)
    setContainerToDelete(null)
  }, [containerToDelete, onRemoveSeaContainer])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setContainerToDelete(null)
  }, [])

  if (isLoading) {
    return <TableSkeleton rows={3} columns={7} />
  }

  return (
    <>
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
          autoSelectOnFocus={autoSelectOnFocus}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideColumnsButton: true,
            hideFilterButton: true,
            hideSortButton: true,
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

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Container</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this sea container from the project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
