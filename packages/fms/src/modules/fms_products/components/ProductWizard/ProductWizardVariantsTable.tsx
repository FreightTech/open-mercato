'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
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
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useProductWizardContext } from './hooks/useProductWizardContext'

const CONTAINER_SIZES = ['20DV', '40DV', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT'] as const
const CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'CHF', 'CNY', 'JPY'] as const
const PRICE_TYPES = ['Buy', 'Sell', 'Cost', 'List', 'Discount'] as const

/**
 * Parse JSON value from EntitySearchEditor
 * Returns parsed object with id/name or null if not valid JSON
 */
function parseJsonValue(value: unknown): { id: string; name: string } | null {
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

export function ProductWizardVariantsTable() {
  const { variants, updateVariant, removeVariant, addVariantWithRealId, persistedProductId, mode } =
    useProductWizardContext()
  const tableRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')


  // Provider (contractor) editor config
  const providerEditorConfig = useMemo(
    () => ({
      entityType: 'contractors:contractor',
      extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
        JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
      placeholder: 'Search providers...',
      minQueryLength: 2,
    }),
    []
  )

  // Renderers
  const providerRenderer = useMemo(() => createEntityRenderer('Select provider...'), [])

  // Build columns - always include container size
  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'validityStart',
        title: 'Valid From',
        width: 110,
        type: 'date',
      },
      {
        data: 'validityEnd',
        title: 'Valid To',
        width: 110,
        type: 'date',
      },
      {
        data: 'containerSize',
        title: 'Container',
        width: 90,
        type: 'dropdown',
        source: [...CONTAINER_SIZES],
      },
      {
        data: 'reference',
        title: 'Reference',
        width: 120,
      },
      {
        data: 'price',
        title: 'Price',
        width: 100,
        type: 'numeric',
      },
      {
        data: 'currencyCode',
        title: 'Currency',
        width: 80,
        type: 'dropdown',
        source: [...CURRENCIES],
      },
      {
        data: 'priceType',
        title: 'Price Type',
        width: 100,
        type: 'dropdown',
        source: [...PRICE_TYPES],
      },
      {
        data: 'providerName',
        title: 'Provider',
        width: 140,
        renderer: providerRenderer,
        editor: createEntitySearchEditor(providerEditorConfig),
      },
    ]
  }, [providerRenderer, providerEditorConfig])

  // Transform variants state to table row data
  const tableData = useMemo(() => {
    const data = variants.map((variant) => ({
      // Use realId if available (persisted variants), otherwise tempId
      id: variant.realId || variant.tempId,
      validityStart: variant.validityStart || '',
      validityEnd: variant.validityEnd || '',
      containerSize: variant.containerSize || '',
      reference: variant.reference || '',
      price: variant.price || '',
      currencyCode: variant.currencyCode || 'USD',
      priceType: variant.priceTypeName || '',
      providerName: variant.providerId
        ? JSON.stringify({ id: variant.providerId, name: variant.providerName || '' })
        : variant.providerName || '',
    }))

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      return data.filter((row) => {
        return (
          row.reference?.toLowerCase().includes(query) ||
          row.containerSize?.toLowerCase().includes(query) ||
          row.priceType?.toLowerCase().includes(query) ||
          row.price?.toLowerCase().includes(query) ||
          row.currencyCode?.toLowerCase().includes(query) ||
          (row.providerName && row.providerName.toLowerCase().includes(query))
        )
      })
    }

    return data
  }, [variants, searchQuery])

  // Handle cell changes
  const handleVariantCellChange = useCallback(
    (variantId: string, field: string, value: unknown) => {
      // Handle price type selection (simple string)
      if (field === 'priceType') {
        updateVariant(variantId, { priceTypeName: String(value || '') || null })
        return
      }

      // Handle provider selection
      if (field === 'providerName') {
        const parsed = parseJsonValue(value)
        if (parsed) {
          updateVariant(variantId, { providerId: parsed.id, providerName: parsed.name })
        } else {
          updateVariant(variantId, {
            providerId: null,
            providerName: String(value || '') || null,
          })
        }
        return
      }

      // Handle other fields
      updateVariant(variantId, { [field]: value || null })
    },
    [updateVariant]
  )

  // Event handlers for cell edits, new row saves, and search
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent, event?: Event) => {
        // Only handle events from this table (prevent event bubbling from other tables)
        if (event && tableRef.current && !tableRef.current.contains(event.target as Node)) {
          return
        }

        const variantId = payload.id as string

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          handleVariantCellChange(variantId, payload.prop, payload.newValue)

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
      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent, event?: Event) => {
        // Only handle events from this table
        if (event && tableRef.current && !tableRef.current.contains(event.target as Node)) {
          return
        }

        if (!persistedProductId) {
          flash('Product must be created first before adding variants', 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: 'Product must be created first',
          } as NewRowSaveErrorEvent)
          return
        }

        // Parse provider data if it's JSON
        let providerId: string | null = null
        const providerValue = payload.rowData.providerName
        if (providerValue) {
          const parsed = parseJsonValue(providerValue)
          if (parsed) {
            providerId = parsed.id
          }
        }

        // Build variant data from row
        // Ensure price is a string (API expects string)
        const priceValue = payload.rowData.price
        const priceString = priceValue != null && priceValue !== '' ? String(priceValue) : null

        const variantData = {
          validityStart: payload.rowData.validityStart || null,
          validityEnd: payload.rowData.validityEnd || null,
          containerSize: payload.rowData.containerSize || null,
          reference: payload.rowData.reference || null,
          price: priceString,
          currencyCode: payload.rowData.currencyCode || 'USD',
          priceTypeId: null,
          providerId,
          isActive: true,
        }

        try {
          const response = await apiCall<{ id: string }>(
            `/api/fms_products/products/${persistedProductId}/variants`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(variantData),
            }
          )

          if (response.ok && response.result?.id) {
            // Parse provider name for context storage
            let providerName: string | null = null
            if (providerValue) {
              const parsed = parseJsonValue(providerValue)
              if (parsed) {
                providerName = parsed.name
              }
            }

            // Add to context with the real ID
            addVariantWithRealId(response.result.id, {
              validityStart: variantData.validityStart,
              validityEnd: variantData.validityEnd,
              containerSize: variantData.containerSize,
              reference: variantData.reference,
              price: priceString,
              currencyCode: variantData.currencyCode,
              priceTypeId: null,
              priceTypeName: payload.rowData.priceType || null,
              providerId,
              providerName,
              isActive: true,
            })

            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...payload.rowData, id: response.result.id },
            } as NewRowSaveSuccessEvent)

            flash('Variant created', 'success')
          } else {
            throw new Error('Failed to create variant')
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create variant'
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },
      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearchQuery(payload.query)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Actions renderer for delete button
  const actionsRenderer = useCallback(
    (rowData: Record<string, unknown>) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => removeVariant(rowData.id as string)}
        className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    ),
    [removeVariant]
  )

  // Calculate table height - larger for edit mode with many variants
  const minTableHeight = mode === 'edit' ? 200 : 80
  const tableHeight =
    tableData.length === 0 ? minTableHeight : Math.max(minTableHeight, 50 + tableData.length * 35)

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Product Variants
      </h3>

      <div style={{ minHeight: tableHeight, maxHeight: 400 }}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Product Variants"
          idColumnName="id"
          width="100%"
          height={Math.min(tableHeight, 400)}
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          actionsRenderer={actionsRenderer}
          uiConfig={{
            hideSearch: false,
            hideFilterButton: true,
            hideAddRowButton: false,
            hideBottomBar: true,
          }}
        />
      </div>
    </div>
  )
}
