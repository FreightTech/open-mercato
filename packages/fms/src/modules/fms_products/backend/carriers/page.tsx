'use client'

import * as React from 'react'
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

interface FmsCarrierRow {
  id: string
  code: string
  name: string
  carrierType: 'sea' | 'air' | 'rail' | 'road'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const getCarrierTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    sea: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    air: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    rail: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    road: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  }
  return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
}

const getCarrierTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    sea: 'Sea',
    air: 'Air',
    rail: 'Rail',
    road: 'Road',
  }
  return labels[type] || type
}

const CarrierTypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span
      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getCarrierTypeColor(value)}`}
    >
      {getCarrierTypeLabel(value)}
    </span>
  )
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CarrierTypeRenderer: (value) => <CarrierTypeRenderer value={value} />,
}

async function fetchTableConfig() {
  const response = await apiCall<{ columns: ColumnDef[] }>('/api/fms_products/carriers/table-config')
  if (!response.ok) throw new Error('Failed to load table config')
  return response.result
}

export default function CarriersPage() {
  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['tableConfig', 'fms_carriers'],
    queryFn: fetchTableConfig,
  })

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col) => {
      const rendererName = col.renderer as string | undefined
      return {
        ...col,
        type: (col.type as string) === 'checkbox' ? 'boolean' : col.type,
        renderer: rendererName && rendererName in RENDERERS
          ? RENDERERS[rendererName as keyof typeof RENDERERS]
          : undefined,
      }
    }) as ColumnDef[]
  }, [tableConfig])

  const table = useDynamicTablePage<FmsCarrierRow>({
    source: '/api/fms_products/carriers',
    columns,
    tableName: 'Carriers',
    perspectives: 'fms_products_carriers',
    defaultSort: { field: 'name', direction: 'asc' },
    delete: { title: 'Delete Carrier', nameColumn: 'code' },
    create: {
      mapPayload: (rowData) => ({
        name: rowData.name,
        carrierType: rowData.carrierType,
        isActive: rowData.isActive === true,
      }),
    },
    queryKey: 'fms_carriers',
    tableProps: {
      height: 'fill',
      stretchColumns: true,
      uiConfig: { borderless: true },
      keyboardShortcuts: {
        rowActions: [
          { id: 'delete', label: 'Delete carrier', key: 'd', ctrlOrCmd: true },
        ],
      },
    },
  })

  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FmsCarrierRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          table.setRowToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [table.setRowToDelete])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FmsCarrierRow
    if (actionId === 'delete' && row.id) {
      table.setRowToDelete(row)
    }
  }, [table.setRowToDelete])

  if (configLoading || table.isLoading) {
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
