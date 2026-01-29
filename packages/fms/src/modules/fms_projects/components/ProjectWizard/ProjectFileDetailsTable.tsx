'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import type { Project, ProjectSeaContainer } from './hooks/useProjectWizard'
import { FMS_PROJECT_STATUSES } from '../../data/types'

type ProjectFileDetailsTableProps = {
  project: Project
  seaContainers: ProjectSeaContainer[]
  onUpdate: (updates: Partial<Project>) => void
  onContainerUpdate?: (containerId: string, field: string, value: unknown) => void
}

// Status options for dropdown
const PROJECT_STATUS_OPTIONS = FMS_PROJECT_STATUSES.map(status => ({
  value: status,
  label: status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
}))

// Aggregate container types for summary (e.g., "2x 40'HC, 1x 20'GP")
function aggregateContainerSummary(seaContainers: ProjectSeaContainer[]): string {
  if (!seaContainers || seaContainers.length === 0) return '-'

  const counts: Record<string, number> = {}
  seaContainers.forEach((c) => {
    const type = c.containerType || '40HC'
    counts[type] = (counts[type] || 0) + 1
  })

  return Object.entries(counts)
    .map(([type, count]) => `${count}x ${type}`)
    .join(', ')
}

// Get earliest ETD and latest ETA from containers
function getContainerDates(seaContainers: ProjectSeaContainer[]): { etd: string | null; eta: string | null } {
  if (!seaContainers || seaContainers.length === 0) {
    return { etd: null, eta: null }
  }

  const etds = seaContainers
    .filter(c => c.etd)
    .map(c => new Date(c.etd!))
    .sort((a, b) => a.getTime() - b.getTime())

  const etas = seaContainers
    .filter(c => c.eta)
    .map(c => new Date(c.eta!))
    .sort((a, b) => b.getTime() - a.getTime())

  return {
    etd: etds.length > 0 ? etds[0].toISOString().split('T')[0] : null,
    eta: etas.length > 0 ? etas[0].toISOString().split('T')[0] : null,
  }
}

export function ProjectFileDetailsTable({
  project,
  seaContainers,
  onUpdate,
  onContainerUpdate,
}: ProjectFileDetailsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // User (operator/sales) editor config
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 2,
  }), [])

  // JSON renderer helper
  const jsonRenderer = useCallback((value: unknown, placeholder: string) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-gray-400">{placeholder}</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        return <span className="truncate">{parsed.name}</span>
      }
    } catch {
      // Not JSON
    }
    return <span className="truncate">{strValue}</span>
  }, [])

  const containerSummary = useMemo(() => aggregateContainerSummary(seaContainers), [seaContainers])
  const containerDates = useMemo(() => getContainerDates(seaContainers), [seaContainers])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'fileNumber',
      title: 'File Number',
      width: 180,
      type: 'text',
    },
    {
      data: 'bookingNumber',
      title: 'Booking Number',
      width: 140,
      type: 'text',
    },
    {
      data: 'containerSummary',
      title: 'Containers',
      width: 130,
      readOnly: true,
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
    {
      data: 'status',
      title: 'Status',
      width: 120,
      type: 'dropdown',
      source: PROJECT_STATUS_OPTIONS.map(o => o.label),
    },
    {
      data: 'operator',
      title: 'Operator',
      width: 140,
      renderer: (val: unknown) => jsonRenderer(val, 'Select operator...'),
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'sales',
      title: 'Sales',
      width: 140,
      renderer: (val: unknown) => jsonRenderer(val, 'Select sales...'),
      editor: createEntitySearchEditor(userEditorConfig),
    },
  ], [jsonRenderer, userEditorConfig])

  const tableData = useMemo(() => [{
    id: project.id,
    fileNumber: project.projectNumber || project.id.slice(0, 8),
    bookingNumber: project.bookingNumber || '',
    containerSummary,
    etd: containerDates.etd || '',
    eta: containerDates.eta || '',
    status: PROJECT_STATUS_OPTIONS.find(o => o.value === project.status)?.label || 'Draft',
    operator: project.operatorId && project.operatorName
      ? JSON.stringify({ id: project.operatorId, name: project.operatorName })
      : '',
    sales: project.salesPersonId && project.salesPersonName
      ? JSON.stringify({ id: project.salesPersonId, name: project.salesPersonName })
      : '',
  }], [project, containerSummary, containerDates])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle operator selection
    if (field === 'operator') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onUpdate({ operatorId: parsed.id, operatorName: parsed.name || '' })
          return
        }
      } catch {
        // Not JSON
      }
      onUpdate({ operatorId: null, operatorName: strValue || null })
      return
    }

    // Handle sales selection
    if (field === 'sales') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onUpdate({ salesPersonId: parsed.id, salesPersonName: parsed.name || '' })
          return
        }
      } catch {
        // Not JSON
      }
      onUpdate({ salesPersonId: null, salesPersonName: strValue || null })
      return
    }

    // Handle status dropdown
    if (field === 'status') {
      const option = PROJECT_STATUS_OPTIONS.find(o => o.label === value)
      if (option) {
        onUpdate({ status: option.value })
      }
      return
    }

    // Handle booking number
    if (field === 'bookingNumber') {
      onUpdate({ bookingNumber: value as string || null })
      return
    }

    // Handle file number
    if (field === 'fileNumber') {
      onUpdate({ projectNumber: value as string || null })
      return
    }

    // Handle ETD - update first container
    if (field === 'etd') {
      const firstContainer = seaContainers[0]
      if (firstContainer && onContainerUpdate) {
        onContainerUpdate(firstContainer.id, 'etd', value || null)
      }
      return
    }

    // Handle ETA - update first container
    if (field === 'eta') {
      const firstContainer = seaContainers[0]
      if (firstContainer && onContainerUpdate) {
        onContainerUpdate(firstContainer.id, 'eta', value || null)
      }
      return
    }
  }, [onUpdate, onContainerUpdate, seaContainers])

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

  const fileNumber = project.projectNumber || project.id.slice(0, 8)

  return (
    <div className="border rounded-lg">
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-medium">{fileNumber}</h3>
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
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
