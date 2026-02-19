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
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
} from '@open-mercato/ui/backend/dynamic-table'

import type { ConsoleDraft, TruckPresetOption } from './types'
import { CONSOLE_STATUS_OPTIONS } from './types'

interface ConsoleWizardDetailsTableProps {
  draft: ConsoleDraft
  onDraftChange: (updates: Partial<ConsoleDraft>) => void
  truckPresets: TruckPresetOption[]
  nextTableRef?: React.RefObject<HTMLDivElement>
}

export function ConsoleWizardDetailsTable({
  draft,
  onDraftChange,
  truckPresets,
  nextTableRef,
}: ConsoleWizardDetailsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Entity search editor config for trucks
  const truckEditorConfig = useMemo(
    () => ({
      entityType: 'frc_trucks:frc_truck',
      extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
        JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
      formatOption: (r: { recordId: string; presenter?: { title?: string } }) => ({
        primary: r.presenter?.title || `Truck ${r.recordId.slice(0, 8)}...`,
      }),
      placeholder: 'Search trucks...',
      minQueryLength: 1,
    }),
    []
  )

  const presetOptions = useMemo(
    () =>
      truckPresets.map((p) => ({
        value: p.id,
        label: p.width && p.length && p.height
          ? `${p.name} (${p.width}x${p.length}x${p.height}cm)`
          : p.name,
      })),
    [truckPresets]
  )

  // Create a map to look up preset name by ID for display
  const presetNameMap = useMemo(
    () => new Map(presetOptions.map((p) => [p.value, p.label])),
    [presetOptions]
  )

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'date',
        title: 'Loading Date',
        width: 140,
        type: 'date',
      },
      {
        data: 'truckName',
        title: 'Truck',
        width: 200,
        type: 'text',
        editor: createEntitySearchEditor(truckEditorConfig),
      },
      {
        data: 'truckPresetName',
        title: 'Truck Type',
        width: 250,
        type: 'dropdown',
        source: presetOptions,
      },
      {
        data: 'status',
        title: 'Status',
        width: 120,
        type: 'dropdown',
        source: CONSOLE_STATUS_OPTIONS,
      },
    ],
    [truckEditorConfig, presetOptions]
  )

  const tableData = useMemo(
    () => [
      {
        id: 'draft',
        date: draft.date,
        truckName: draft.truckName ?? '',
        truckPresetName: draft.truckPresetName ?? '',
        status: draft.status,
      },
    ],
    [draft]
  )

  const handleCellChange = useCallback(
    (field: string, value: unknown) => {
      const updates: Partial<ConsoleDraft> = {}

      switch (field) {
        case 'date':
          updates.date = value ? String(value) : new Date().toISOString().split('T')[0]
          break
        case 'truckName':
          try {
            const parsed = JSON.parse(String(value))
            updates.truckId = parsed.id
            updates.truckName = parsed.name
          } catch {
            updates.truckId = null
            updates.truckName = value ? String(value) : null
          }
          break
        case 'truckPresetName':
          // The dropdown returns the value (ID), we need to look up the label
          if (value) {
            const presetId = String(value)
            updates.truckPresetId = presetId
            updates.truckPresetName = presetNameMap.get(presetId) ?? null
          } else {
            updates.truckPresetId = null
            updates.truckPresetName = null
          }
          break
        case 'status':
          updates.status = String(value) as ConsoleDraft['status']
          break
      }

      onDraftChange(updates)
    },
    [onDraftChange, presetNameMap]
  )

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        handleCellChange(payload.prop, payload.newValue)

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveSuccessEvent)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-1.5 border-b">
        <h3 className="text-sm font-medium">Console Details</h3>
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
        siblingTableRefs={{ next: nextTableRef }}
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
