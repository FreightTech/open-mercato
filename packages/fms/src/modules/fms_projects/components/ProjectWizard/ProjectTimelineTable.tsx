'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
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
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { Project, ProjectSeaContainer } from './hooks/useProjectWizard'

type ProjectTimelineTableProps = {
  project: Project
  seaContainers: ProjectSeaContainer[]
  onProjectUpdate: (updates: Partial<Project>) => void
  onContainerUpdate: (containerId: string, field: string, value: unknown) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
}

// Derive overall shipment status from dates
function deriveShipmentStatus(
  etd: string | null,
  atd: string | null,
  eta: string | null,
  ata: string | null
): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (ata) {
    return { label: 'Delivered', variant: 'default' }
  }
  if (atd) {
    return { label: 'In Transit', variant: 'outline' }
  }
  if (etd) {
    const etdDate = new Date(etd)
    const now = new Date()
    if (etdDate <= now) {
      return { label: 'Loading', variant: 'outline' }
    }
    return { label: 'Scheduled', variant: 'secondary' }
  }
  return { label: 'Pending', variant: 'secondary' }
}

// Format date for display
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '-'
  }
}

// Date cell renderer with completion badge
function DateWithStatusRenderer({
  value,
  actualValue,
  label,
}: {
  value: string | null | undefined
  actualValue?: string | null | undefined
  label: string
}) {
  const dateStr = formatDate(value)
  const hasActual = !!actualValue

  return (
    <div className="flex items-center gap-2">
      <span className={hasActual ? 'line-through text-muted-foreground' : ''}>{dateStr}</span>
      {hasActual && (
        <Badge variant="default" className="text-xs">
          Done
        </Badge>
      )}
    </div>
  )
}

export function ProjectTimelineTable({
  project,
  seaContainers,
  onProjectUpdate,
  onContainerUpdate,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
}: ProjectTimelineTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Get first container for dates (single-row table)
  const firstContainer = seaContainers?.[0]

  // Derive shipment status
  const shipmentStatus = useMemo(() => {
    if (!firstContainer) return { label: 'Pending', variant: 'secondary' as const }
    return deriveShipmentStatus(
      firstContainer.etd,
      firstContainer.atd,
      firstContainer.eta,
      firstContainer.ata
    )
  }, [firstContainer])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'cargoReady',
      title: 'Cargo Ready',
      width: 120,
      type: 'date',
      renderer: (val: unknown) => (
        <DateWithStatusRenderer value={val as string | null} label="Cargo Ready" />
      ),
    },
    {
      data: 'etd',
      title: 'ETD',
      width: 110,
      type: 'date',
      renderer: (val: unknown, row: unknown) => (
        <DateWithStatusRenderer
          value={val as string | null}
          actualValue={(row as Record<string, unknown>)?.atd as string | null}
          label="ETD"
        />
      ),
    },
    {
      data: 'atd',
      title: 'ATD',
      width: 110,
      type: 'date',
    },
    {
      data: 'eta',
      title: 'ETA',
      width: 110,
      type: 'date',
      renderer: (val: unknown, row: unknown) => (
        <DateWithStatusRenderer
          value={val as string | null}
          actualValue={(row as Record<string, unknown>)?.ata as string | null}
          label="ETA"
        />
      ),
    },
    {
      data: 'ata',
      title: 'ATA',
      width: 110,
      type: 'date',
    },
    {
      data: 'status',
      title: 'Status',
      width: 100,
      readOnly: true,
      renderer: () => (
        <Badge variant={shipmentStatus.variant}>{shipmentStatus.label}</Badge>
      ),
    },
  ], [shipmentStatus])

  // Table data - single row
  const tableData = useMemo(() => [{
    id: 'timeline',
    cargoReady: project.requestedPickupDate || null,
    etd: firstContainer?.etd || null,
    atd: firstContainer?.atd || null,
    eta: firstContainer?.eta || null,
    ata: firstContainer?.ata || null,
    status: shipmentStatus.label,
  }], [project.requestedPickupDate, firstContainer, shipmentStatus])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle cargo ready date (project level)
    if (field === 'cargoReady') {
      onProjectUpdate({ requestedPickupDate: value as string || null })
      return
    }

    // Handle container dates
    if (firstContainer && ['etd', 'atd', 'eta', 'ata'].includes(field)) {
      onContainerUpdate(firstContainer.id, field, value)
      return
    }
  }, [firstContainer, onProjectUpdate, onContainerUpdate])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          handleCellChange(payload.prop, payload.newValue)

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
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-medium">Timeline</h3>
      </div>
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
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          toolbarPosition: 'bottom',
          hideFilterPopover: true,
          hideSortButton: true,
        }}
      />
    </div>
  )
}
