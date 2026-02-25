'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { Trash2, Plus } from 'lucide-react'
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
  NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'

import type { CargoItemDraft } from './types'
import {
  STACKABLE_TYPE_OPTIONS,
  createEmptyCargoItemDraft,
  calculateCargoMetrics,
} from './types'

interface OpportunityCargoTableProps {
  cargoItems: CargoItemDraft[]
  onCargoItemsChange: (items: CargoItemDraft[]) => void
  prevTableRef?: React.RefObject<HTMLDivElement>
}

export function OpportunityCargoTable({
  cargoItems,
  onCargoItemsChange,
  prevTableRef,
}: OpportunityCargoTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Calculate totals
  const totals = useMemo(() => {
    let totalPieces = 0
    let totalVolume = 0
    let totalChargeableWeight = 0
    let totalLoadingMetres = 0

    for (const item of cargoItems) {
      totalPieces += item.numberOfPieces || 0
      totalVolume += parseFloat(item.volumeM3 || '0')
      totalChargeableWeight += parseFloat(item.chargeableWeightKg || '0')
      totalLoadingMetres += parseFloat(item.loadingMetres || '0')
    }

    return {
      totalPieces,
      totalVolume: totalVolume.toFixed(4),
      totalChargeableWeight: totalChargeableWeight.toFixed(2),
      totalLoadingMetres: totalLoadingMetres.toFixed(4),
    }
  }, [cargoItems])

  const handleDeleteRow = useCallback(
    (tempId: string) => {
      const filtered = cargoItems.filter((item) => item._tempId !== tempId)
      onCargoItemsChange(filtered)
    },
    [cargoItems, onCargoItemsChange]
  )

  const handleAddCargoItem = useCallback(() => {
    const newItem = createEmptyCargoItemDraft()
    onCargoItemsChange([...cargoItems, newItem])
  }, [cargoItems, onCargoItemsChange])

  const actionsRenderer = useCallback(
    (rowData: CargoItemDraft) => {
      if (!rowData._tempId) return null
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteRow(rowData._tempId)
          }}
          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
          title="Remove cargo item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )
    },
    [handleDeleteRow]
  )

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'name',
        title: 'Description',
        width: 150,
        type: 'text',
      },
      {
        data: 'numberOfPieces',
        title: 'Pieces',
        width: 70,
        type: 'numeric',
      },
      {
        data: 'stackableType',
        title: 'Stackable',
        width: 130,
        type: 'dropdown',
        source: STACKABLE_TYPE_OPTIONS,
      },
      {
        data: 'lengthCm',
        title: 'L (cm)',
        width: 70,
        type: 'numeric',
      },
      {
        data: 'widthCm',
        title: 'W (cm)',
        width: 70,
        type: 'numeric',
      },
      {
        data: 'heightCm',
        title: 'H (cm)',
        width: 70,
        type: 'numeric',
      },
      {
        data: 'actualWeightKg',
        title: 'Weight (kg)',
        width: 90,
        type: 'numeric',
      },
      {
        data: 'volumeM3',
        title: 'Volume (m3)',
        width: 90,
        type: 'numeric',
        readOnly: true,
        cellClassName: () => 'bg-muted/50',
      },
      {
        data: 'volumetricWeightKg',
        title: 'Vol Wt (kg)',
        headerTooltip: 'Volume (m³) × 167 kg/m³',
        width: 100,
        type: 'numeric',
        readOnly: true,
        cellClassName: () => 'bg-muted/50',
      },
      {
        data: 'chargeableWeightKg',
        title: 'Chg. Wt (kg)',
        headerTooltip: 'MAX(Actual Weight × Pieces, Volumetric Weight)',
        width: 100,
        type: 'numeric',
        readOnly: true,
        cellClassName: () => 'bg-muted/50',
      },
      {
        data: 'loadingMetres',
        title: 'Ldg. Metres',
        width: 90,
        type: 'numeric',
        readOnly: true,
        cellClassName: () => 'bg-muted/50',
      },
    ],
    []
  )

  const tableData = useMemo(
    () =>
      cargoItems.map((item) => ({
        id: item._tempId,
        _tempId: item._tempId,
        name: item.name,
        numberOfPieces: item.numberOfPieces,
        stackableType: item.stackableType,
        lengthCm: item.lengthCm ?? '',
        widthCm: item.widthCm ?? '',
        heightCm: item.heightCm ?? '',
        actualWeightKg: item.actualWeightKg ?? '',
        volumeM3: item.volumeM3,
        volumetricWeightKg: item.volumetricWeightKg,
        chargeableWeightKg: item.chargeableWeightKg,
        loadingMetres: item.loadingMetres,
      })),
    [cargoItems]
  )

  const handleCellChange = useCallback(
    (tempId: string, field: string, value: unknown) => {
      const updatedItems = cargoItems.map((item) => {
        if (item._tempId !== tempId) return item

        const updated = { ...item }

        switch (field) {
          case 'name':
            updated.name = String(value ?? '')
            break
          case 'numberOfPieces':
            updated.numberOfPieces = Number(value) || 1
            break
          case 'stackableType':
            updated.stackableType = String(value) as CargoItemDraft['stackableType']
            break
          case 'lengthCm':
            updated.lengthCm = value ? String(value) : null
            break
          case 'widthCm':
            updated.widthCm = value ? String(value) : null
            break
          case 'heightCm':
            updated.heightCm = value ? String(value) : null
            break
          case 'actualWeightKg':
            updated.actualWeightKg = value ? String(value) : null
            break
        }

        // Recalculate metrics
        const metrics = calculateCargoMetrics(updated)
        updated.volumeM3 = metrics.volumeM3
        updated.volumetricWeightKg = metrics.volumetricWeightKg
        updated.chargeableWeightKg = metrics.chargeableWeightKg
        updated.loadingMetres = metrics.loadingMetres

        return updated
      })

      onCargoItemsChange(updatedItems)
    },
    [cargoItems, onCargoItemsChange]
  )

  const handleNewRowSave = useCallback(
    (payload: NewRowSaveEvent) => {
      const newItem = createEmptyCargoItemDraft()
      const rowData = payload.rowData as Record<string, unknown>

      newItem.name = String(rowData.name ?? '')
      newItem.numberOfPieces = Number(rowData.numberOfPieces) || 1
      newItem.stackableType = (rowData.stackableType as CargoItemDraft['stackableType']) || 'fully_stackable'
      newItem.lengthCm = rowData.lengthCm ? String(rowData.lengthCm) : null
      newItem.widthCm = rowData.widthCm ? String(rowData.widthCm) : null
      newItem.heightCm = rowData.heightCm ? String(rowData.heightCm) : null
      newItem.actualWeightKg = rowData.actualWeightKg ? String(rowData.actualWeightKg) : null

      // Calculate metrics
      const metrics = calculateCargoMetrics(newItem)
      newItem.volumeM3 = metrics.volumeM3
      newItem.volumetricWeightKg = metrics.volumetricWeightKg
      newItem.chargeableWeightKg = metrics.chargeableWeightKg
      newItem.loadingMetres = metrics.loadingMetres

      onCargoItemsChange([...cargoItems, newItem])

      // Signal success
      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        savedRowData: { ...rowData, id: newItem._tempId, _tempId: newItem._tempId },
      })
    },
    [cargoItems, onCargoItemsChange]
  )

  useEventHandlers(
    {
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,

      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        handleCellChange(payload.id ?? '', payload.prop, payload.newValue)

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
      <div className="px-3 py-1.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Air Cargo Items</h3>
          <Badge variant="secondary">{cargoItems.length}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddCargoItem}
            className="h-6 w-6 p-0"
            title="Add cargo item"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Pieces: {totals.totalPieces}</span>
          <span>Volume: {totals.totalVolume} m3</span>
          <span>Chg. Wt: {totals.totalChargeableWeight} kg</span>
        </div>
      </div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        height={cargoItems.length > 0 ? `${Math.min(cargoItems.length * 35 + 80, 300)}px` : '150px'}
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        actionsRenderer={actionsRenderer}
        siblingTableRefs={{ prev: prevTableRef }}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: false,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
