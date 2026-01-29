'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createMultiSelectEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
  MultiSelectSelectedItem,
} from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Check } from 'lucide-react'
import type { Quote, PortRef, QuoteWizardMode, FmsTransportMode } from './types/quote-wizard'
import { useQuoteWizardContext } from './hooks/useQuoteWizardContext'
import {
  useQuoteTableData,
  parseClientValue,
  parseAssignedToValue,
  parsePortValue,
  labelToDirection,
  DIRECTION_OPTIONS,
  CURRENCY_OPTIONS,
} from './hooks/useQuoteTableData'

// Transport mode options
const TRANSPORT_MODES: { value: FmsTransportMode; label: string }[] = [
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'road', label: 'Road' },
  { value: 'rail', label: 'Rail' },
  { value: 'barge', label: 'Barge' },
]

// Multi-select dropdown editor for transport modes
const ModesMultiSelectEditor = ({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: FmsTransportMode[]
  onChange: (val: FmsTransportMode[]) => void
  onSave: (val: FmsTransportMode[], clearEditing?: boolean) => void
  onCancel: () => void
}) => {
  const [selectedModes, setSelectedModes] = useState<FmsTransportMode[]>(
    Array.isArray(value) ? value : []
  )
  const [showDropdown, setShowDropdown] = useState(true)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const [highlightedIndex, setHighlightedIndex] = useState(0)
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
      cellRef.current.focus()
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

  useEffect(() => {
    if (dropdownRef.current && showDropdown) {
      const highlighted = dropdownRef.current.children[highlightedIndex] as HTMLElement | undefined
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, showDropdown])

  const handleToggle = (modeValue: FmsTransportMode) => {
    const newModes = selectedModes.includes(modeValue)
      ? selectedModes.filter((m) => m !== modeValue)
      : [...selectedModes, modeValue]
    setSelectedModes(newModes)
    onChange(newModes)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) =>
        prev < TRANSPORT_MODES.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showDropdown && TRANSPORT_MODES.length > 0 && highlightedIndex < TRANSPORT_MODES.length) {
        e.stopPropagation()
        handleToggle(TRANSPORT_MODES[highlightedIndex].value)
      } else {
        setShowDropdown(false)
        onSave(selectedModes, false)
      }
    } else if (e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      if (showDropdown && TRANSPORT_MODES.length > 0 && highlightedIndex < TRANSPORT_MODES.length) {
        handleToggle(TRANSPORT_MODES[highlightedIndex].value)
      }
    } else if (e.key === 'Tab') {
      setShowDropdown(false)
      onSave(selectedModes, false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setShowDropdown(false)
      onCancel()
    }
  }

  const selectedLabels = TRANSPORT_MODES
    .filter((m) => selectedModes.includes(m.value))
    .map((m) => m.label)
    .join(', ')

  return (
    <>
      <div
        ref={cellRef}
        className="hot-cell-editor flex items-center min-h-[28px] px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <span className="truncate text-sm">
          {selectedLabels || 'Select modes...'}
        </span>
      </div>

      {showDropdown && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="bg-popover border border-border rounded-md shadow-lg text-popover-foreground"
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
          {TRANSPORT_MODES.map((option, index) => {
            const isSelected = selectedModes.includes(option.value)
            const isHighlighted = index === highlightedIndex
            return (
              <div
                key={option.value}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm ${
                  isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                } ${isSelected ? 'bg-accent/50' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleToggle(option.value)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}

type QuoteWizardHeaderProps = {
  quote: Quote
  onChange: (updates: Partial<Quote>) => void
  mode?: QuoteWizardMode
}

export function QuoteWizardHeader({ quote, onChange, mode = 'edit' }: QuoteWizardHeaderProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Client (contractor) single-select editor config
  // extractValue returns JSON with both id and name so we can update both fields
  const clientEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search contractors...',
    minQueryLength: 2,
  }), [])

  // User (assigned to) single-select editor config
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  // Port multi-select editor config
  const portEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string }) => r.recordId,
    extractLabel: (r: { presenter?: { title?: string } }) => r.presenter?.title || '',
    extractItem: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) => ({
      id: r.recordId,
      label: r.presenter?.title || '',
      locode: r.fields?.locode as string | undefined,
      name: r.fields?.name as string | undefined,
    }),
    placeholder: 'Search ports...',
    minQueryLength: 2,
  }), [])

  // Client renderer - handles both plain text and JSON format
  const clientRenderer = useCallback((value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-muted-foreground">Select contractor...</span>
    }
    // Try to parse as JSON (from search selection)
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        return <span>{parsed.name}</span>
      }
    } catch {
      // Not JSON, display as-is
    }
    return <span>{strValue}</span>
  }, [])

  // Assigned user renderer
  const assignedToRenderer = useCallback((value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-muted-foreground">Assign to...</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        return <span>{parsed.name}</span>
      }
    } catch {
      // Not JSON, display as-is
    }
    return <span>{strValue}</span>
  }, [])

  // Port renderer
  const portRenderer = useCallback((value: unknown) => {
    const ports = Array.isArray(value) ? value : []
    if (ports.length === 0) {
      return <span className="text-muted-foreground">-</span>
    }
    return (
      <span className="flex gap-1 overflow-hidden">
        {ports.map((port: PortRef | MultiSelectSelectedItem) => {
          const portAny = port as PortRef & { label?: string }
          return (
            <Badge key={port.id} variant="outline" className="text-xs">
              {portAny.locode || portAny.label || portAny.name || port.id}
            </Badge>
          )
        })}
      </span>
    )
  }, [])

  // Modes renderer - shows selected modes as badges
  const modesRenderer = useCallback((value: unknown) => {
    const modes = Array.isArray(value) ? value as FmsTransportMode[] : []
    if (modes.length === 0) {
      return <span className="text-muted-foreground">Select modes...</span>
    }
    return (
      <span className="flex gap-1 overflow-hidden">
        {modes.map((mode) => {
          const option = TRANSPORT_MODES.find(m => m.value === mode)
          return (
            <Badge key={mode} variant="secondary" className="text-xs">
              {option?.label || mode}
            </Badge>
          )
        })}
      </span>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'clientName',
      title: 'Client (BCO)',
      width: 180,
      renderer: clientRenderer,
      editor: createEntitySearchEditor(clientEditorConfig),
    },
    {
      data: 'assignedToName',
      title: 'Assigned To',
      width: 140,
      renderer: assignedToRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'direction',
      title: 'Direction',
      width: 100,
      type: 'dropdown',
      source: DIRECTION_OPTIONS.map(o => o.label),
    },
    {
      data: 'modes',
      title: 'Modes',
      width: 160,
      renderer: modesRenderer,
      editor: (
        value: unknown,
        onChange: (val: unknown) => void,
        onSave: (val?: unknown, clearEditing?: boolean) => void,
        onCancel: () => void,
      ) => {
        const currentValue = Array.isArray(value) ? value as FmsTransportMode[] : []
        return (
          <ModesMultiSelectEditor
            value={currentValue}
            onChange={(val) => onChange(val)}
            onSave={(val, clear) => onSave(val, clear)}
            onCancel={onCancel}
          />
        )
      },
    },
    {
      data: 'originPorts',
      title: 'Origin',
      width: 160,
      renderer: portRenderer,
      editor: createMultiSelectEntitySearchEditor(portEditorConfig),
    },
    {
      data: 'destinationPorts',
      title: 'Destination',
      width: 160,
      renderer: portRenderer,
      editor: createMultiSelectEntitySearchEditor(portEditorConfig),
    },
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 80,
      type: 'dropdown',
      source: CURRENCY_OPTIONS.map(o => o.label),
      renderer: (value: string) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium border border-border rounded-md bg-background">
          {value}
        </span>
      ),
    },
  ], [clientEditorConfig, clientRenderer, userEditorConfig, assignedToRenderer, modesRenderer, portEditorConfig, portRenderer])

  const tableData = useMemo(() => {
    // Store client and assignedTo as JSON strings to match editor output format
    // This ensures Handsontable's internal data stays in sync with our state
    const clientNameValue = quote.clientId && quote.clientName
      ? JSON.stringify({ id: quote.clientId, name: quote.clientName })
      : quote.clientName || ''

    // Use nested assignedTo object if available, otherwise fallback to flat fields
    const assignedToNameValue = quote.assignedTo?.id && quote.assignedTo?.name
      ? JSON.stringify({ id: quote.assignedTo.id, name: quote.assignedTo.name })
      : quote.assignedToId && quote.assignedToName
        ? JSON.stringify({ id: quote.assignedToId, name: quote.assignedToName })
        : ''

    const data = [{
      id: quote.id,
      clientId: quote.clientId || null,
      clientName: clientNameValue,
      assignedToId: quote.assignedToId || null,
      assignedToName: assignedToNameValue,
      direction: DIRECTION_OPTIONS.find(o => o.value === quote.direction)?.label || 'Select',
      modes: quote.modes || [],
      originPorts: quote.originPorts || [],
      destinationPorts: quote.destinationPorts || [],
      currencyCode: quote.currencyCode || 'USD',
    }]
    return data
  }, [quote])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle client selection (single select with JSON value)
    if (field === 'clientName') {
      const strValue = String(value || '')
      // Try to parse as JSON (from search selection)
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          onChange({ clientId: parsed.id, clientName: parsed.name || '' })
          return
        }
      } catch {
        // Not JSON, treat as plain text (user typed manually)
      }
      // Plain text value - just update clientName, clear clientId
      onChange({ clientId: null, clientName: strValue || null })
      return
    }

    // Handle assignedTo selection (single select with JSON value)
    if (field === 'assignedToName') {
      const strValue = String(value || '')
      // Try to parse as JSON (from search selection)
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          // Pass assignedToId, assignedToName (flat), and assignedTo object for display
          onChange({
            assignedToId: parsed.id,
            assignedToName: parsed.name || '',
            assignedTo: { id: parsed.id, name: parsed.name || '', email: '' }
          })
          return
        }
      } catch {
        // Not JSON - clear assignment
      }
      // Clear assignment
      onChange({ assignedToId: null, assignedToName: null, assignedTo: null })
      return
    }

    // Handle multi-select ports - send both IDs for API and port objects for local state
    if (field === 'originPorts' || field === 'destinationPorts') {
      const idsField = field === 'originPorts' ? 'originPortIds' : 'destinationPortIds'
      const ports = Array.isArray(value) ? value : []
      const ids = ports.map((p: PortRef | MultiSelectSelectedItem) => p.id)
      // Convert MultiSelectSelectedItem to PortRef format for local state
      const portRefs: PortRef[] = ports.map((p: PortRef | MultiSelectSelectedItem) => ({
        id: p.id,
        locode: (p as PortRef).locode || (p as MultiSelectSelectedItem).label?.split(' - ')[0] || null,
        name: (p as PortRef).name || (p as MultiSelectSelectedItem).label || '',
      }))
      // Send both the IDs (for API) and port objects (for local display)
      onChange({ [idsField]: ids, [field]: portRefs })
      return
    }

    // Handle modes multi-select (receives array directly from custom editor)
    if (field === 'modes') {
      const newModes = Array.isArray(value) ? value as FmsTransportMode[] : []
      onChange({ modes: newModes })
      return
    }

    let finalValue = value

    // Handle direction dropdown
    if (field === 'direction') {
      const option = DIRECTION_OPTIONS.find(o => o.label === value)
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
    <div className="border-b px-4 py-2" style={{ height: 90 }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Quote Details"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        autoSelectOnFocus={true}
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
  )
}

// =============================================================================
// Context-based component
// =============================================================================

/**
 * QuoteWizardHeaderConnected - Uses QuoteWizardContext for state
 *
 * This component automatically gets quote and updateQuote from context.
 */
export function QuoteWizardHeaderConnected() {
  const { quote, updateQuote, mode } = useQuoteWizardContext()

  if (!quote) return null

  return <QuoteWizardHeader quote={quote} onChange={updateQuote} mode={mode} />
}
