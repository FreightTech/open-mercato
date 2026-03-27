'use client'

import * as React from 'react'
import { useRef, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'
import { useDynamicTablePage } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import type { CargoType } from '../../data/mock'
import { StatusBadge } from '../../components/StatusBadge'
import { CreateFileDialog } from '../../components/CreateFileDialog'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveNestedValue(rowData: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = rowData
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ─── Renderers ────────────────────────────────────────────────────────────────

const RENDERERS: Record<string, (value: unknown, rowData: Record<string, unknown>) => React.ReactNode> = {
  referenceNumber: (value) =>
    React.createElement('span', { className: 'font-mono text-xs text-foreground' }, value as string),

  transportStatus: (_value, rowData) => {
    const status = resolveNestedValue(rowData, 'status.transport') as string | undefined
    return status ? React.createElement(StatusBadge, { status, kind: 'transport' }) : null
  },

  financialStatus: (_value, rowData) => {
    const status = resolveNestedValue(rowData, 'status.financial') as string | undefined
    return status ? React.createElement(StatusBadge, { status, kind: 'financial' }) : null
  },

  documentationStatus: (_value, rowData) => {
    const status = resolveNestedValue(rowData, 'status.documentation') as string | undefined
    return status ? React.createElement(StatusBadge, { status, kind: 'documentation' }) : null
  },

  cargoType: (value) => {
    const ct = value as CargoType
    const color = ct === 'FCL'
      ? 'text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700'
      : 'text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700'
    return React.createElement('span', {
      className: `inline-flex px-1.5 rounded text-[10px] font-semibold border ${color}`,
    }, ct)
  },

  shipmentType: (value) =>
    React.createElement('span', {
      className: 'inline-flex px-1.5 rounded text-[10px] font-medium border border-border text-muted-foreground',
    }, value as string),
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FmsFilesListPage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Fetch table config
  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fms-files-table-config'],
    queryFn: async () => {
      const response = await apiCall<{ columns: Array<{ data: string; title: string; width: number; type?: string; readOnly?: boolean; renderer?: string }> }>('/api/fms_files/files/table-config')
      if (!response.ok) throw new Error('Failed to load table config')
      return response.result
    },
  })

  // Build columns with renderers
  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col) => {
      const renderer = col.renderer ? RENDERERS[col.renderer] : undefined
      return {
        ...col,
        renderer,
      } as ColumnDef
    })
  }, [tableConfig])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open file', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: Record<string, unknown>) => {
    if (actionId === 'view') {
      const fileId = rowData.id as string
      if (fileId) {
        router.push(`/backend/fms-files/${fileId}`)
      }
    }
  }, [router])

  // useDynamicTablePage for data fetching from real API
  const table = useDynamicTablePage({
    source: '/api/fms_files/files',
    columns,
    tableName: 'FMS Files (New)',
    perspectives: 'fms-files',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    defaultPageSize: 100,
    queryKey: 'fms-files',
    tableProps: {
      height: 'fill',
      keyboardShortcuts,
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        borderless: true,
      },
    },
  })

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9 flex flex-col h-full">
      <div className="flex justify-end px-4 lg:px-6 py-2">
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          New File
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <DynamicTable
          {...table.props}
          onRowAction={handleRowAction}
          onRowClick={(_, rowData) => router.push(`/backend/fms-files/${rowData.id as string}`)}
          pagination={{
            ...table.props.pagination!,
            limitOptions: [50, 100, 200],
          }}
        />
      </div>
      <CreateFileDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
