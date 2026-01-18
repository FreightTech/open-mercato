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
import type { Quote, PortRef } from './hooks/useQuoteWizard'

type QuoteWizardHeaderProps = {
  quote: Quote
  onChange: (updates: Partial<Quote>) => void
  mode?: 'new' | 'edit'
}

const DIRECTION_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'export', label: 'Export' },
  { value: 'import', label: 'Import' },
  { value: 'both', label: 'Both' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
  { value: 'CNY', label: 'CNY' },
]

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
  ], [clientEditorConfig, clientRenderer, userEditorConfig, assignedToRenderer, portEditorConfig, portRenderer])

  const tableData = useMemo(() => [{
    id: quote.id,
    clientId: quote.clientId || null,
    clientName: quote.clientName || '',
    assignedToId: quote.assignedToId || null,
    assignedToName: quote.assignedTo?.name || '',
    direction: DIRECTION_OPTIONS.find(o => o.value === quote.direction)?.label || 'Select',
    originPorts: quote.originPorts || [],
    destinationPorts: quote.destinationPorts || [],
    currencyCode: quote.currencyCode || 'USD',
  }], [quote])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    console.log('[QuoteWizardHeader] handleCellChange called:', { field, value })

    // Handle client selection (single select with JSON value)
    if (field === 'clientName') {
      const strValue = String(value || '')
      // Try to parse as JSON (from search selection)
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          console.log('[QuoteWizardHeader] handleCellChange: client field, calling onChange with:', { clientId: parsed.id, clientName: parsed.name })
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
          console.log('[QuoteWizardHeader] handleCellChange: assignedTo field, calling onChange with:', { assignedToId: parsed.id })
          onChange({ assignedToId: parsed.id })
          return
        }
      } catch {
        // Not JSON - clear assignment
      }
      // Clear assignment
      onChange({ assignedToId: null })
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
      console.log('[QuoteWizardHeader] handleCellChange: port field, calling onChange with:', { [idsField]: ids, [field]: portRefs })
      // Send both the IDs (for API) and port objects (for local display)
      onChange({ [idsField]: ids, [field]: portRefs })
      return
    }

    let finalValue = value

    // Handle direction dropdown
    if (field === 'direction') {
      const option = DIRECTION_OPTIONS.find(o => o.label === value)
      finalValue = option?.value || null
    }

    console.log('[QuoteWizardHeader] handleCellChange: calling onChange with:', { [field]: finalValue })
    onChange({ [field]: finalValue })
  }, [onChange])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        console.log('[QuoteWizardHeader] CELL_EDIT_SAVE received:', {
          prop: payload.prop,
          newValue: payload.newValue,
          oldValue: payload.oldValue,
        })

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
