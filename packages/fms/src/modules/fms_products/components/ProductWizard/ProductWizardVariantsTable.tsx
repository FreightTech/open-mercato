'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { useProductWizardContext } from './hooks/useProductWizardContext'
import { deriveProductType, isContainerBasedProduct } from '../../lib/productTypeHelpers'

const CONTAINER_SIZES = ['20DV', '40DV', '40HC', '45HC'] as const
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
  const { product, variants, addVariant, updateVariant, removeVariant } = useProductWizardContext()
  const tableRef = useRef<HTMLDivElement>(null)

  // Determine if container sizes apply based on charge code
  const productType = deriveProductType(product.chargeCodeCode)
  const showContainerSize = isContainerBasedProduct(productType)

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

  // Build columns
  const columns = useMemo((): ColumnDef[] => {
    const cols: ColumnDef[] = [
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
    ]

    // Add container size column if applicable
    if (showContainerSize) {
      cols.push({
        data: 'containerSize',
        title: 'Container',
        width: 90,
        type: 'dropdown',
        source: [...CONTAINER_SIZES],
      })
    }

    cols.push(
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
      }
    )

    return cols
  }, [showContainerSize, providerRenderer, providerEditorConfig])

  // Transform variants state to table row data
  const tableData = useMemo(
    () =>
      variants.map((variant) => ({
        id: variant.tempId,
        validityStart: variant.validityStart || '',
        validityEnd: variant.validityEnd || '',
        containerSize: variant.containerSize || '',
        reference: variant.reference || '',
        price: variant.price || '',
        currencyCode: variant.currencyCode || 'USD',
        priceType: variant.priceTypeName || '',
        providerName: variant.providerId
          ? JSON.stringify({ id: variant.providerId, name: variant.providerName || '' })
          : '',
      })),
    [variants]
  )

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

  // Event handlers for cell edits
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
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

  // Add variant button in toolbar
  const topBarEnd = useMemo(
    () => (
      <Button variant="outline" size="sm" onClick={() => addVariant()} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" />
        New Variant
      </Button>
    ),
    [addVariant]
  )

  // Calculate table height based on variant count
  const tableHeight = variants.length === 0 ? 80 : Math.max(120, 50 + variants.length * 35)

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Product Variants
      </h3>

      <div style={{ minHeight: tableHeight }}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Product Variants"
          idColumnName="id"
          width="100%"
          height="auto"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          actionsRenderer={variants.length > 0 ? actionsRenderer : undefined}
          uiConfig={{
            hideSearch: true,
            hideFilterButton: false,
            hideAddRowButton: true,
            hideBottomBar: true,
            topBarEnd,
          }}
        />
      </div>
    </div>
  )
}
