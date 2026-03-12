'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  KeyboardShortcutsConfig,
  CellEditSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import { SeaContainerDetailsDrawer } from '../../../fms_projects/components/SeaContainers/SeaContainerDetailsDrawer'
import { CombinedTimestampCell, type TimestampEntry } from '../../../fms_projects/components/SeaContainers/CombinedTimestampCell'

// Map location display name columns to their corresponding FK ID fields
const LOCATION_FIELD_MAP: Record<string, string> = {
  placeOfLoadingName: 'placeOfLoadingId',
  portOfLoadingName: 'portOfLoadingId',
  portOfDestinationName: 'portOfDestinationId',
  placeOfDeliveryName: 'placeOfDeliveryId',
}

const LOCATION_COLUMNS = new Set([
  'placeOfLoadingName',
  'portOfLoadingName',
  'portOfDestinationName',
  'placeOfDeliveryName',
])

const LOCATION_PLACEHOLDERS: Record<string, string> = {
  placeOfLoadingName: 'Select place of loading...',
  portOfLoadingName: 'Select port of loading...',
  portOfDestinationName: 'Select port of destination...',
  placeOfDeliveryName: 'Select place of delivery...',
}

// VGM Status renderer
const VgmStatusRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    submitted: 'bg-blue-100 text-blue-800',
    verified: 'bg-green-100 text-green-800',
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[value] || 'bg-gray-100 text-gray-800'}`}>
      {value.toUpperCase()}
    </span>
  )
}

// Date renderer
const DateRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  const date = new Date(value)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return <span>{`${day}/${month}/${year}`}</span>
}

// Rate renderer with currency
const RateRenderer = ({ value, rowData }: { value: string | null; rowData: any }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  const amount = parseFloat(value)
  const currency = rowData.rateCurrency || 'PLN'
  return (
    <span className="font-medium">
      {new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} {currency}
    </span>
  )
}

export default function TransportsPage() {
  // Sea container drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const handleOpenSeaContainerDrawer = useCallback((containerId: string, projectId: string) => {
    setSelectedContainerId(containerId)
    setSelectedProjectId(projectId)
    setDrawerOpen(true)
  }, [])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View details', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: Record<string, unknown>) => {
    if (actionId === 'view' && rowData.transportType === 'sea' && rowData.id && rowData.projectId) {
      handleOpenSeaContainerDrawer(rowData.id as string, rowData.projectId as string)
    }
  }, [handleOpenSeaContainerDrawer])

  // Fetch table config
  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['transports-table-config'],
    queryFn: async () => {
      const response = await apiCall<{ columns: any[]; meta: any }>(
        '/api/transports/table-config'
      )
      if (!response.ok) throw new Error('Failed to load table config')
      return response.result
    },
  })

  // Location editor config for FmsLocation entity search
  const locationEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '', locode: r.presenter?.subtitle || '' }),
    placeholder: 'Search locations...',
    minQueryLength: 2,
  }), [])

  // Renderer for JSON-encoded location values
  const locationRenderer = useCallback((value: unknown, placeholder: string) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-muted-foreground">{placeholder}</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        const display = parsed.locode ? `${parsed.name} (${parsed.locode})` : parsed.name
        return <span className="truncate">{display}</span>
      }
    } catch { /* Not JSON, display as-is */ }
    return <span className="truncate">{strValue}</span>
  }, [])

  // Map columns from table config with renderers
  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col: any) => {
      const def: ColumnDef = {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
      }

      if (col.data === 'date') {
        def.renderer = (value: string | null, rowData: any) => {
          if (rowData.transportType === 'sea') {
            return (
              <CombinedTimestampCell
                estimatedTimestamps={rowData.etaTimestamps as TimestampEntry[] | null}
                actualTimestamps={rowData.ataTimestamps as TimestampEntry[] | null}
                label="ETA/ATA"
                format="date"
              />
            )
          }
          return <DateRenderer value={value} />
        }
      }
      if (col.data === 'cutOff') {
        def.renderer = (value: string | null) => <DateRenderer value={value} />
      }
      if (col.data === 'vgmStatus') {
        def.renderer = (value: string | null) => <VgmStatusRenderer value={value} />
      }
      if (col.data === 'rate') {
        def.renderer = (value: string | null, rowData: any) => <RateRenderer value={value} rowData={rowData} />
      }
      if (col.data === 'projectNumber') {
        def.renderer = (value: string, rowData: any) => (
          <a
            href={`/backend/fms-projects/${rowData.projectId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </a>
        )
      }
      if (col.data === 'containerNumber') {
        def.renderer = (value: string | null, rowData: any) => {
          if (!value) return <span className="text-muted-foreground">-</span>
          if (rowData.transportType === 'sea') {
            return (
              <button
                type="button"
                className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-left"
                onClick={(e) => {
                  e.stopPropagation()
                  handleOpenSeaContainerDrawer(rowData.id, rowData.projectId)
                }}
              >
                {value}
              </button>
            )
          }
          return <span className="font-mono">{value}</span>
        }
      }

      // Location columns with entity search editors
      if (LOCATION_COLUMNS.has(col.data)) {
        def.readOnly = false
        def.editor = createEntitySearchEditor(locationEditorConfig)
        def.renderer = (value: unknown) =>
          locationRenderer(value, LOCATION_PLACEHOLDERS[col.data] || 'Select location...')
      }

      return def
    }) as ColumnDef[]
  }, [tableConfig, handleOpenSeaContainerDrawer, locationEditorConfig, locationRenderer])

  // Dynamic table hook
  const table = useDynamicTablePage({
    source: '/api/transports',
    columns,
    tableName: 'Transports',
    perspectives: 'transports',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    defaultPageSize: 100,
    cellEdit: {},
    queryKey: 'transports',
    hooks: {
      beforeCellEdit: (payload: CellEditSaveEvent, rowData: any) => {
        const locationIdField = LOCATION_FIELD_MAP[payload.prop]
        const putBody: Record<string, unknown> = { transportType: rowData.transportType }
        if (locationIdField) {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            putBody[locationIdField] = parsed.id
          } catch {
            putBody[locationIdField] = null
          }
        } else {
          putBody[payload.prop] = payload.newValue
        }
        return { payload: putBody }
      },
    },
    tableProps: {
      height: 'calc(100vh - 140px)',
      keyboardShortcuts,
      enableComments: true,
      commentsTableId: 'transports',
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        borderless: true,
      },
    },
  })

  if (configLoading || table.isLoading) {
    return (
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TableSkeleton rows={10} columns={8} />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        onRowAction={handleRowAction}
        pagination={{
          ...table.props.pagination!,
          limitOptions: [50, 100, 200],
        }}
      />

      <SeaContainerDetailsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        containerId={selectedContainerId}
        projectId={selectedProjectId ?? ''}
      />
    </div>
  )
}
