'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createMultiSelectEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
  MultiSelectSelectedItem,
} from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { Product, CreateProductData } from './hooks/useProductWizard'

type ProductHeaderTableProps = {
  isCreateMode: boolean
  product: Product | null | undefined
  createModeData: Partial<CreateProductData>
  onUpdate: (updates: Partial<Product> | ((prev: Partial<CreateProductData>) => Partial<CreateProductData>)) => void
}

const PRODUCT_TYPE_OPTIONS = [
  { value: '', label: 'Select Type' },
  { value: 'GFRT', label: 'Freight (GFRT)' },
  { value: 'GTHC', label: 'THC (GTHC)' },
  { value: 'GBAF', label: 'BAF (GBAF)' },
  { value: 'GBAF_PIECE', label: 'BAF Piece (GBAF_PIECE)' },
  { value: 'GBOL', label: 'B/L (GBOL)' },
  { value: 'GCUS', label: 'Customs (GCUS)' },
  { value: 'CUSTOM', label: 'Custom (CUSTOM)' },
]

type ChargeCodeItem = {
  id: string
  code: string
  description: string | null
}

export function ProductHeaderTable({
  isCreateMode,
  product,
  createModeData,
  onUpdate,
}: ProductHeaderTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [chargeCodes, setChargeCodes] = useState<ChargeCodeItem[]>([])

  // Load charge codes
  useEffect(() => {
    const loadChargeCodes = async () => {
      const response = await apiCall<{ items: ChargeCodeItem[] }>('/api/fms_products/charge-codes?limit=100')
      if (response.ok && response.result?.items) {
        setChargeCodes(response.result.items)
      }
    }
    loadChargeCodes()
  }, [])

  // Service provider editor config
  const providerEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string }) => r.recordId,
    extractLabel: (r: { presenter?: { title?: string } }) => r.presenter?.title || '',
    extractItem: (r: { recordId: string; presenter?: { title?: string } }) => ({
      id: r.recordId,
      label: r.presenter?.title || '',
    }),
    placeholder: 'Search providers...',
    minQueryLength: 2,
    maxItems: 1, // Single selection
  }), [])

  // Provider renderer
  const providerRenderer = useCallback((value: unknown) => {
    if (!value) return <span className="text-gray-400">-</span>

    // Handle both array (from multi-select) and single object
    const providers = Array.isArray(value) ? value : [value]
    if (providers.length === 0) {
      return <span className="text-gray-400">-</span>
    }

    const provider = providers[0] as { id: string; label?: string; name?: string }
    return (
      <Badge variant="outline" className="text-xs">
        {provider.label || provider.name || provider.id}
      </Badge>
    )
  }, [])

  // Charge code renderer
  const chargeCodeRenderer = useCallback((value: unknown) => {
    if (!value) return <span className="text-gray-400">-</span>
    const valueStr = String(value)
    const cc = chargeCodes.find(c => c.id === valueStr || c.code === valueStr)
    return <span className="font-mono text-sm">{cc?.code || valueStr}</span>
  }, [chargeCodes])

  // Status renderer
  const statusRenderer = useCallback((value: unknown) => {
    const isActive = value === true || value === 'true' || value === 'Active'
    return (
      <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-green-100 text-green-800' : ''}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => {
    const cols: ColumnDef[] = [
      {
        data: 'name',
        title: 'Product Name',
        width: 200,
        type: 'text',
      },
      {
        data: 'productType',
        title: 'Type',
        width: 150,
        type: 'dropdown',
        source: PRODUCT_TYPE_OPTIONS.map(o => o.label),
        readOnly: !isCreateMode,
      },
      {
        data: 'chargeCodeId',
        title: 'Charge Code',
        width: 130,
        type: 'dropdown',
        source: chargeCodes.map(cc => cc.code),
        renderer: chargeCodeRenderer,
        readOnly: !isCreateMode,
      },
      {
        data: 'serviceProvider',
        title: 'Service Provider',
        width: 180,
        renderer: providerRenderer,
        editor: createMultiSelectEntitySearchEditor(providerEditorConfig),
        readOnly: !isCreateMode,
      },
      {
        data: 'isActive',
        title: 'Status',
        width: 100,
        type: 'dropdown',
        source: ['Active', 'Inactive'],
        renderer: statusRenderer,
      },
    ]
    return cols
  }, [isCreateMode, chargeCodes, chargeCodeRenderer, providerRenderer, providerEditorConfig, statusRenderer])

  const tableData = useMemo(() => {
    if (isCreateMode) {
      const typeOption = PRODUCT_TYPE_OPTIONS.find(o => o.value === createModeData.productType)
      return [{
        id: 'new',
        name: createModeData.name || '',
        productType: typeOption?.label || 'Select Type',
        chargeCodeId: chargeCodes.find(cc => cc.id === createModeData.chargeCodeId)?.code || '',
        serviceProvider: createModeData.serviceProviderId
          ? [{ id: createModeData.serviceProviderId, label: createModeData.serviceProviderName || '' }]
          : [],
        isActive: createModeData.isActive !== false ? 'Active' : 'Inactive',
      }]
    }

    const typeOption = PRODUCT_TYPE_OPTIONS.find(o => o.value === product?.productType)
    return [{
      id: product?.id || '',
      name: product?.name || '',
      productType: typeOption?.label || product?.productType || '',
      chargeCodeId: product?.chargeCodeCode || '',
      serviceProvider: product?.serviceProviderId
        ? [{ id: product.serviceProviderId, label: product.serviceProviderName }]
        : [],
      isActive: product?.isActive !== false ? 'Active' : 'Inactive',
    }]
  }, [isCreateMode, product, createModeData, chargeCodes])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    if (isCreateMode) {
      // In create mode, update local state
      onUpdate((prev: Partial<CreateProductData>) => {
        const updates: Partial<CreateProductData> = { ...prev }

        if (field === 'name') {
          updates.name = String(value || '')
        } else if (field === 'productType') {
          const option = PRODUCT_TYPE_OPTIONS.find(o => o.label === value)
          updates.productType = option?.value || ''
        } else if (field === 'chargeCodeId') {
          const cc = chargeCodes.find(c => c.code === value)
          updates.chargeCodeId = cc?.id || ''
        } else if (field === 'serviceProvider') {
          const providers = Array.isArray(value) ? value : []
          const provider = providers[0] as MultiSelectSelectedItem | undefined
          updates.serviceProviderId = provider?.id || ''
          updates.serviceProviderName = provider?.label || ''
        } else if (field === 'isActive') {
          updates.isActive = value === 'Active'
        }

        return updates
      })
    } else {
      // In edit mode, send to API
      const updates: Partial<Product> = {}

      if (field === 'name') {
        updates.name = String(value || '')
      } else if (field === 'serviceProvider') {
        const providers = Array.isArray(value) ? value : []
        const provider = providers[0] as MultiSelectSelectedItem | undefined
        updates.serviceProviderId = provider?.id || null
      } else if (field === 'isActive') {
        updates.isActive = value === 'Active'
      }

      if (Object.keys(updates).length > 0) {
        onUpdate(updates)
      }
    }
  }, [isCreateMode, onUpdate, chargeCodes])

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
    <div className="border rounded-lg" style={{ height: 90 }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Product Details"
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
  )
}
