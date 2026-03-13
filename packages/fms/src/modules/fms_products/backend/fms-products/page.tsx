'use client'

import * as React from 'react'
import { useCallback, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'

interface ProductRow {
  id: string
  name: string
  chargeCode: string | null
  chargeUnit: string | null
  transportMode: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

const CHARGE_UNIT_OPTIONS = [
  { value: 'container', label: 'Container' },
  { value: 'file', label: 'File' },
  { value: 'weight_measure', label: 'Weight Measure' },
  { value: 'cargo_value_percent', label: 'Cargo Value %' },
]

const TRANSPORT_MODE_OPTIONS = [
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'rail', label: 'Rail' },
]

const CHARGE_UNIT_COLORS: Record<string, { bg: string; text: string }> = {
  container: { bg: '#dbeafe', text: '#1e40af' },
  file: { bg: '#fef3c7', text: '#92400e' },
  weight_measure: { bg: '#e0e7ff', text: '#3730a3' },
  cargo_value_percent: { bg: '#fce7f3', text: '#9d174d' },
}

const TRANSPORT_MODE_COLORS: Record<string, { bg: string; text: string }> = {
  sea: { bg: '#dbeafe', text: '#1e40af' },
  air: { bg: '#f3e8ff', text: '#6b21a8' },
  rail: { bg: '#fef3c7', text: '#92400e' },
}

function PillRenderer({ value, options, colors }: {
  value: unknown
  options: { value: string; label: string }[]
  colors: Record<string, { bg: string; text: string }>
}) {
  const str = value as string
  if (!str) return null
  const opt = options.find((o) => o.value === str)
  const color = colors[str] ?? { bg: '#f1f5f9', text: '#475569' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: 500,
      backgroundColor: color.bg,
      color: color.text,
      lineHeight: '20px',
    }}>
      {opt?.label ?? str}
    </span>
  )
}

const PRODUCT_COLUMNS: ColumnDef[] = [
  {
    data: 'name',
    title: 'Product Name',
    width: 280,
    type: 'text',
  },
  {
    data: 'chargeCode',
    title: 'Charge Code',
    width: 130,
    type: 'text',
  },
  {
    data: 'chargeUnit',
    title: 'Charge Unit',
    width: 130,
    type: 'dropdown',
    source: CHARGE_UNIT_OPTIONS,
    renderer: (value: unknown) => (
      <PillRenderer value={value} options={CHARGE_UNIT_OPTIONS} colors={CHARGE_UNIT_COLORS} />
    ),
  },
  {
    data: 'transportMode',
    title: 'Transport Mode',
    width: 130,
    type: 'dropdown',
    source: TRANSPORT_MODE_OPTIONS,
    renderer: (value: unknown) => (
      <PillRenderer value={value} options={TRANSPORT_MODE_OPTIONS} colors={TRANSPORT_MODE_COLORS} />
    ),
  },
  {
    data: 'isActive',
    title: 'Active',
    width: 70,
    type: 'boolean',
  },
]

export default function ProductsPage() {
  const table = useDynamicTablePage<ProductRow>({
    source: '/api/fms_products/products',
    columns: PRODUCT_COLUMNS,
    tableName: 'Products',
    perspectives: 'fms_products',
    defaultSort: { field: 'name', direction: 'asc' },
    delete: { title: 'Delete Product', nameColumn: 'name' },
    create: {
      mapPayload: (rowData) => ({
        name: rowData.name || 'New Product',
        chargeCode: rowData.chargeCode || null,
        chargeUnit: rowData.chargeUnit || null,
        transportMode: rowData.transportMode || null,
        isActive: rowData.isActive !== false,
      }),
    },
    queryKey: 'fms_products',
    tableProps: {
      height: 'fill',
      keyboardShortcuts: {
        rowActions: [
          { id: 'delete', label: 'Delete product', key: 'd', ctrlOrCmd: true },
        ],
      },
      uiConfig: {
        enableFullscreen: true,
        borderless: true,
      },
    },
  })

  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as ProductRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          table.setRowToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete Product"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [table.setRowToDelete])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as ProductRow
    if (actionId === 'delete' && row.id) {
      table.setRowToDelete(row)
    }
  }, [table.setRowToDelete])

  if (table.isLoading) {
    return (
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TableSkeleton rows={10} columns={5} />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        actionsRenderer={actionsRenderer}
        onRowAction={handleRowAction}
      />
      {table.deleteDialog}
    </div>
  )
}
