'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
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
import type { Product, CreateProductData } from './hooks/useProductWizard'

type ProductTypeFieldsTableProps = {
  productType: string
  isCreateMode: boolean
  product: Product | null | undefined
  createModeData: Partial<CreateProductData>
  onUpdate: (updates: Partial<Product> | ((prev: Partial<CreateProductData>) => Partial<CreateProductData>)) => void
}

type LocationRef = {
  id: string
  label?: string
  locode?: string
  name?: string
}

export function ProductTypeFieldsTable({
  productType,
  isCreateMode,
  product,
  createModeData,
  onUpdate,
}: ProductTypeFieldsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  // Location editor config
  const locationEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string }) => r.recordId,
    extractLabel: (r: { presenter?: { title?: string } }) => r.presenter?.title || '',
    extractItem: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) => ({
      id: r.recordId,
      label: r.presenter?.title || '',
      locode: r.fields?.locode as string | undefined,
      name: r.fields?.name as string | undefined,
    }),
    placeholder: 'Search locations...',
    minQueryLength: 2,
    maxItems: 1, // Single selection
  }), [])

  // Location renderer
  const locationRenderer = useCallback((value: unknown) => {
    if (!value) return <span className="text-gray-400">-</span>

    const locations = Array.isArray(value) ? value : [value]
    if (locations.length === 0) {
      return <span className="text-gray-400">-</span>
    }

    const location = locations[0] as LocationRef
    return (
      <Badge variant="outline" className="text-xs">
        {location.locode || location.label || location.name || location.id}
      </Badge>
    )
  }, [])

  // Get columns based on product type
  const columns = useMemo((): ColumnDef[] => {
    switch (productType) {
      case 'GFRT':
        return [
          {
            data: 'loop',
            title: 'Service Loop',
            width: 120,
            type: 'text',
          },
          {
            data: 'source',
            title: 'Origin',
            width: 180,
            renderer: locationRenderer,
            editor: createMultiSelectEntitySearchEditor(locationEditorConfig),
          },
          {
            data: 'destination',
            title: 'Destination',
            width: 180,
            renderer: locationRenderer,
            editor: createMultiSelectEntitySearchEditor(locationEditorConfig),
          },
          {
            data: 'transitTime',
            title: 'Transit (days)',
            width: 100,
            type: 'numeric',
          },
          {
            data: 'description',
            title: 'Description',
            width: 200,
            type: 'text',
          },
        ]
      case 'GTHC':
        return [
          {
            data: 'location',
            title: 'Terminal Location',
            width: 200,
            renderer: locationRenderer,
            editor: createMultiSelectEntitySearchEditor(locationEditorConfig),
          },
          {
            data: 'description',
            title: 'Description',
            width: 300,
            type: 'text',
          },
        ]
      default:
        // GBAF, GBAF_PIECE, GBOL, GCUS, CUSTOM
        return [
          {
            data: 'description',
            title: 'Description',
            width: 500,
            type: 'text',
          },
        ]
    }
  }, [productType, locationRenderer, locationEditorConfig])

  // Build table data based on product type
  const tableData = useMemo(() => {
    if (isCreateMode) {
      const data: Record<string, unknown> = { id: 'new' }

      if (productType === 'GFRT') {
        data.loop = createModeData.loop || ''
        data.source = createModeData.sourceId ? [{ id: createModeData.sourceId }] : []
        data.destination = createModeData.destinationId ? [{ id: createModeData.destinationId }] : []
        data.transitTime = createModeData.transitTime ?? ''
        data.description = createModeData.description || ''
      } else if (productType === 'GTHC') {
        data.location = createModeData.locationId ? [{ id: createModeData.locationId }] : []
        data.description = createModeData.description || ''
      } else {
        data.description = createModeData.description || ''
      }

      return [data]
    }

    const data: Record<string, unknown> = { id: product?.id || '' }

    if (productType === 'GFRT') {
      data.loop = (product as any)?.loop || ''
      data.source = (product as any)?.sourceId
        ? [{ id: (product as any).sourceId, label: (product as any).sourceName }]
        : []
      data.destination = (product as any)?.destinationId
        ? [{ id: (product as any).destinationId, label: (product as any).destinationName }]
        : []
      data.transitTime = (product as any)?.transitTime ?? ''
      data.description = (product as any)?.description || ''
    } else if (productType === 'GTHC') {
      data.location = (product as any)?.locationId
        ? [{ id: (product as any).locationId, label: (product as any).locationName }]
        : []
      data.description = (product as any)?.description || ''
    } else {
      data.description = (product as any)?.description || ''
    }

    return [data]
  }, [isCreateMode, product, createModeData, productType])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    if (isCreateMode) {
      onUpdate((prev: Partial<CreateProductData>) => {
        const updates: Partial<CreateProductData> = { ...prev }

        if (field === 'loop') {
          updates.loop = String(value || '')
        } else if (field === 'source') {
          const locations = Array.isArray(value) ? value : []
          const location = locations[0] as MultiSelectSelectedItem | undefined
          updates.sourceId = location?.id || undefined
        } else if (field === 'destination') {
          const locations = Array.isArray(value) ? value : []
          const location = locations[0] as MultiSelectSelectedItem | undefined
          updates.destinationId = location?.id || undefined
        } else if (field === 'transitTime') {
          const parsedValue = Number.parseInt(String(value), 10)
          updates.transitTime = Number.isNaN(parsedValue) ? null : parsedValue
        } else if (field === 'location') {
          const locations = Array.isArray(value) ? value : []
          const location = locations[0] as MultiSelectSelectedItem | undefined
          updates.locationId = location?.id || undefined
        } else if (field === 'description') {
          updates.description = String(value || '') || null
        }

        return updates
      })
    } else {
      const updates: Partial<Product> = {}

      if (field === 'loop') {
        (updates as any).loop = String(value || '')
      } else if (field === 'source') {
        const locations = Array.isArray(value) ? value : []
        const location = locations[0] as MultiSelectSelectedItem | undefined
        (updates as any).sourceId = location?.id || null
      } else if (field === 'destination') {
        const locations = Array.isArray(value) ? value : []
        const location = locations[0] as MultiSelectSelectedItem | undefined
        (updates as any).destinationId = location?.id || null
      } else if (field === 'transitTime') {
        const strVal = String(value)
        const parsedVal = strVal ? +strVal : NaN
        ;(updates as any).transitTime = !parsedVal && parsedVal !== 0 ? null : Math.floor(parsedVal)
      } else if (field === 'location') {
        const locations = Array.isArray(value) ? value : []
        const location = locations[0] as MultiSelectSelectedItem | undefined
        (updates as any).locationId = location?.id || null
      } else if (field === 'description') {
        (updates as any).description = String(value || '') || null
      }

      if (Object.keys(updates).length > 0) {
        onUpdate(updates)
      }
    }
  }, [isCreateMode, onUpdate])

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

  if (columns.length === 0) {
    return null
  }

  return (
    <div className="border rounded-lg" style={{ height: 90 }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Type Details"
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
