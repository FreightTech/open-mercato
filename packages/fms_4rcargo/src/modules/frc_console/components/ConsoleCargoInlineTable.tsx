'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import { Trash2, Search, Package } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { FRC_STACKABLE_TYPES } from '../../../lib/types'

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
  isNew?: boolean
}

interface ConsoleCargoInlineTableProps {
  consoleId: string
  items: ConsoleCargoItemData[]
  onRefresh: () => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export interface ConsoleCargoInlineTableHandle {
  addRow: () => void
}

const STACKABLE_OPTIONS = FRC_STACKABLE_TYPES.map((s) => ({
  value: s,
  label: s === 'fully_stackable' ? 'Yes' : 'No',
}))

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

const numberRenderer = (value: unknown) => {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">-</span>
  const num = typeof value === 'string' ? parseFloat(value) : (value as number)
  if (isNaN(num)) return <span className="text-muted-foreground">-</span>
  return <span className="font-mono">{num.toFixed(2)}</span>
}

export const ConsoleCargoInlineTable = forwardRef<ConsoleCargoInlineTableHandle, ConsoleCargoInlineTableProps>(function ConsoleCargoInlineTable({
  consoleId,
  items,
  onRefresh,
  tableRef: externalTableRef,
  siblingTableRefs,
}, ref) {
  const t = useT()
  const queryClient = useQueryClient()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Track new rows being added (pending cargo selection)
  const [newRows, setNewRows] = useState<ConsoleCargoItemData[]>([])

  // Entity search editor config for air cargo
  const airCargoEditorConfig = useMemo(
    () => ({
      entityType: 'air_cargo:frc_air_cargo',
      extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
        JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
        }),
      formatOption: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) => ({
        primary: r.presenter?.title || `Cargo ${r.recordId.slice(0, 8)}...`,
        secondary: r.presenter?.subtitle,
      }),
      placeholder: t('frc_console.cargo.searchPlaceholder', 'Search air cargo...'),
      minQueryLength: 1,
      noResultsText: t('frc_console.cargo.noResults', 'No results found. Create air cargo in the Air Cargo module first.'),
    }),
    [t]
  )

  // Update cargo quantity mutation
  const updateCargoMutation = useMutation({
    mutationFn: async ({ cargoId, quantity }: { cargoId: string; quantity: number }) => {
      const call = await apiCall(`/api/frc_console/console/${consoleId}/cargo/${cargoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })
      if (!call.ok) throw new Error('Failed to update cargo')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_console_cargo', consoleId] })
    },
  })

  // Remove cargo mutation
  const removeCargoMutation = useMutation({
    mutationFn: async (cargoId: string) => {
      const call = await apiCall(`/api/frc_console/console/${consoleId}/cargo/${cargoId}`, {
        method: 'DELETE',
      })
      if (!call.ok) throw new Error('Failed to remove cargo')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_console_cargo', consoleId] })
      flash(t('frc_console.detail.cargo.removeSuccess', 'Cargo removed'), 'success')
    },
  })

  // Add existing air cargo to console
  const addExistingCargoMutation = useMutation({
    mutationFn: async ({ airCargoId, quantity }: { airCargoId: string; quantity: number }) => {
      const call = await apiCall(`/api/frc_console/console/${consoleId}/cargo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ airCargoId, quantity }] }),
      })
      if (!call.ok) {
        const errorResult = call.result as { error?: string } | null
        throw new Error(errorResult?.error || 'Failed to add cargo')
      }
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_console_cargo', consoleId] })
      flash(t('frc_console.detail.cargo.addSuccess', 'Cargo added'), 'success')
    },
  })

  const handleAddRow = useCallback(() => {
    const newRow: ConsoleCargoItemData = {
      id: `new-${Date.now()}`,
      airCargoId: '',
      quantity: 1,
      cargoName: '',
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      actualWeightKg: null,
      stackableType: 'fully_stackable',
      numberOfPieces: 1,
      color: '#cccccc',
      isNew: true,
    }
    setNewRows((prev) => [...prev, newRow])
  }, [])

  // Expose addRow method to parent via ref
  useImperativeHandle(ref, () => ({
    addRow: handleAddRow,
  }), [handleAddRow])

  const handleRemoveNewRow = useCallback((rowId: string) => {
    setNewRows((prev) => prev.filter((r) => r.id !== rowId))
  }, [])

  const handleDelete = useCallback(async (cargoId: string, isNew: boolean) => {
    if (isNew) {
      handleRemoveNewRow(cargoId)
    } else {
      await removeCargoMutation.mutateAsync(cargoId)
    }
  }, [removeCargoMutation, handleRemoveNewRow])

  // Combine existing items with new rows
  const tableData = useMemo(() => {
    const existingData = items.map((item) => ({
      id: item.id,
      airCargoId: item.airCargoId,
      cargoName: item.cargoName,
      quantity: item.quantity,
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      actualWeightKg: item.actualWeightKg,
      stackableType: item.stackableType,
      isNew: false,
    }))

    const newData = newRows.map((row) => ({
      id: row.id,
      airCargoId: row.airCargoId,
      cargoName: row.cargoName,
      quantity: row.quantity,
      lengthCm: row.lengthCm,
      widthCm: row.widthCm,
      heightCm: row.heightCm,
      actualWeightKg: row.actualWeightKg,
      stackableType: row.stackableType,
      isNew: true,
    }))

    return [...existingData, ...newData]
  }, [items, newRows])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'cargoName',
      title: t('frc_console.detail.cargo.name', 'Cargo'),
      width: 200,
      type: 'text',
      editor: createEntitySearchEditor(airCargoEditorConfig),
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const isNew = row.isNew as boolean
        if (isNew && !value) {
          return (
            <span className="text-muted-foreground italic flex items-center gap-1">
              <Search className="h-3 w-3" />
              {t('frc_console.cargo.clickToSearch', 'Click to search...')}
            </span>
          )
        }
        // If value is a JSON string (from entity search), parse to get name
        if (typeof value === 'string' && value.startsWith('{')) {
          try {
            const parsed = JSON.parse(value)
            return parsed.name || value
          } catch {
            return value
          }
        }
        return value as string
      },
    },
    {
      data: 'quantity',
      title: t('frc_console.detail.cargo.quantity', 'Qty'),
      width: 70,
      type: 'numeric',
    },
    {
      data: 'lengthCm',
      title: t('frc_console.detail.cargo.length', 'L (cm)'),
      width: 80,
      type: 'numeric',
      readOnly: true,
      renderer: numberRenderer,
    },
    {
      data: 'widthCm',
      title: t('frc_console.detail.cargo.width', 'W (cm)'),
      width: 80,
      type: 'numeric',
      readOnly: true,
      renderer: numberRenderer,
    },
    {
      data: 'heightCm',
      title: t('frc_console.detail.cargo.height', 'H (cm)'),
      width: 80,
      type: 'numeric',
      readOnly: true,
      renderer: numberRenderer,
    },
    {
      data: 'actualWeightKg',
      title: t('frc_console.detail.cargo.weight', 'Weight (kg)'),
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: numberRenderer,
    },
    {
      data: 'stackableType',
      title: t('frc_console.detail.cargo.stackable', 'Stackable'),
      width: 90,
      type: 'dropdown',
      source: STACKABLE_OPTIONS,
      readOnly: true,
      renderer: stackableRenderer,
    },
  ], [t, airCargoEditorConfig])

  const handleCellSave = useCallback(async (
    rowId: string,
    field: string,
    value: unknown,
    rowIndex: number,
    colIndex: number,
    rowData: Record<string, unknown>
  ) => {
    const isNew = rowData.isNew as boolean

    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex,
      colIndex,
    } as CellSaveStartEvent)

    try {
      if (isNew) {
        // Handle new row - only cargoName (entity search) and quantity are editable
        if (field === 'cargoName') {
          // User selected from search
          let parsedValue: { id?: string; name?: string } = {}
          try {
            parsedValue = JSON.parse(String(value))
          } catch {
            // Not JSON - ignore, user must select from search
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex,
              colIndex,
            } as CellSaveSuccessEvent)
            return
          }

          if (parsedValue.id) {
            // User selected existing cargo - add it immediately
            await addExistingCargoMutation.mutateAsync({
              airCargoId: parsedValue.id,
              quantity: (rowData.quantity as number) || 1,
            })
            // Remove from new rows since it's now saved
            handleRemoveNewRow(rowId)
            onRefresh()
          }
        } else if (field === 'quantity') {
          // Update quantity on new row (local state only)
          setNewRows((prev) =>
            prev.map((r) =>
              r.id === rowId
                ? { ...r, quantity: parseInt(String(value), 10) || 1 }
                : r
            )
          )
        }

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex,
          colIndex,
        } as CellSaveSuccessEvent)
      } else {
        // Handle existing row edits (only quantity is editable)
        if (field !== 'quantity') {
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex,
            colIndex,
          } as CellSaveSuccessEvent)
          return
        }

        const quantity = parseInt(String(value), 10)
        if (isNaN(quantity) || quantity < 1) {
          throw new Error('Quantity must be at least 1')
        }

        await updateCargoMutation.mutateAsync({ cargoId: rowId, quantity })

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex,
          colIndex,
        } as CellSaveSuccessEvent)
      }
    } catch (error) {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex,
        colIndex,
        error: error instanceof Error ? error.message : 'Failed to save',
      } as CellSaveErrorEvent)
      flash(error instanceof Error ? error.message : 'Failed to save', 'error')
    }
  }, [tableRef, updateCargoMutation, addExistingCargoMutation, handleRemoveNewRow, onRefresh])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        const rowData = tableData[payload.rowIndex]
        handleCellSave(
          payload.id as string,
          payload.prop,
          payload.newValue,
          payload.rowIndex,
          payload.colIndex,
          rowData as Record<string, unknown>
        )
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Show empty state when no items
  if (tableData.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{t('frc_console.detail.cargo.empty', 'No cargo items')}</p>
        <p className="text-sm">{t('frc_console.detail.cargo.emptyHint', 'Click "Add Cargo" to add air cargo to this console.')}</p>
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
        actionsRenderer={(rowData: Record<string, unknown>) => {
          const isNew = rowData.isNew as boolean

          return (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDelete(rowData.id as string, isNew)}
                className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                title={t('frc_console.detail.cargo.remove', 'Remove')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )
        }}
      />
    </div>
  )
})
