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
import { Trash2, Ship, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import type { ProjectSeaContainer, TimestampEntry } from '../ProjectWizard/hooks/useProjectWizard'
import { CombinedTimestampCell } from './CombinedTimestampCell'
import { SeaContainerDetailsDrawer } from './SeaContainerDetailsDrawer'

type SeaContainersTableProps = {
  projectId: string
  seaContainers: ProjectSeaContainer[]
  isLoading: boolean
  onSeaContainerUpdate: (containerId: string, field: string, value: unknown) => void
  onAddSeaContainer: (data: Partial<ProjectSeaContainer>) => Promise<{ id: string } | null>
  onRemoveSeaContainer: (containerId: string) => void
  onImportTracking?: () => void
  onRefreshTracking?: () => void
  isRefreshingTracking?: boolean
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  enableComments?: boolean
  commentsEntityType?: string
  commentsViewContext?: string
}

const CONTAINER_TYPE_OPTIONS = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR']
// Sea container statuses aligned with shipment-tracking module
const STATUS_OPTIONS = [
  // Shipment-tracking aligned statuses (UPPERCASE)
  'PENDING',
  'BOOKED',
  'DEPARTED',
  'IN_TRANSIT',
  'PRE_ARRIVAL',
  'ARRIVED',
  'DELIVERED',
  // FMS-specific operational statuses
  'gate_in',
  'loaded',
  'discharged',
  'gate_out',
  'returned',
]
const CUSTOMS_STATUS_OPTIONS = ['pending', 'in_progress', 'cleared']

// Status chip colors - aligned with new SeaContainerStatus enum
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  // Shipment-tracking aligned statuses
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  // Legacy status (backward compatibility for existing data)
  not_ready: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  BOOKED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Booked' },
  DEPARTED: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Departed' },
  IN_TRANSIT: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Transit' },
  PRE_ARRIVAL: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pre-Arrival' },
  ARRIVED: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Arrived' },
  DELIVERED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Delivered' },
  // FMS-specific operational statuses
  gate_in: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Gate In' },
  loaded: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Loaded' },
  discharged: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Discharged' },
  gate_out: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Gate Out' },
  returned: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Returned' },
}

const CUSTOMS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Progress' },
  cleared: { bg: 'bg-green-100', text: 'text-green-700', label: 'Cleared' },
}

// Custom renderer for status chip
const statusChipRenderer = (value: string) => {
  const config = STATUS_COLORS[value] || STATUS_COLORS.PENDING
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

export function SeaContainersTable({
  projectId,
  seaContainers,
  isLoading,
  onSeaContainerUpdate,
  onAddSeaContainer,
  onRemoveSeaContainer,
  onImportTracking,
  onRefreshTracking,
  isRefreshingTracking,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
  enableComments,
  commentsEntityType,
  commentsViewContext,
}: SeaContainersTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [containerToDelete, setContainerToDelete] = useState<string | null>(null)
  
  // Drawer state for container details
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  
  // Handle row click to open drawer (Shift+Enter style behavior)
  const handleRowClick = useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const containerId = rowData.id as string
    if (containerId) {
      setSelectedContainerId(containerId)
      setDrawerOpen(true)
    }
  }, [])

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
      data: 'etdAtd',
      title: 'ETD/ATD',
      width: 150,
      readOnly: true,
      renderer: (_value: unknown, rowData: Record<string, unknown>) => (
        <CombinedTimestampCell
          estimatedTimestamps={rowData.etdTimestamps as TimestampEntry[] | null}
          actualTimestamps={rowData.atdTimestamps as TimestampEntry[] | null}
          label="ETD/ATD"
          format="date"
        />
      ),
    },
    {
      data: 'etaAta',
      title: 'ETA/ATA',
      width: 150,
      readOnly: true,
      renderer: (_value: unknown, rowData: Record<string, unknown>) => (
        <CombinedTimestampCell
          estimatedTimestamps={rowData.etaTimestamps as TimestampEntry[] | null}
          actualTimestamps={rowData.ataTimestamps as TimestampEntry[] | null}
          label="ETA/ATA"
          format="date"
        />
      ),
    },
  ], [])

  const tableData = useMemo(() => {
    return seaContainers.map((container) => ({
      id: container.id,
      containerNumber: container.containerNumber || '',
      containerType: container.containerType || '40HC',
      sealNumber: container.sealNumber || '',
      status: container.status || 'PENDING',
      customsClearanceStatus: (container as any).customsClearanceStatus || 'pending',
      // Timestamp arrays for combined cells
      etdTimestamps: container.etdTimestamps,
      atdTimestamps: container.atdTimestamps,
      etaTimestamps: container.etaTimestamps,
      ataTimestamps: container.ataTimestamps,
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
            status: (rowData.status as string) || 'PENDING',
            customsClearanceStatus: (rowData.customsClearanceStatus as string) || 'pending',
            // Note: timestamps are now managed via arrays, not editable in new row
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

  // Toolbar buttons for tracking
  const trackingButtons = (
    <div className="flex items-center gap-2">
      {onRefreshTracking && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshTracking}
          disabled={isRefreshingTracking}
          className="gap-2"
        >
          {isRefreshingTracking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Tracking
        </Button>
      )}
      {onImportTracking && (
        <Button
          variant="outline"
          size="sm"
          onClick={onImportTracking}
          className="gap-2"
        >
          <Ship className="h-4 w-4" />
          Import Tracking
        </Button>
      )}
    </div>
  )

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
          enableComments={enableComments}
          commentsEntityType={commentsEntityType}
          commentsViewContext={commentsViewContext}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideColumnsButton: true,
            hideFilterButton: true,
            hideSortButton: true,
            topBarEnd: trackingButtons,
          }}
          actionsRenderer={(rowData: Record<string, unknown>) => {
            if (rowData._isNew) return null
            return (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleRowClick(0, rowData)}
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  title="View details"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRemoveSeaContainer(rowData.id as string)}
                  className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                  title="Remove container"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
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

      {/* Sea Container Details Drawer */}
      <SeaContainerDetailsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        containerId={selectedContainerId}
        projectId={projectId}
        onUpdate={onSeaContainerUpdate}
      />
    </>
  )
}
