'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Building2 } from 'lucide-react'
import type { Quote, QuoteWizardMode, FmsTransportMode } from './types/quote-wizard'
import { useQuoteWizardContext } from './hooks/useQuoteWizardContext'
import {
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
  /** Optional external ref for the table - used by parent for focus management */
  tableRef?: React.RefObject<HTMLDivElement | null>
  /** Refs to adjacent DynamicTable containers for cross-table arrow navigation */
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export function QuoteWizardHeader({ quote, onChange, mode = 'edit', tableRef: externalTableRef, siblingTableRefs }: QuoteWizardHeaderProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Entity search editor config for Client (BCO)
  const clientEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
    minQueryLength: 1,
  }), [])

  // Client renderer - shows Building2 icon with name
  const clientRenderer = useCallback((value: unknown) => {
    const name = value as string | null
    if (!name) {
      return (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          Select client...
        </span>
      )
    }
    return (
      <span className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{name}</span>
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
      width: 200,
      renderer: clientRenderer,
      editor: createEntitySearchEditor(clientEditorConfig),
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
      type: 'multiselect',
      source: TRANSPORT_MODES,
      renderer: modesRenderer,
    },
    {
      data: 'cargoType',
      title: 'Cargo Type',
      width: 120,
      type: 'text',
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
  ], [clientRenderer, clientEditorConfig, modesRenderer])

  const tableData = useMemo(() => {
    const data = [{
      id: quote.id,
      clientName: quote.clientName || null,
      direction: DIRECTION_OPTIONS.find(o => o.value === quote.direction)?.label || 'Select',
      modes: quote.modes || [],
      cargoType: quote.cargoType || '',
      currencyCode: quote.currencyCode || 'USD',
    }]
    return data
  }, [quote])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    // Handle clientName - parse JSON from EntitySearchEditor
    if (field === 'clientName') {
      try {
        const parsed = JSON.parse(String(value))
        onChange({ clientId: parsed.id, clientName: parsed.name || null })
      } catch {
        onChange({ clientId: null, clientName: null })
      }
      return
    }

    // Handle modes multi-select (receives array directly from multiselect editor)
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

  // Key should only be based on quote ID - not editable values
  // Including editable values causes remount during editing which destroys the editor
  const tableKey = useMemo(() => quote.id, [quote.id])

  return (
    <div className="border-b px-4 py-2" style={{ height: 90 }}>
      <DynamicTable
        key={tableKey}
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
        siblingTableRefs={siblingTableRefs}
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
