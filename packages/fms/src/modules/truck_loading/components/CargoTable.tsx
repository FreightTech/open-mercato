'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import { CARGO_PRESETS } from '../lib/cargo-presets'
import { getNextColor } from '../lib/colors'
import type { CargoItem } from '../lib/types'

interface CargoTableProps {
  items: CargoItem[]
  selectedCargoId: string | null
  onSelect: (cargoItemId: string | null) => void
  onAdd: (item: CargoItem) => void
  onUpdate: (cargoId: string, field: string, value: unknown) => void
  onRemove: (cargoItemId: string) => void
}

function createCargoFromPreset(presetId: string): CargoItem {
  const preset = CARGO_PRESETS.find((p) => p.id === presetId) ?? CARGO_PRESETS[0]
  return {
    id: crypto.randomUUID(),
    name: preset.label,
    width: preset.width,
    length: preset.length,
    height: preset.height,
    weight: preset.weight,
    quantity: 1,
    stackable: preset.stackable,
    color: getNextColor(),
  }
}

export function CargoTable({
  items,
  selectedCargoId,
  onSelect,
  onAdd,
  onUpdate,
  onRemove,
}: CargoTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!presetMenuOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setPresetMenuOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPresetMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [presetMenuOpen])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'color',
      title: ' ',
      width: 32,
      readOnly: true,
      renderer: (value: unknown) => (
        <span
          className="inline-block h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: String(value) }}
        />
      ),
    },
    {
      data: 'name',
      title: 'Name',
      width: 140,
      type: 'text',
    },
    {
      data: 'width',
      title: 'W (cm)',
      width: 70,
      type: 'numeric',
    },
    {
      data: 'length',
      title: 'L (cm)',
      width: 70,
      type: 'numeric',
    },
    {
      data: 'height',
      title: 'H (cm)',
      width: 70,
      type: 'numeric',
    },
    {
      data: 'weight',
      title: 'Weight (kg)',
      width: 90,
      type: 'numeric',
    },
    {
      data: 'quantity',
      title: 'Qty',
      width: 55,
      type: 'numeric',
    },
    {
      data: 'stackable',
      title: 'Stackable',
      width: 75,
      type: 'boolean',
    },
  ], [])

  const tableData = useMemo(() => {
    return items.map((item) => ({
      id: item.id,
      color: item.color,
      name: item.name,
      width: item.width,
      length: item.length,
      height: item.height,
      weight: item.weight,
      quantity: item.quantity,
      stackable: item.stackable,
    }))
  }, [items])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          let normalizedValue: unknown = payload.newValue
          if (payload.prop === 'width' || payload.prop === 'length' || payload.prop === 'height' || payload.prop === 'weight' || payload.prop === 'quantity') {
            normalizedValue = Number(payload.newValue) || 0
          }
          if (payload.prop === 'stackable') {
            normalizedValue = payload.newValue === true || payload.newValue === 'true'
          }

          onUpdate(payload.id as string, payload.prop, normalizedValue)

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
    tableRef as React.RefObject<HTMLElement>,
  )

  const handleAddPreset = useCallback(
    (presetId: string) => {
      onAdd(createCargoFromPreset(presetId))
      setPresetMenuOpen(false)
    },
    [onAdd],
  )

  const handleRemove = useCallback(
    (cargoId: string) => {
      onRemove(cargoId)
    },
    [onRemove],
  )

  const handleRowClick = useCallback(
    (_rowIndex: number, rowData: Record<string, unknown>) => {
      const clickedId = rowData.id as string
      onSelect(selectedCargoId === clickedId ? null : clickedId)
    },
    [selectedCargoId, onSelect],
  )

  const tableHeight = Math.min(Math.max(items.length * 36 + 90, 130), 220)

  const toolbarButtons = (
    <div className="relative" ref={menuRef}>
      <Button
        onClick={() => setPresetMenuOpen(!presetMenuOpen)}
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add cargo
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {presetMenuOpen && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-md">
          {CARGO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleAddPreset(preset.id)}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Cargo"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        onRowClick={handleRowClick}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleRemove(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title="Remove cargo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        emptyMessage="Add cargo item"
        uiConfig={{
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          hideTitle: true,
          topBarEnd: toolbarButtons,
        }}
      />
    </div>
  )
}
