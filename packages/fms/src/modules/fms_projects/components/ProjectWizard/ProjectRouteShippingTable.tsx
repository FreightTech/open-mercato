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
import type { Project } from './hooks/useProjectWizard'

type ProjectRouteShippingTableProps = {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
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

export function ProjectRouteShippingTable({
  project,
  onUpdate,
}: ProjectRouteShippingTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Location editor config
  const locationEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '', locode: r.presenter?.subtitle || '' }),
    placeholder: 'Search locations...',
    minQueryLength: 2,
  }), [])

  // Carrier editor config (using fms_products:fms_carrier)
  const carrierEditorConfig = useMemo(() => ({
    entityType: 'fms_products:fms_carrier',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search carriers...',
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

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'origin',
      title: 'Origin',
      width: 180,
      renderer: (val: unknown) => jsonRenderer(val, 'Select origin...'),
      editor: createEntitySearchEditor(locationEditorConfig),
    },
    {
      data: 'destination',
      title: 'Destination',
      width: 180,
      renderer: (val: unknown) => jsonRenderer(val, 'Select destination...'),
      editor: createEntitySearchEditor(locationEditorConfig),
    },
    {
      data: 'carrier',
      title: 'Carrier',
      width: 160,
      renderer: (val: unknown) => jsonRenderer(val, 'Select carrier...'),
      editor: createEntitySearchEditor(carrierEditorConfig),
    },
    {
      data: 'incoterms',
      title: 'Incoterms',
      width: 100,
      type: 'dropdown',
      source: INCOTERM_OPTIONS.map(o => o.label),
    },
  ], [jsonRenderer, locationEditorConfig, carrierEditorConfig])

  const tableData = useMemo(() => [{
    id: project.id,
    origin: project.originLocationId && project.originAddress
      ? JSON.stringify({ id: project.originLocationId, name: project.originAddress })
      : project.originAddress || '',
    destination: project.destinationLocationId && project.destinationAddress
      ? JSON.stringify({ id: project.destinationLocationId, name: project.destinationAddress })
      : project.destinationAddress || '',
    // Note: carrier is typically at leg level, but we store at project level for display
    carrier: '',
    incoterms: INCOTERM_OPTIONS.find(o => o.value === project.incoterm)?.label || 'Select',
  }], [project])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle origin selection
    if (field === 'origin') {
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

    // Handle destination selection
    if (field === 'destination') {
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

    // Handle carrier selection
    // Note: This would need to update the project's carrier reference
    // For now, we log it - in production, you'd add carrierId/carrierName to the Project type
    if (field === 'carrier') {
      const strValue = String(value || '')
      console.log('Carrier selection:', strValue)
      // TODO: Add carrierId/carrierName to project entity if needed
      return
    }

    // Handle incoterm dropdown
    if (field === 'incoterms') {
      const option = INCOTERM_OPTIONS.find(o => o.label === value)
      onUpdate({ incoterm: option?.value || null })
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

  return (
    <div className="border rounded-lg">
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-medium">Route & Shipping</h3>
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
