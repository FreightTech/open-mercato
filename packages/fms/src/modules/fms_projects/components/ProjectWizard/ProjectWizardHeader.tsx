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
import { Badge } from '@open-mercato/ui/primitives/badge'
import { cn } from '@open-mercato/shared/lib/utils'
import type { Project, TransportModeType } from './hooks/useProjectWizard'

type ProjectWizardHeaderProps = {
  project: Project
  onChange: (updates: Partial<Project>) => void
  mode?: 'new' | 'edit'
  selectedTransportModes: TransportModeType[]
  onTransportModesChange: (modes: TransportModeType[]) => void
}

const SHIPMENT_TYPE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'EXP', label: 'Export Sea' },
  { value: 'IMP', label: 'Import Sea' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'FTL', label: 'Full Truck' },
  { value: 'LTL', label: 'Less Truck' },
  { value: 'DEPOT', label: 'Depot' },
]

const CARGO_TYPE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'fcl', label: 'FCL' },
  { value: 'lcl', label: 'LCL' },
]

const DIRECTION_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'export', label: 'Export' },
  { value: 'import', label: 'Import' },
  { value: 'domestic', label: 'Domestic' },
]

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

const CURRENCY_OPTIONS = [
  { value: 'PLN', label: 'PLN' },
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
]

const TRANSPORT_MODE_OPTIONS: { value: TransportModeType; label: string; icon: string }[] = [
  { value: 'sea', label: 'Sea', icon: '🚢' },
  { value: 'air', label: 'Air', icon: '✈️' },
  { value: 'road', label: 'Road', icon: '🚛' },
]

export function ProjectWizardHeader({ project, onChange, selectedTransportModes, onTransportModesChange }: ProjectWizardHeaderProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Toggle a transport mode
  const toggleTransportMode = useCallback((mode: TransportModeType) => {
    if (selectedTransportModes.includes(mode)) {
      onTransportModesChange(selectedTransportModes.filter(m => m !== mode))
    } else {
      onTransportModesChange([...selectedTransportModes, mode])
    }
  }, [selectedTransportModes, onTransportModesChange])

  // Client (contractor) single-select editor config
  const clientEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
    minQueryLength: 2,
  }), [])

  // Client renderer
  const clientRenderer = useCallback((value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-gray-400">Select client...</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        return <span>{parsed.name}</span>
      }
    } catch {
      // Not JSON
    }
    return <span>{strValue}</span>
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'clientName',
      title: 'Client',
      width: 180,
      renderer: clientRenderer,
      editor: createEntitySearchEditor(clientEditorConfig),
    },
    {
      data: 'shipmentType',
      title: 'Shipment',
      width: 110,
      type: 'dropdown',
      source: SHIPMENT_TYPE_OPTIONS.map(o => o.label),
    },
    {
      data: 'cargoType',
      title: 'Cargo',
      width: 70,
      type: 'dropdown',
      source: CARGO_TYPE_OPTIONS.map(o => o.label),
    },
    {
      data: 'direction',
      title: 'Direction',
      width: 90,
      type: 'dropdown',
      source: DIRECTION_OPTIONS.map(o => o.label),
    },
    {
      data: 'originAddress',
      title: 'Origin',
      width: 160,
      type: 'text',
    },
    {
      data: 'destinationAddress',
      title: 'Destination',
      width: 160,
      type: 'text',
    },
    {
      data: 'incoterm',
      title: 'Incoterm',
      width: 80,
      type: 'dropdown',
      source: INCOTERM_OPTIONS.map(o => o.label),
    },
    {
      data: 'currencyCode',
      title: 'Ccy',
      width: 60,
      type: 'dropdown',
      source: CURRENCY_OPTIONS.map(o => o.label),
    },
  ], [clientEditorConfig, clientRenderer])

  const tableData = useMemo(() => [{
    id: project.id,
    clientId: project.clientId || null,
    clientName: project.clientName || '',
    shipmentType: SHIPMENT_TYPE_OPTIONS.find(o => o.value === project.shipmentType)?.label || 'Select',
    cargoType: CARGO_TYPE_OPTIONS.find(o => o.value === project.cargoType)?.label || 'Select',
    direction: DIRECTION_OPTIONS.find(o => o.value === project.direction)?.label || 'Select',
    originAddress: project.originAddress || '',
    destinationAddress: project.destinationAddress || '',
    incoterm: INCOTERM_OPTIONS.find(o => o.value === project.incoterm)?.label || 'Select',
    currencyCode: project.currencyCode || 'PLN',
  }], [project])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle client selection
    if (field === 'clientName') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onChange({ clientId: parsed.id, clientName: parsed.name || '' })
          return
        }
      } catch {
        // Not JSON
      }
      onChange({ clientId: null, clientName: strValue || null })
      return
    }

    let finalValue = value

    // Handle dropdown conversions
    if (field === 'shipmentType') {
      const option = SHIPMENT_TYPE_OPTIONS.find(o => o.label === value)
      finalValue = option?.value || null
    } else if (field === 'cargoType') {
      const option = CARGO_TYPE_OPTIONS.find(o => o.label === value)
      finalValue = option?.value || null
    } else if (field === 'direction') {
      const option = DIRECTION_OPTIONS.find(o => o.label === value)
      finalValue = option?.value || null
    } else if (field === 'incoterm') {
      const option = INCOTERM_OPTIONS.find(o => o.label === value)
      finalValue = option?.value || null
    }

    onChange({ [field]: finalValue })
  }, [onChange])

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
    <div className="border-b">
      {/* Project details table */}
      <div className="px-4 py-2" style={{ height: 90 }}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Project Details"
          idColumnName="id"
          width="100%"
          height="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          uiConfig={{
            hideToolbar: true,
            hideSearch: true,
            hideFilterButton: true,
            hideAddRowButton: true,
            hideBottomBar: true,
            hideActionsColumn: true,
          }}
        />
      </div>

      {/* Transport mode multi-select */}
      <div className="px-4 py-2 border-t flex items-center gap-2">
        <span className="text-sm text-muted-foreground mr-2">Transport Modes:</span>
        {TRANSPORT_MODE_OPTIONS.map((option) => {
          const isSelected = selectedTransportModes.includes(option.value)
          return (
            <Badge
              key={option.value}
              variant={isSelected ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer select-none transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'hover:bg-muted'
              )}
              onClick={() => toggleTransportMode(option.value)}
            >
              <span className="mr-1">{option.icon}</span>
              {option.label}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
