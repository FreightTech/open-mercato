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
 * Returns parsed object with id/name/code or null if not valid JSON
 */
function parseJsonValue(value: unknown): { id: string; name: string; code?: string } | null {
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
  const { product, updateProduct } = useProductWizardContext()
  const tableRef = useRef<HTMLDivElement>(null)

  // Carrier editor config
  const carrierEditorConfig = useMemo(
    () => ({
      entityType: 'fms_products:fms_carrier',
      extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
        JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
      placeholder: 'Search carriers...',
      minQueryLength: 2,
    }),
    []
  )

  // Charge code editor config - include code for product type derivation
  const chargeCodeEditorConfig = useMemo(
    () => ({
      entityType: 'fms_products:fms_charge_code',
      extractValue: (r: {
        recordId: string
        presenter?: { title?: string }
        fields?: Record<string, unknown>
      }) =>
        JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
          code: r.fields?.code || '',
        }),
      placeholder: 'Search charge codes...',
      minQueryLength: 2,
    }),
    []
  )

  // Location editor config (for origin, destination)
  const locationEditorConfig = useMemo(
    () => ({
      entityType: 'fms_locations:fms_location',
      extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
        JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
      placeholder: 'Search locations...',
      minQueryLength: 2,
    }),
    []
  )

  // Renderers
  const carrierRenderer = useMemo(() => createEntityRenderer('Select carrier...'), [])
  const chargeCodeRenderer = useMemo(() => createEntityRenderer('Select charge code...'), [])
  const locationRenderer = useMemo(() => createEntityRenderer('Select location...'), [])

  // Build columns - always show all fields
  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'name',
        title: 'Product Name *',
        width: 160,
      },
      {
        data: 'chargeCodeName',
        title: 'Charge Code *',
        width: 140,
        renderer: chargeCodeRenderer,
        editor: createEntitySearchEditor(chargeCodeEditorConfig),
      },
      {
        data: 'carrierName',
        title: 'Carrier',
        width: 130,
        renderer: carrierRenderer,
        editor: createEntitySearchEditor(carrierEditorConfig),
      },
      {
        data: 'loop',
        title: 'Service Loop',
        width: 100,
      },
      {
        data: 'sourceName',
        title: 'Origin',
        width: 130,
        renderer: locationRenderer,
        editor: createEntitySearchEditor(locationEditorConfig),
      },
      {
        data: 'destinationName',
        title: 'Destination',
        width: 130,
        renderer: locationRenderer,
        editor: createEntitySearchEditor(locationEditorConfig),
      },
      {
        data: 'transitTime',
        title: 'Transit (days)',
        width: 80,
        type: 'numeric',
      },
    ]
  }, [
    carrierRenderer,
    chargeCodeRenderer,
    locationRenderer,
    carrierEditorConfig,
    chargeCodeEditorConfig,
    locationEditorConfig,
  ])

  // Transform product state to table row data
  const tableData = useMemo(
    () => [
      {
        id: 'header',
        name: product.name,
        carrierName: product.carrierId
          ? JSON.stringify({ id: product.carrierId, name: product.carrierName || '' })
          : '',
        chargeCodeName: product.chargeCodeId
          ? JSON.stringify({
              id: product.chargeCodeId,
              name: product.chargeCodeName || '',
              code: product.chargeCodeCode || '',
            })
          : '',
        loop: product.loop || '',
        sourceName: product.sourceId
          ? JSON.stringify({ id: product.sourceId, name: product.sourceName || '' })
          : '',
        destinationName: product.destinationId
          ? JSON.stringify({ id: product.destinationId, name: product.destinationName || '' })
          : '',
        transitTime: product.transitTime ?? '',
      },
    ],
    [product]
  )

  // Handle cell changes
  const handleCellChange = useCallback(
    (field: string, value: unknown) => {
      // Handle carrier selection
      if (field === 'carrierName') {
        const parsed = parseJsonValue(value)
        if (parsed) {
          updateProduct({ carrierId: parsed.id, carrierName: parsed.name })
        } else {
          updateProduct({ carrierId: null, carrierName: String(value || '') || null })
        }
        return
      }

      // Handle charge code selection - extract code for product type derivation
      if (field === 'chargeCodeName') {
        const parsed = parseJsonValue(value)
        if (parsed) {
          updateProduct({
            chargeCodeId: parsed.id,
            chargeCodeName: parsed.name,
            chargeCodeCode: parsed.code || null,
          })
        } else {
          updateProduct({
            chargeCodeId: null,
            chargeCodeName: String(value || '') || null,
            chargeCodeCode: null,
          })
        }
        return
      }

      // Handle origin selection
      if (field === 'sourceName') {
        const parsed = parseJsonValue(value)
        if (parsed) {
          updateProduct({ sourceId: parsed.id, sourceName: parsed.name })
        } else {
          updateProduct({ sourceId: null, sourceName: String(value || '') || null })
        }
        return
      }

      // Handle destination selection
      if (field === 'destinationName') {
        const parsed = parseJsonValue(value)
        if (parsed) {
          updateProduct({ destinationId: parsed.id, destinationName: parsed.name })
        } else {
          updateProduct({ destinationId: null, destinationName: String(value || '') || null })
        }
        return
      }

      // Handle transit time (numeric)
      if (field === 'transitTime') {
        const numValue = value !== '' && value !== null ? parseInt(String(value), 10) : null
        updateProduct({ transitTime: isNaN(numValue as number) ? null : numValue })
        return
      }

      // Handle other fields (name, loop)
      updateProduct({ [field]: value || null })
    },
    [updateProduct]
  )

  // Event handlers for cell edits
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
          }}
        />
      </div>
    </div>
  )
}
