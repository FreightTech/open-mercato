'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
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
      return <span className="text-gray-400">Select contractor...</span>
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
      return <span className="text-gray-400">Assign to...</span>
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
      return <span className="text-gray-400">-</span>
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
      return <span className="text-gray-400">Select modes...</span>
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
      width: 140,
      renderer: modesRenderer,
      type: 'dropdown',
      source: TRANSPORT_MODES.map(m => m.label),
      allowInvalid: true,
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
    },
  ], [clientEditorConfig, clientRenderer, userEditorConfig, assignedToRenderer, modesRenderer, portEditorConfig, portRenderer])

  const tableData = useMemo(() => {
    // Store client and assignedTo as JSON strings to match editor output format
    // This ensures Handsontable's internal data stays in sync with our state
    const clientNameValue = quote.clientId && quote.clientName
      ? JSON.stringify({ id: quote.clientId, name: quote.clientName })
      : quote.clientName || ''

    const assignedToNameValue = quote.assignedTo
      ? JSON.stringify({ id: quote.assignedTo.id, name: quote.assignedTo.name })
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
          // Pass both assignedToId and the assignedTo object so the name is available for display
          onChange({ assignedToId: parsed.id, assignedTo: { id: parsed.id, name: parsed.name || '', email: '' } })
          return
        }
      } catch {
        // Not JSON - clear assignment
      }
      // Clear assignment
      onChange({ assignedToId: null, assignedTo: null })
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

    // Handle modes multi-select (toggle behavior)
    if (field === 'modes') {
      const selectedLabel = String(value || '')
      const modeOption = TRANSPORT_MODES.find(m => m.label === selectedLabel)
      if (!modeOption) return

      const currentModes = quote.modes || []
      const modeValue = modeOption.value

      // Toggle: remove if present, add if not
      const newModes = currentModes.includes(modeValue)
        ? currentModes.filter(m => m !== modeValue)
        : [...currentModes, modeValue]

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
  }, [onChange, quote.modes])

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
