'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { useProductWizardContext } from './hooks/useProductWizardContext'

/**
 * Parse JSON value from EntitySearchEditor
 * Returns parsed object with id/name/code/chargeUnit or null if not valid JSON
 */
function parseJsonValue(value: unknown): { id: string; name: string; code?: string; chargeUnit?: string } | null {
  const strValue = String(value || '')
  if (!strValue) return null
  try {
    const parsed = JSON.parse(strValue)
    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
      return parsed
    }
  } catch {
    // Not JSON
  }
  return null
}

/**
 * Format charge unit for display
 */
function formatChargeUnit(unit: string | null | undefined): string {
  if (!unit) return '-'
  switch (unit) {
    case 'container':
      return 'Per Container'
    case 'file':
      return 'Per File'
    case 'weight_measure':
      return 'Per W/M'
    case 'cargo_value_percent':
      return '% Cargo Value'
    default:
      return unit
  }
}

/**
 * Create renderer for entity search fields
 */
function createEntityRenderer(placeholder: string) {
  return (value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-gray-400">{placeholder}</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed?.name) {
        return <span>{parsed.name}</span>
      }
    } catch {
      // Not JSON, display as-is
    }
    return <span>{strValue}</span>
  }
}

export function ProductWizardHeader() {
  const { product, updateProduct, mode, updateProductOnServer } = useProductWizardContext()
  const tableRef = useRef<HTMLDivElement>(null)
  const isEditMode = mode === 'edit'

  // Charge code editor config
  const chargeCodeEditorConfig = useMemo(
    () => ({
      entityType: 'fms_products:fms_charge_code',
      extractValue: (r: {
        recordId: string
        presenter?: { title?: string; subtitle?: string }
        fields?: Record<string, unknown>
      }) => {
        let code = ''

        if (r.fields?.code) {
          code = String(r.fields.code)
        }

        if (!code && r.presenter?.title) {
          const title = r.presenter.title
          if (title.length <= 15 && /^[A-Z][A-Z0-9_]*$/.test(title)) {
            code = title
          }
        }

        if (!code && r.presenter?.subtitle) {
          const firstPart = r.presenter.subtitle.split(' · ')[0]
          if (firstPart && firstPart.length <= 15 && /^[A-Z][A-Z0-9_]*$/.test(firstPart)) {
            code = firstPart
          }
        }

        const chargeUnit = r.fields?.chargeUnit
          ? String(r.fields.chargeUnit)
          : r.fields?.charge_unit
            ? String(r.fields.charge_unit)
            : null

        return JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
          code,
          chargeUnit,
        })
      },
      placeholder: 'Search charge codes...',
      minQueryLength: 2,
    }),
    []
  )

  // Renderers
  const chargeCodeRenderer = useMemo(() => createEntityRenderer('Select charge code...'), [])

  // Build columns
  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'name',
        title: 'Product Name *',
        width: 200,
      },
      {
        data: 'chargeCodeName',
        title: 'Charge Code',
        width: 160,
        renderer: chargeCodeRenderer,
        editor: createEntitySearchEditor(chargeCodeEditorConfig),
      },
      {
        data: 'chargeUnit',
        title: 'Charge Unit',
        width: 120,
        readOnly: true,
        renderer: (value: unknown) => {
          return <span className="text-gray-600">{formatChargeUnit(value as string)}</span>
        },
      },
    ]
  }, [chargeCodeRenderer, chargeCodeEditorConfig])

  // Transform product state to table row data
  const tableData = useMemo(
    () => [
      {
        id: 'header',
        name: product.name,
        chargeCodeName: product.chargeCodeId
          ? JSON.stringify({
              id: product.chargeCodeId,
              name: product.chargeCodeName || '',
              code: product.chargeCodeCode || '',
              chargeUnit: product.chargeUnit || '',
            })
          : '',
        chargeUnit: product.chargeUnit || '',
      },
    ],
    [product]
  )

  // Compute updates from field/value
  const computeUpdates = useCallback((field: string, value: unknown): Record<string, unknown> => {
    // Handle charge code selection
    if (field === 'chargeCodeName') {
      const parsed = parseJsonValue(value)
      if (parsed) {
        return {
          chargeCodeId: parsed.id,
          chargeCodeName: parsed.name,
          chargeCodeCode: parsed.code || null,
          chargeUnit: parsed.chargeUnit || null,
        }
      } else {
        return {
          chargeCodeId: null,
          chargeCodeName: String(value || '') || null,
          chargeCodeCode: null,
          chargeUnit: null,
        }
      }
    }

    // Handle other fields (name)
    return { [field]: value || null }
  }, [])

  // Event handlers for cell edits
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent, event?: Event) => {
        if (event && tableRef.current && !tableRef.current.contains(event.target as Node)) {
          return
        }

        const updates = computeUpdates(payload.prop, payload.newValue)
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
