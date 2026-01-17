'use client'

import * as React from 'react'
import { useState, useRef, useMemo, useCallback } from 'react'
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
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { ProductVariant, VariantPrice } from './hooks/useProductWizard'
import { useVariantPrices } from './hooks/useVariantPrices'
import { AddVariantModal } from './AddVariantModal'
import { AddPriceModal } from './AddPriceModal'

type ProductVariantsSectionProps = {
  productId: string
  productType: string
  variants: ProductVariant[]
  isLoading: boolean
  defaultVariantType: 'container' | 'simple'
  onAddVariant: (data?: any) => Promise<any>
  onUpdateVariant: (id: string, updates: any) => void
  onRemoveVariant: (id: string) => Promise<any>
}

// Variant prices sub-table component
function VariantPricesTable({
  variantId,
  productId,
  onError,
}: {
  variantId: string
  productId: string
  onError?: (error: string) => void
}) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [showAddPriceModal, setShowAddPriceModal] = useState(false)

  const {
    prices,
    isLoading,
    addPrice,
    updatePrice,
    removePrice,
  } = useVariantPrices({ variantId, productId, onError })

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'validityStart',
      title: 'Valid From',
      width: 120,
      type: 'date',
    },
    {
      data: 'validityEnd',
      title: 'Valid Until',
      width: 120,
      type: 'date',
    },
    {
      data: 'contractType',
      title: 'Contract',
      width: 100,
      type: 'dropdown',
      source: ['SPOT', 'NAC', 'BASKET'],
    },
    {
      data: 'contractNumber',
      title: 'Contract #',
      width: 120,
      type: 'text',
    },
    {
      data: 'price',
      title: 'Price',
      width: 100,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: 'Ccy',
      width: 80,
      type: 'dropdown',
      source: ['USD', 'EUR', 'PLN', 'CNY', 'GBP'],
    },
    {
      data: 'isActive',
      title: 'Active',
      width: 80,
      type: 'dropdown',
      source: ['Yes', 'No'],
    },
  ], [])

  const tableData = useMemo(() => {
    return prices.map((p) => ({
      id: p.id,
      validityStart: p.validityStart ? new Date(p.validityStart).toISOString().split('T')[0] : '',
      validityEnd: p.validityEnd ? new Date(p.validityEnd).toISOString().split('T')[0] : '',
      contractType: p.contractType,
      contractNumber: p.contractNumber || '',
      price: p.price,
      currencyCode: p.currencyCode,
      isActive: p.isActive ? 'Yes' : 'No',
    }))
  }, [prices])

  const handleCellChange = useCallback((id: string, field: string, value: unknown) => {
    const updates: Record<string, unknown> = {}

    if (field === 'validityStart' || field === 'validityEnd') {
      updates[field] = value ? String(value) : null
    } else if (field === 'isActive') {
      updates.isActive = value === 'Yes'
    } else if (field === 'price') {
      updates.price = value
    } else {
      updates[field] = value
    }

    updatePrice(id, updates)
  }, [updatePrice])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          if (payload.id) {
            handleCellChange(payload.id, payload.prop, payload.newValue)
          }

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

  const handleAddPrice = async (data: {
    validityStart: string
    validityEnd?: string | null
    contractType: 'SPOT' | 'NAC' | 'BASKET'
    contractNumber?: string | null
    price: number
    currencyCode: string
  }) => {
    await addPrice(data)
    setShowAddPriceModal(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-gray-500">Loading prices...</span>
      </div>
    )
  }

  return (
    <div className="ml-8 mb-4 p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700">
          Prices ({prices.length})
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddPriceModal(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Price
        </Button>
      </div>

      {prices.length > 0 ? (
        <div style={{ height: Math.min(200, 60 + prices.length * 40) }}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName="Prices"
            idColumnName="id"
            width="100%"
            height="100%"
            colHeaders={true}
            rowHeaders={false}
            stretchColumns={true}
            actionsRenderer={(rowData) => (
              <button
                onClick={() => removePrice(rowData.id as string)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete price"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            uiConfig={{
              hideToolbar: true,
              hideSearch: true,
              hideFilterButton: true,
              hideAddRowButton: true,
              hideBottomBar: true,
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">
          No prices yet. Click "Add Price" to create one.
        </p>
      )}

      <AddPriceModal
        open={showAddPriceModal}
        onClose={() => setShowAddPriceModal(false)}
        onSubmit={handleAddPrice}
      />
    </div>
  )
}

export function ProductVariantsSection({
  productId,
  productType,
  variants,
  isLoading,
  defaultVariantType,
  onAddVariant,
  onUpdateVariant,
  onRemoveVariant,
}: ProductVariantsSectionProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null)
  const [showAddVariantModal, setShowAddVariantModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isContainerType = productType === 'GFRT' || productType === 'GTHC'

  // Different columns for container vs simple variants
  const columns = useMemo((): ColumnDef[] => {
    if (isContainerType) {
      return [
        {
          data: 'containerSize',
          title: 'Size',
          width: 100,
          type: 'dropdown',
          source: ['20GP', '40GP', '40HC', '45HC'],
        },
        {
          data: 'containerType',
          title: 'Type',
          width: 100,
          type: 'text',
        },
        {
          data: 'name',
          title: 'Name',
          width: 150,
          type: 'text',
        },
        {
          data: 'isDefault',
          title: 'Default',
          width: 80,
          type: 'dropdown',
          source: ['Yes', 'No'],
        },
        {
          data: 'isActive',
          title: 'Active',
          width: 80,
          type: 'dropdown',
          source: ['Yes', 'No'],
        },
        {
          data: 'priceCount',
          title: 'Prices',
          width: 80,
          type: 'numeric',
          readOnly: true,
        },
      ]
    }

    return [
      {
        data: 'name',
        title: 'Variant Name',
        width: 200,
        type: 'text',
      },
      {
        data: 'isDefault',
        title: 'Default',
        width: 80,
        type: 'dropdown',
        source: ['Yes', 'No'],
      },
      {
        data: 'isActive',
        title: 'Active',
        width: 80,
        type: 'dropdown',
        source: ['Yes', 'No'],
      },
      {
        data: 'priceCount',
        title: 'Prices',
        width: 80,
        type: 'numeric',
        readOnly: true,
      },
    ]
  }, [isContainerType])

  const tableData = useMemo(() => {
    return variants.map((v) => ({
      id: v.id,
      name: v.name || '',
      containerSize: v.containerSize || '',
      containerType: v.containerType || '',
      isDefault: v.isDefault ? 'Yes' : 'No',
      isActive: v.isActive ? 'Yes' : 'No',
      priceCount: v.priceCount,
    }))
  }, [variants])

  const handleCellChange = useCallback((id: string, field: string, value: unknown) => {
    const updates: Record<string, unknown> = {}

    if (field === 'isDefault' || field === 'isActive') {
      updates[field] = value === 'Yes'
    } else {
      updates[field] = value
    }

    onUpdateVariant(id, updates)
  }, [onUpdateVariant])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          if (payload.id) {
            handleCellChange(payload.id, payload.prop, payload.newValue)
          }

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Update failed'
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

  const handleAddVariant = async (data: any) => {
    await onAddVariant({
      variantType: defaultVariantType,
      ...data,
    })
    setShowAddVariantModal(false)
  }

  const toggleExpand = (variantId: string) => {
    setExpandedVariantId((prev) => (prev === variantId ? null : variantId))
  }

  const actionsRenderer = useCallback((rowData: Record<string, unknown>) => {
    const variantId = rowData.id as string
    const isExpanded = expandedVariantId === variantId
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleExpand(variantId)}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title={isExpanded ? 'Collapse prices' : 'Expand prices'}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => onRemoveVariant(variantId)}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete variant"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [expandedVariantId, onRemoveVariant])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Variants ({variants.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddVariantModal(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Variant
        </Button>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-gray-500">Loading variants...</span>
        </div>
      ) : variants.length > 0 ? (
        <div className="space-y-2">
          <div className="border rounded-lg" style={{ height: Math.min(300, 60 + variants.length * 40) }}>
            <DynamicTable
              tableRef={tableRef}
              data={tableData}
              columns={columns}
              tableName="Variants"
              idColumnName="id"
              width="100%"
              height="100%"
              colHeaders={true}
              rowHeaders={false}
              stretchColumns={true}
              actionsRenderer={actionsRenderer}
              uiConfig={{
                hideToolbar: true,
                hideSearch: true,
                hideFilterButton: true,
                hideAddRowButton: true,
                hideBottomBar: true,
              }}
            />
          </div>

          {/* Expanded prices panel */}
          {expandedVariantId && (
            <VariantPricesTable
              variantId={expandedVariantId}
              productId={productId}
              onError={setError}
            />
          )}
        </div>
      ) : (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">
            No variants yet. Click "Add Variant" to create one.
          </p>
          <Button onClick={() => setShowAddVariantModal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add First Variant
          </Button>
        </div>
      )}

      <AddVariantModal
        open={showAddVariantModal}
        onClose={() => setShowAddVariantModal(false)}
        onSubmit={handleAddVariant}
        variantType={defaultVariantType}
      />
    </div>
  )
}
