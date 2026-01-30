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
import type { Project, ProjectSeaContainer, TransportModeType } from './hooks/useProjectWizard'

type ProjectHeaderTableProps = {
  project: Project
  seaContainers: ProjectSeaContainer[]
  onUpdate: (updates: Partial<Project>) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
  projectNumber?: string
}

const INCOTERM_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'EXW', label: 'EXW' },
  { value: 'FCA', label: 'FCA' },
  { value: 'CPT', label: 'CPT' },
  { value: 'CIP', label: 'CIP' },
  { value: 'DAP', label: 'DAP' },
  { value: 'DPU', label: 'DPU' },
  { value: 'DDP', label: 'DDP' },
  { value: 'FAS', label: 'FAS' },
  { value: 'FOB', label: 'FOB' },
  { value: 'CFR', label: 'CFR' },
  { value: 'CIF', label: 'CIF' },
]

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


export function ProjectHeaderTable({
  project,
  seaContainers,
  onUpdate,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
  projectNumber,
}: ProjectHeaderTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // User (operator/sales) editor config
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 2,
  }), [])

  // Location editor config
  const locationEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '', locode: r.presenter?.subtitle || '' }),
    placeholder: 'Search locations...',
    minQueryLength: 2,
  }), [])

  // Contractor editor config
  const contractorEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search contractors...',
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

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'fileNumber',
      title: 'File #',
      width: 110,
      readOnly: true,
    },
    {
      data: 'bookingNumber',
      title: 'Booking #',
      width: 100,
      type: 'text',
    },
    {
      data: 'projectDate',
      title: 'Date',
      width: 90,
      type: 'date',
      readOnly: true,
    },
    {
      data: 'operator',
      title: 'Operator',
      width: 120,
      renderer: (val: unknown) => jsonRenderer(val, 'Select operator...'),
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'sales',
      title: 'Sales',
      width: 120,
      renderer: (val: unknown) => jsonRenderer(val, 'Select sales...'),
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'containerSummary',
      title: 'Containers',
      width: 110,
      readOnly: true,
    },
    {
      data: 'originPort',
      title: 'Origin',
      width: 130,
      renderer: (val: unknown) => jsonRenderer(val, 'Select origin...'),
      editor: createEntitySearchEditor(locationEditorConfig),
    },
    {
      data: 'destinationPort',
      title: 'Destination',
      width: 130,
      renderer: (val: unknown) => jsonRenderer(val, 'Select dest...'),
      editor: createEntitySearchEditor(locationEditorConfig),
    },
    {
      data: 'carrier',
      title: 'Carrier',
      width: 120,
      renderer: (val: unknown) => jsonRenderer(val, 'Select carrier...'),
      editor: createEntitySearchEditor(contractorEditorConfig),
    },
    {
      data: 'incoterm',
      title: 'Incoterm',
      width: 80,
      type: 'dropdown',
      source: INCOTERM_OPTIONS.map(o => o.label),
    },
  ], [jsonRenderer, userEditorConfig, locationEditorConfig, contractorEditorConfig])

  // Get first container's carrier info as default
  const firstContainer = seaContainers?.[0]

  const tableData = useMemo(() => [{
    id: project.id,
    fileNumber: project.projectNumber || project.id.slice(0, 8),
    bookingNumber: project.bookingNumber || '',
    projectDate: project.projectDate ? new Date(project.projectDate).toLocaleDateString() : '',
    operator: project.operatorId && project.operatorName
      ? JSON.stringify({ id: project.operatorId, name: project.operatorName })
      : '',
    sales: project.salesPersonId && project.salesPersonName
      ? JSON.stringify({ id: project.salesPersonId, name: project.salesPersonName })
      : '',
    containerSummary,
    originPort: project.originLocationId && project.originAddress
      ? JSON.stringify({ id: project.originLocationId, name: project.originAddress })
      : project.originAddress || '',
    destinationPort: project.destinationLocationId && project.destinationAddress
      ? JSON.stringify({ id: project.destinationLocationId, name: project.destinationAddress })
      : project.destinationAddress || '',
    carrier: firstContainer?.vesselName
      ? JSON.stringify({ name: firstContainer.vesselName })
      : '',
    incoterm: INCOTERM_OPTIONS.find(o => o.value === project.incoterm)?.label || 'Select',
  }], [project, containerSummary, firstContainer])

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

    // Handle origin port selection
    if (field === 'originPort') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onUpdate({
            originLocationId: parsed.id,
            originAddress: parsed.name || '',
          })
          return
        }
      } catch {
        // Not JSON
      }
      onUpdate({ originLocationId: null, originAddress: strValue || null })
      return
    }

    // Handle destination port selection
    if (field === 'destinationPort') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onUpdate({
            destinationLocationId: parsed.id,
            destinationAddress: parsed.name || '',
          })
          return
        }
      } catch {
        // Not JSON
      }
      onUpdate({ destinationLocationId: null, destinationAddress: strValue || null })
      return
    }

    // Handle incoterm dropdown
    if (field === 'incoterm') {
      const option = INCOTERM_OPTIONS.find(o => o.label === value)
      onUpdate({ incoterm: option?.value || null })
      return
    }

    // Handle booking number
    if (field === 'bookingNumber') {
      onUpdate({ bookingNumber: value as string || null })
      return
    }

    // Carrier is read from container - ignore for now
    // Revenue/costs/margin are computed - ignore
  }, [onUpdate])

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

  const tableName = projectNumber ? `Project ${projectNumber}` : 'Project Overview'

  return (
    <div className="border rounded-lg">
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName={tableName}
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
          hideFilterPopover: true,
          hideSortButton: true,
        }}
      />
    </div>
  )
}
