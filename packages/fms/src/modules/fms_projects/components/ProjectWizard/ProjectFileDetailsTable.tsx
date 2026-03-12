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
import { FMS_PROJECT_STATUSES, TRANSPORT_MODES, DIRECTIONS } from '../../data/types'

type ProjectFileDetailsTableProps = {
  project: Project
  seaContainers: ProjectSeaContainer[]
  onUpdate: (updates: Partial<Project>) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

// Status options for dropdown
const PROJECT_STATUS_OPTIONS = FMS_PROJECT_STATUSES.map(status => ({
  value: status,
  label: status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
}))

// Direction options for dropdown
const DIRECTION_OPTIONS = [
  { value: '', label: 'Select' },
  ...DIRECTIONS.map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) })),
]

// Incoterm options for dropdown
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

export function ProjectFileDetailsTable({
  project,
  seaContainers,
  onUpdate,
  tableRef: externalRef,
  autoSelectOnFocus = false,
  siblingTableRefs,
}: ProjectFileDetailsTableProps) {
  const internalRef = useRef<HTMLDivElement>(null)
  const tableRef = externalRef ?? internalRef

  // User (operator/sales) editor config
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 2,
  }), [])

  // Contractor (client) editor config
  const contractorEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
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
      title: 'File Number',
      width: 180,
      type: 'text',
    },
    {
      data: 'client',
      title: 'Client',
      width: 160,
      renderer: (val: unknown) => jsonRenderer(val, 'Select client...'),
      editor: createEntitySearchEditor(contractorEditorConfig),
    },
    {
      data: 'modes',
      title: 'Mode',
      width: 120,
      type: 'multiselect',
      source: TRANSPORT_MODES as unknown as string[],
      renderer: (val: unknown) => {
        const modes = Array.isArray(val) ? val : []
        if (modes.length === 0) {
          return <span className="text-gray-400">Select mode...</span>
        }
        return <span className="truncate">{modes.map(m => m.toUpperCase()).join(', ')}</span>
      },
    },
    {
      data: 'direction',
      title: 'Direction',
      width: 100,
      type: 'dropdown',
      source: DIRECTION_OPTIONS.map(o => o.label),
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
      data: 'incoterms',
      title: 'Incoterms',
      width: 100,
      type: 'dropdown',
      source: INCOTERM_OPTIONS.map(o => o.label),
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
  ], [jsonRenderer, userEditorConfig, contractorEditorConfig])

  const tableData = useMemo(() => [{
    id: project.id,
    fileNumber: project.projectNumber || project.id.slice(0, 8),
    client: project.clientId && project.clientName
      ? JSON.stringify({ id: project.clientId, name: project.clientName })
      : '',
    modes: project.transportModes || [],
    direction: DIRECTION_OPTIONS.find(o => o.value === project.direction)?.label || 'Select',
    bookingNumber: project.bookingNumber || '',
    containerSummary,
    incoterms: INCOTERM_OPTIONS.find(o => o.value === project.incoterm)?.label || 'Select',
    status: PROJECT_STATUS_OPTIONS.find(o => o.value === project.status)?.label || 'Draft',
    operator: project.operatorId && project.operatorName
      ? JSON.stringify({ id: project.operatorId, name: project.operatorName })
      : '',
    sales: project.salesPersonId && project.salesPersonName
      ? JSON.stringify({ id: project.salesPersonId, name: project.salesPersonName })
      : '',
  }], [project, containerSummary])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle modes multiselect
    if (field === 'modes') {
      const modes = Array.isArray(value) ? value : []
      onUpdate({ transportModes: modes.length > 0 ? modes : null })
      return
    }

    // Handle client selection
    if (field === 'client') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onUpdate({ clientId: parsed.id, clientName: parsed.name || '' })
          return
        }
      } catch {
        // Not JSON
      }
      onUpdate({ clientId: null, clientName: null })
      return
    }

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

    // Handle direction dropdown
    if (field === 'direction') {
      const option = DIRECTION_OPTIONS.find(o => o.label === value)
      onUpdate({ direction: option?.value || undefined })
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

    // Handle incoterms dropdown
    if (field === 'incoterms') {
      const option = INCOTERM_OPTIONS.find(o => o.label === value)
      onUpdate({ incoterm: option?.value || null })
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

  const fileNumber = project.projectNumber || project.id.slice(0, 8)

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-1.5 border-b">
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
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
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
