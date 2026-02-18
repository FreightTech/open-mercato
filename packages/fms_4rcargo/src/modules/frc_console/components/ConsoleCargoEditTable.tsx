'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type ConsoleCargoItemData = {
  id: string
  airCargoId: string
  quantity: number
  cargoName: string
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string | null
  stackableType: string
  numberOfPieces: number
  color: string
}

interface ConsoleCargoEditTableProps {
  consoleId: string
  items: ConsoleCargoItemData[]
  onQuantitySave: (cargoId: string, quantity: number) => Promise<void>
  onRemove: (cargoId: string) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

function formatDimensions(
  lengthCm: string | null,
  widthCm: string | null,
  heightCm: string | null
): string {
  const l = lengthCm ?? '?'
  const w = widthCm ?? '?'
  const h = heightCm ?? '?'
  return `${l}x${w}x${h}`
}

const stackableRenderer = (value: unknown) => {
  const stackable = value as string
  const isStackable = stackable === 'fully_stackable'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isStackable ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {isStackable ? 'Yes' : 'No'}
    </span>
  )
}

export function ConsoleCargoEditTable({
  consoleId,
  items,
  onQuantitySave,
  onRemove,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ConsoleCargoEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'colorIndicator',
      title: '',
      width: 30,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const color = row.color as string
        return (
          <div
            className="w-3 h-3 rounded-sm mx-auto"
            style={{ backgroundColor: color }}
            title={`Color: ${color}`}
          />
        )
      },
    },
    {
      data: 'cargoName',
      title: t('frc_console.detail.cargo.name', 'Cargo'),
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'quantity',
      title: t('frc_console.detail.cargo.quantity', 'Qty'),
      width: 70,
      type: 'numeric',
    },
    {
      data: 'dimensions',
      title: t('frc_console.detail.cargo.dimensions', 'Dimensions (cm)'),
      width: 120,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'actualWeightKg',
      title: t('frc_console.detail.cargo.weight', 'Weight (kg)'),
      width: 100,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'stackableType',
      title: t('frc_console.detail.cargo.stackable', 'Stackable'),
      width: 90,
      type: 'text',
      readOnly: true,
      renderer: stackableRenderer,
    },
  ], [t])

  const tableData = useMemo(() =>
    items.map((item) => ({
      id: item.id,
      airCargoId: item.airCargoId,
      cargoName: item.cargoName,
      quantity: item.quantity,
      dimensions: formatDimensions(item.lengthCm, item.widthCm, item.heightCm),
      actualWeightKg: item.actualWeightKg ?? '-',
      stackableType: item.stackableType,
      color: item.color,
      colorIndicator: '',
    })),
  [items])

  const handleCellSave = useCallback(async (
    cargoId: string,
    field: string,
    value: unknown,
    rowIndex: number,
    colIndex: number
  ) => {
    if (field !== 'quantity') return

    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex,
      colIndex,
    } as CellSaveStartEvent)

    try {
      const quantity = parseInt(String(value), 10)
      if (isNaN(quantity) || quantity < 1) {
        throw new Error('Quantity must be at least 1')
      }

      await onQuantitySave(cargoId, quantity)

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex,
        colIndex,
      } as CellSaveSuccessEvent)
    } catch (error) {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex,
        colIndex,
        error: error instanceof Error ? error.message : 'Failed to save',
      } as CellSaveErrorEvent)
    }
  }, [onQuantitySave, tableRef])

  const handleDelete = useCallback(async (cargoId: string) => {
    await onRemove(cargoId)
  }, [onRemove])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        const cargoId = payload.id as string
        handleCellSave(cargoId, payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_console.detail.cargo.empty', 'No cargo items. Click "Add Cargo" to add packages.')}
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
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
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => handleDelete(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
            title={t('frc_console.detail.cargo.remove', 'Remove from console')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  )
}
