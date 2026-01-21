'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
import { Loader2, Check, AlertCircle } from 'lucide-react'
import type { Project, TransportModeType } from './hooks/useProjectWizard'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type ProjectWizardHeaderProps = {
  project: Project
  onChange: (updates: Partial<Project>) => void
  mode?: 'new' | 'edit'
  selectedTransportModes: TransportModeType[]
  onTransportModesChange: (modes: TransportModeType[]) => void
  projectNumber?: string
  status?: string
  saveStatus?: SaveStatus
}

const SHIPMENT_TYPE_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'EXP', label: 'Export Sea' },
  { value: 'IMP', label: 'Import Sea' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'FTL', label: 'Full Truck' },
  { value: 'LTL', label: 'Less Truck' },
  { value: 'AIR', label: 'Air' },
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

const TRANSPORT_MODE_OPTIONS: { value: TransportModeType; label: string }[] = [
  { value: 'ship', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'ftl', label: 'FTL' },
  { value: 'ltl', label: 'LTL' },
  { value: 'train', label: 'Rail' },
  { value: 'barge', label: 'Barge' },
]

// Derive shipment type from transport modes and direction
type DirectionType = 'export' | 'import' | 'domestic'
type ShipmentTypeValue = 'EXP' | 'IMP' | 'RAIL' | 'FTL' | 'LTL' | 'AIR' | 'DEPOT'

function deriveShipmentType(
  modes: TransportModeType[],
  direction: DirectionType | null
): ShipmentTypeValue | null {
  if (modes.length === 0) return null

  const primaryMode = modes[0]

  // Sea/Barge: use direction
  if (primaryMode === 'ship' || primaryMode === 'barge') {
    if (direction === 'export') return 'EXP'
    if (direction === 'import') return 'IMP'
    return 'EXP' // default for domestic
  }

  // Direct mode-to-type mappings
  if (primaryMode === 'train') return 'RAIL'
  if (primaryMode === 'ftl') return 'FTL'
  if (primaryMode === 'ltl') return 'LTL'
  if (primaryMode === 'air') return 'AIR'

  return null
}

// Multi-select dropdown editor for transport modes
const TransportModeEditor = ({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: TransportModeType[]
  onChange: (val: TransportModeType[]) => void
  onSave: (val: TransportModeType[], clearEditing?: boolean) => void
  onCancel: () => void
}) => {
  const [selectedModes, setSelectedModes] = useState<TransportModeType[]>(
    Array.isArray(value) ? value : []
  )
  const [showDropdown, setShowDropdown] = useState(true)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const cellRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
      setPosition({
        top: rect.bottom + scrollTop + 2,
        left: rect.left + scrollLeft,
        width: Math.max(rect.width, 160),
      })
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isOutsideCell = cellRef.current && !cellRef.current.contains(e.target as Node)
      const isOutsideDropdown = !dropdownRef.current || !dropdownRef.current.contains(e.target as Node)

      if (isOutsideCell && isOutsideDropdown) {
        setShowDropdown(false)
        onSave(selectedModes, true)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onSave, selectedModes])

  const handleToggle = (optionValue: TransportModeType) => {
    const newModes = selectedModes.includes(optionValue)
      ? selectedModes.filter((m) => m !== optionValue)
      : [...selectedModes, optionValue]
    setSelectedModes(newModes)
    onChange(newModes)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      setShowDropdown(false)
      onSave(selectedModes, false)
    } else if (e.key === 'Tab') {
      setShowDropdown(false)
      onSave(selectedModes, false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowDropdown(false)
      onCancel()
    }
  }

  const selectedLabels = TRANSPORT_MODE_OPTIONS
    .filter((opt) => selectedModes.includes(opt.value))
    .map((opt) => opt.label)
    .join(', ')

  return (
    <>
      <div
        ref={cellRef}
        className="hot-cell-editor flex items-center min-h-[28px] px-1 cursor-pointer"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <span className="truncate text-sm">
          {selectedLabels || 'Select modes...'}
        </span>
      </div>

      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-md shadow-lg"
          style={{
            position: 'absolute',
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            maxHeight: '250px',
            overflowY: 'auto',
            zIndex: 10000,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {TRANSPORT_MODE_OPTIONS.map((option) => {
            const isSelected = selectedModes.includes(option.value)
            return (
              <div
                key={option.value}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                  isSelected ? 'bg-blue-50' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleToggle(option.value)
                }}
              >
                <div
                  className={`w-4 h-4 border rounded flex items-center justify-center ${
                    isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm">{option.label}</span>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}

export function ProjectWizardHeader({
  project,
  onChange,
  selectedTransportModes,
  onTransportModesChange,
  projectNumber,
  status,
  saveStatus,
}: ProjectWizardHeaderProps) {
  const tableRef = useRef<HTMLDivElement>(null)

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

  // Port (location) editor config for Origin
  const originPortEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '', locode: r.presenter?.subtitle || '' }),
    placeholder: 'Search ports...',
    minQueryLength: 2,
  }), [])

  // Port (location) editor config for Destination
  const destinationPortEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '', locode: r.presenter?.subtitle || '' }),
    placeholder: 'Search ports...',
    minQueryLength: 2,
  }), [])

  // Port renderer (shared for Origin and Destination)
  const portRenderer = useCallback((value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-gray-400">Select port...</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        // Show name with locode if available
        const display = parsed.locode ? `${parsed.name} (${parsed.locode})` : parsed.name
        return <span className="truncate">{display}</span>
      }
    } catch {
      // Not JSON - show as plain text
    }
    return <span className="truncate">{strValue}</span>
  }, [])

  // Transport modes renderer - shows badges for selected modes
  const transportModesRenderer = useCallback(() => {
    if (selectedTransportModes.length === 0) {
      return <span className="text-gray-400">Select modes...</span>
    }
    const labels = TRANSPORT_MODE_OPTIONS
      .filter((opt) => selectedTransportModes.includes(opt.value))
      .map((opt) => opt.label)
      .join(', ')
    return <span className="truncate">{labels}</span>
  }, [selectedTransportModes])

  // Transport modes editor function for DynamicTable
  const transportModesEditor = useCallback(
    (
      value: unknown,
      onChangeEditor: (val: unknown) => void,
      onSave: (val: unknown, clearEditing?: boolean) => void,
      onCancel: () => void
    ) => {
      const modes = Array.isArray(value) ? value : selectedTransportModes
      return (
        <TransportModeEditor
          value={modes as TransportModeType[]}
          onChange={(newModes) => onChangeEditor(newModes)}
          onSave={(newModes, clearEditing) => {
            onTransportModesChange(newModes)
            // Auto-derive shipment type when modes change
            const derivedShipmentType = deriveShipmentType(newModes, project.direction as DirectionType | null)
            if (derivedShipmentType) {
              onChange({ shipmentType: derivedShipmentType })
            }
            onSave(newModes, clearEditing)
          }}
          onCancel={onCancel}
        />
      )
    },
    [selectedTransportModes, onTransportModesChange, project.direction, onChange]
  )

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
      readOnly: true, // Auto-derived from transport mode + direction
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
      data: 'transportModes',
      title: 'Modes',
      width: 140,
      renderer: transportModesRenderer,
      editor: transportModesEditor,
    },
    {
      data: 'originPort',
      title: 'Origin',
      width: 160,
      renderer: portRenderer,
      editor: createEntitySearchEditor(originPortEditorConfig),
    },
    {
      data: 'destinationPort',
      title: 'Destination',
      width: 160,
      renderer: portRenderer,
      editor: createEntitySearchEditor(destinationPortEditorConfig),
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
    {
      data: 'transportUnitCount',
      title: 'Units',
      width: 70,
      type: 'numeric',
    },
  ], [clientEditorConfig, clientRenderer, transportModesRenderer, transportModesEditor, originPortEditorConfig, destinationPortEditorConfig, portRenderer])

  const tableData = useMemo(() => [{
    id: project.id,
    clientId: project.clientId || null,
    clientName: project.clientName ? JSON.stringify({ id: project.clientId, name: project.clientName }) : '',
    shipmentType: SHIPMENT_TYPE_OPTIONS.find(o => o.value === project.shipmentType)?.label || 'Select',
    cargoType: CARGO_TYPE_OPTIONS.find(o => o.value === project.cargoType)?.label || 'Select',
    direction: DIRECTION_OPTIONS.find(o => o.value === project.direction)?.label || 'Select',
    transportModes: selectedTransportModes,
    originPort: project.originLocationId && project.originAddress
      ? JSON.stringify({ id: project.originLocationId, name: project.originAddress })
      : project.originAddress || '',
    destinationPort: project.destinationLocationId && project.destinationAddress
      ? JSON.stringify({ id: project.destinationLocationId, name: project.destinationAddress })
      : project.destinationAddress || '',
    incoterm: INCOTERM_OPTIONS.find(o => o.value === project.incoterm)?.label || 'Select',
    currencyCode: project.currencyCode || 'PLN',
    transportUnitCount: project.transportUnitCount ?? null,
  }], [project, selectedTransportModes])

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

    // Handle origin port selection
    if (field === 'originPort') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onChange({
            originLocationId: parsed.id,
            originAddress: parsed.name || '',
          })
          return
        }
      } catch {
        // Not JSON - treat as plain text address
      }
      onChange({ originLocationId: null, originAddress: strValue || null })
      return
    }

    // Handle destination port selection
    if (field === 'destinationPort') {
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onChange({
            destinationLocationId: parsed.id,
            destinationAddress: parsed.name || '',
          })
          return
        }
      } catch {
        // Not JSON - treat as plain text address
      }
      onChange({ destinationLocationId: null, destinationAddress: strValue || null })
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
      const directionValue = option?.value || null
      finalValue = directionValue
      // Auto-derive shipment type when direction changes
      if (directionValue && selectedTransportModes.length > 0) {
        const derivedShipmentType = deriveShipmentType(selectedTransportModes, directionValue as DirectionType)
        if (derivedShipmentType) {
          onChange({ direction: directionValue, shipmentType: derivedShipmentType })
          return
        }
      }
    } else if (field === 'incoterm') {
      const option = INCOTERM_OPTIONS.find(o => o.label === value)
      finalValue = option?.value || null
    } else if (field === 'transportUnitCount') {
      // Handle numeric value for transport unit count
      const numValue = value === null || value === '' ? null : Number(value)
      finalValue = numValue !== null && !isNaN(numValue) ? numValue : null
    }

    onChange({ [field]: finalValue })
  }, [onChange, selectedTransportModes])

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

  // Top bar start content - project number and status
  const topBarStartContent = projectNumber ? (
    <div className="flex items-center gap-2">
      <span className="font-semibold">Project {projectNumber}</span>
      {status && (
        <Badge variant={status === 'draft' ? 'secondary' : 'default'}>
          {status.toUpperCase()}
        </Badge>
      )}
    </div>
  ) : null

  // Top bar end content - save status
  const topBarEndContent = saveStatus ? (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      {saveStatus === 'saving' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Saving...</span>
        </>
      )}
      {saveStatus === 'saved' && (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-green-600">Saved</span>
        </>
      )}
      {saveStatus === 'error' && (
        <>
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-red-600">Error</span>
        </>
      )}
    </div>
  ) : null

  return (
    <div className="border-b">
      {/* Project details table */}
      <div className="px-4 py-2">
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
            hideSearch: true,
            hideAddRowButton: true,
            hideActionsColumn: true,
            toolbarPosition: 'bottom',
            hideFilterPopover: true,
            hideSortButton: true,
            topBarStart: topBarStartContent,
            topBarEnd: topBarEndContent,
          }}
        />
      </div>
    </div>
  )
}
