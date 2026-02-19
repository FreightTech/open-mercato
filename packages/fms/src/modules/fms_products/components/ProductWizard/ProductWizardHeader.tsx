'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
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
import { useProductWizardContext } from './hooks/useProductWizardContext'

const CHARGE_UNIT_OPTIONS: Record<string, string> = {
  container: 'Per Container',
  file: 'Per File',
  weight_measure: 'Per W/M',
  cargo_value_percent: '% Cargo Value',
}

const TRANSPORT_MODE_OPTIONS: Record<string, string> = {
  sea: 'Sea',
  air: 'Air',
  rail: 'Rail',
}

/**
 * Format charge unit for display
 */
function formatChargeUnit(unit: string | null | undefined): string {
  if (!unit) return '-'
  return CHARGE_UNIT_OPTIONS[unit] ?? unit
}

/**
 * Format transport mode for display
 */
function formatTransportMode(mode: string | null | undefined): string {
  if (!mode) return '-'
  return TRANSPORT_MODE_OPTIONS[mode] ?? mode
}

export function ProductWizardHeader() {
  const { product, updateProduct, mode, updateProductOnServer } = useProductWizardContext()
  const tableRef = useRef<HTMLDivElement>(null)
  const isEditMode = mode === 'edit'

  // Build columns
  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'name',
        title: 'Product Name *',
        width: 200,
      },
      {
        data: 'chargeCode',
        title: 'Charge Code',
        width: 130,
      },
      {
        data: 'chargeUnit',
        title: 'Charge Unit',
        width: 130,
        type: 'dropdown',
        source: ['', ...Object.keys(CHARGE_UNIT_OPTIONS)],
        renderer: (value: unknown) => {
          return <span className="text-gray-600">{formatChargeUnit(value as string)}</span>
        },
      },
      {
        data: 'transportMode',
        title: 'Transport Mode',
        width: 130,
        type: 'dropdown',
        source: ['', ...Object.keys(TRANSPORT_MODE_OPTIONS)],
        renderer: (value: unknown) => {
          return <span className="text-gray-600">{formatTransportMode(value as string)}</span>
        },
      },
    ]
  }, [])

  // Transform product state to table row data
  const tableData = useMemo(
    () => [
      {
        id: 'header',
        name: product.name,
        chargeCode: product.chargeCode || '',
        chargeUnit: product.chargeUnit || '',
        transportMode: product.transportMode || '',
      },
    ],
    [product]
  )

  // Event handlers for cell edits
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent, event?: Event) => {
        if (event && tableRef.current && !tableRef.current.contains(event.target as Node)) {
          return
        }

        const updates = { [payload.prop]: payload.newValue || null }
        updateProduct(updates)

        if (isEditMode) {
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveStartEvent)

          try {
            await updateProductOnServer(updates)

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
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <div className="space-y-2 p-4 bg-white rounded-lg border">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Product Details
      </h3>
      <div style={{ height: 90 }}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Product Header"
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
            hideColumnsButton: true,
          }}
        />
      </div>
    </div>
  )
}
