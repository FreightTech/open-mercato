'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  SortRule,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SeaContainerDetailsDrawer } from '../../../fms_projects/components/SeaContainers/SeaContainerDetailsDrawer'
import { CombinedTimestampCell, type TimestampEntry } from '../../../fms_projects/components/SeaContainers/CombinedTimestampCell'

// Default visible columns
const DEFAULT_VISIBLE_COLUMNS = [
  'containerNumber',
  'blNumber',
  'projectNumber',
  'shipmentType',
  'origin',
  'destination',
  'date',
  'carrierName',
  'rate',
  'customsClearance',
]

// Transform API perspective format to DynamicTable format
function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig {
  const settings = dto.settings as PerspectiveSettings
  const { columnOrder = [], columnVisibility = {} } = settings

  // Visible = columns in order that aren't explicitly hidden
  const visible = columnOrder.length > 0
    ? columnOrder.filter(col => columnVisibility[col] !== false)
    : allColumns
  const hidden = allColumns.filter(col => !visible.includes(col))

  // Filters: API stores as { rows: FilterRow[], _color?: string }
  const apiFilters = settings.filters as Record<string, unknown> | undefined
  const filters: FilterRow[] = Array.isArray(apiFilters)
    ? apiFilters as FilterRow[]
    : (apiFilters?.rows as FilterRow[]) ?? []
  const color = apiFilters?._color as PerspectiveConfig['color']

  // Sorting: API uses { id, desc }, DynamicTable uses { id, field, direction }
  const sorting: SortRule[] = (settings.sorting ?? []).map(s => ({
    id: s.id,
    field: s.id,
    direction: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc'
  }))

  return {
    id: dto.id,
    name: dto.name,
    color,
    columns: { visible, hidden },
    filters,
    sorting,
  }
}

// Transform DynamicTable perspective format to API format
function dynamicTableToApi(config: PerspectiveConfig): PerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach(col => columnVisibility[col] = true)
  config.columns.hidden.forEach(col => columnVisibility[col] = false)

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map(s => ({
      id: s.field,
      desc: s.direction === 'desc'
    })),
  }
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
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Sea container drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Handler to open sea container drawer
  const handleOpenSeaContainerDrawer = useCallback((containerId: string, projectId: string) => {
    setSelectedContainerId(containerId)
    setSelectedProjectId(projectId)
    setDrawerOpen(true)
  }, [])

  // Keyboard shortcuts for row actions (Shift+Enter to open details)
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View details', key: 'Enter', shift: true },
    ],
  }), [])

  // Handler for keyboard shortcut actions
  const handleRowAction = useCallback((actionId: string, rowData: Record<string, unknown>) => {
    if (actionId === 'view' && rowData.transportType === 'sea' && rowData.id && rowData.projectId) {
      handleOpenSeaContainerDrawer(rowData.id as string, rowData.projectId as string)
    }
  }, [handleOpenSeaContainerDrawer])

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Refs to always access latest state in event handlers
  const savedPerspectivesRef = useRef(savedPerspectives)
  savedPerspectivesRef.current = savedPerspectives
  const activePerspectiveIdRef = useRef(activePerspectiveId)
  activePerspectiveIdRef.current = activePerspectiveId
  const initialPerspectiveSetRef = useRef(false)

  // Fetch table config (no shipmentType param)
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

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'transports'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/transports')
      return response.ok ? response.result : null
    },
  })

  // Build query params (no shipmentType)
  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('search', search)
    return params.toString()
  }, [page, pageSize, sortField, sortDir, search])

  // Fetch transports data
  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['transports', queryParams],
    queryFn: async () => {
      const response = await apiCall<{ items: any[]; total: number; totalPages: number }>(
        `/api/transports?${queryParams}`
      )
      if (!response.ok) throw new Error('Failed to load transports')
      return response.result ?? { items: [], total: 0, totalPages: 1 }
    },
  })

  // Map columns from table config with renderers
  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col: any) => {
      const def: ColumnDef = {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
      }

      // Add custom renderers
      if (col.data === 'date') {
        // Use CombinedTimestampCell for sea transports to show ETA/ATA with history
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
          // Fallback to simple date for non-sea transports
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

      return def
    }) as ColumnDef[]
  }, [tableConfig, handleOpenSeaContainerDrawer])

  // Create built-in default perspective
  const builtInDefaultPerspective = useMemo((): PerspectiveConfig | null => {
    if (columns.length === 0) return null
    const allCols = columns.map(c => c.data)
    const visible = DEFAULT_VISIBLE_COLUMNS.filter(col => allCols.includes(col))
    const hidden = allCols.filter(col => !visible.includes(col))

    return {
      id: '_base',
      name: 'Base',
      columns: { visible, hidden },
      filters: [],
      sorting: [],
    }
  }, [columns])

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (columns.length > 0) {
      const allCols = columns.map(c => c.data)

      // Start with user-saved perspectives
      const transformed = (perspectivesData?.perspectives ?? []).map(p => apiToDynamicTable(p, allCols))

      // Add built-in default perspective if it exists
      if (builtInDefaultPerspective) {
        transformed.unshift(builtInDefaultPerspective)
      }

      setSavedPerspectives(transformed)

      // Set default perspective only on initial load
      if (!initialPerspectiveSetRef.current) {
        initialPerspectiveSetRef.current = true
        if (perspectivesData?.defaultPerspectiveId) {
          setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
        } else if (builtInDefaultPerspective) {
          setActivePerspectiveId('_base')
        }
      }
    }
  }, [perspectivesData, columns, builtInDefaultPerspective])

  // Event handlers
  useEventHandlers({
    [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
      const rowData = payload.rowData
      if (!rowData?.id) return

      const putBody = {
        transportType: rowData.transportType,
        [payload.prop]: payload.newValue,
      }
      dispatch(
        tableRef.current as HTMLElement,
        TableEvents.CELL_SAVE_START,
        { rowIndex: payload.rowIndex, colIndex: payload.colIndex } as CellSaveStartEvent
      )

      try {
        const response = await apiCall<{ error?: string }>(`/api/transports/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(putBody),
        })

        if (response.ok) {
          flash('Updated', 'success')
          dispatch(
            tableRef.current as HTMLElement,
            TableEvents.CELL_SAVE_SUCCESS,
            { rowIndex: payload.rowIndex, colIndex: payload.colIndex } as CellSaveSuccessEvent
          )
          queryClient.invalidateQueries({ queryKey: ['transports'] })
        } else {
          const error = response.result?.error || 'Update failed'
          flash(error, 'error')
          dispatch(
            tableRef.current as HTMLElement,
            TableEvents.CELL_SAVE_ERROR,
            { rowIndex: payload.rowIndex, colIndex: payload.colIndex, error } as CellSaveErrorEvent
          )
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        flash(errorMessage, 'error')
        dispatch(
          tableRef.current as HTMLElement,
          TableEvents.CELL_SAVE_ERROR,
          { rowIndex: payload.rowIndex, colIndex: payload.colIndex, error: errorMessage } as CellSaveErrorEvent
        )
      }
    },

    [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
      setSortField(payload.columnName)
      setSortDir(payload.direction || 'asc')
      setPage(1)
    },

    [TableEvents.SEARCH]: (payload: { query: string }) => {
      setSearch(payload.query)
      setPage(1)
    },

    [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
      setFilters(payload.filters)
      setPage(1)
    },

    // Perspective event handlers
    [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
      const settings = dynamicTableToApi(payload.perspective)
      const existingPerspective = savedPerspectives.find(
        p => p.name === payload.perspective.name && p.id !== '_base'
      )
      const response = await apiCall('/api/perspectives/transports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existingPerspective?.id,
          name: payload.perspective.name,
          settings,
        }),
      })
      if (response.ok) {
        flash('Perspective saved', 'success')
        queryClient.invalidateQueries({ queryKey: ['perspectives', 'transports'] })
      } else {
        flash('Failed to save perspective', 'error')
      }
    },

    [TableEvents.PERSPECTIVE_SELECT]: (payload: PerspectiveSelectEvent) => {
      setActivePerspectiveId(payload.id)
      if (payload.config) {
        setFilters(payload.config.filters)
        if (payload.config.sorting.length > 0) {
          setSortField(payload.config.sorting[0].field)
          setSortDir(payload.config.sorting[0].direction)
        }
        setPage(1)
      } else {
        // Reset to default when "All" is selected
        setFilters([])
        setSortField('createdAt')
        setSortDir('desc')
        setPage(1)
      }
    },

    [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
      const perspective = savedPerspectivesRef.current.find(p => p.id === payload.id)
      if (perspective) {
        const settings = dynamicTableToApi(perspective)
        const response = await apiCall('/api/perspectives/transports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'transports'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      }
    },

    [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
      const response = await apiCall(`/api/perspectives/transports/${payload.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Perspective deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['perspectives', 'transports'] })
        if (activePerspectiveId === payload.id) {
          setActivePerspectiveId(null)
          setFilters([])
          setSortField('createdAt')
          setSortDir('desc')
        }
      } else {
        flash('Failed to delete perspective', 'error')
      }
    },
  }, tableRef as React.RefObject<HTMLElement>)

  if (configLoading) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={8} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <DynamicTable
          tableRef={tableRef}
          data={data?.items ?? []}
          columns={columns}
          tableName="Transports"
          idColumnName="id"
          height="calc(100vh - 140px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
          }}
          pagination={{
            currentPage: page,
            totalPages: data?.totalPages || 1,
            limit: pageSize,
            limitOptions: [50, 100, 200],
            onPageChange: setPage,
            onLimitChange: (l) => {
              setPageSize(l)
              setPage(1)
            },
          }}
        />
      </PageBody>

      {/* Sea Container Details Drawer */}
      <SeaContainerDetailsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        containerId={selectedContainerId}
        projectId={selectedProjectId ?? ''}
      />
    </Page>
  )
}
