'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
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
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

// Shipment type tabs
type ShipmentTab = 'EXP' | 'IMP' | 'RAIL' | 'FTL' | 'AIR' | 'DEPOT'

const SHIPMENT_TABS: { value: ShipmentTab; label: string }[] = [
  { value: 'EXP', label: 'EXP' },
  { value: 'IMP', label: 'IMP' },
  { value: 'RAIL', label: 'KOLEJ' },
  { value: 'FTL', label: 'FTL LTL' },
  { value: 'AIR', label: 'AIR' },
  { value: 'DEPOT', label: 'DEPOT' },
]

// Extended PerspectiveSettings with shipmentType
interface ExtendedPerspectiveSettings extends PerspectiveSettings {
  shipmentType?: ShipmentTab
}

// Transform API perspective format to DynamicTable format
function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig & { shipmentType?: ShipmentTab } {
  const settings = dto.settings as ExtendedPerspectiveSettings
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
  // Color is stored inside filters object to bypass Zod stripping
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
    shipmentType: settings.shipmentType,
  }
}

// Transform DynamicTable perspective format to API format
function dynamicTableToApi(config: PerspectiveConfig, shipmentType: ShipmentTab): ExtendedPerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach(col => columnVisibility[col] = true)
  config.columns.hidden.forEach(col => columnVisibility[col] = false)

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    // Store color inside filters object to bypass Zod stripping unknown fields
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map(s => ({
      id: s.field,
      desc: s.direction === 'desc'
    })),
    shipmentType, // Include active tab in saved perspective
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

export default function ShipmentsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get initial tab from URL or default to EXP
  const initialTab = (searchParams.get('shipmentType') as ShipmentTab) || 'EXP'
  const [activeTab, setActiveTab] = useState<ShipmentTab>(initialTab)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<(PerspectiveConfig & { shipmentType?: ShipmentTab })[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Update URL when tab changes
  const handleTabChange = (tab: ShipmentTab) => {
    setActiveTab(tab)
    setPage(1)
    // Update URL without full navigation
    const url = new URL(window.location.href)
    url.searchParams.set('shipmentType', tab)
    router.push(url.pathname + url.search)
  }

  // Fetch table config based on active tab
  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['shipments-table-config', activeTab],
    queryFn: async () => {
      const response = await apiCall<{ columns: any[]; meta: any }>(
        `/api/shipments/table-config?shipmentType=${activeTab}`
      )
      if (!response.ok) throw new Error('Failed to load table config')
      return response.result
    },
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'shipments'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/shipments')
      return response.ok ? response.result : null
    },
  })

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('shipmentType', activeTab)
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('search', search)
    return params.toString()
  }, [activeTab, page, pageSize, sortField, sortDir, search])

  // Fetch shipments data
  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['shipments', queryParams],
    queryFn: async () => {
      const response = await apiCall<{ items: any[]; total: number; totalPages: number }>(
        `/api/shipments?${queryParams}`
      )
      if (!response.ok) throw new Error('Failed to load shipments')
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
      if (col.data === 'date' || col.data === 'cutOff') {
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

      return def
    }) as ColumnDef[]
  }, [tableConfig])

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map(c => c.data)
      const transformed = perspectivesData.perspectives.map(p => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        // Find the default perspective and apply its shipmentType
        const defaultPerspective = transformed.find(p => p.id === perspectivesData.defaultPerspectiveId)
        if (defaultPerspective?.shipmentType) {
          setActiveTab(defaultPerspective.shipmentType)
        }
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns])

  // Event handlers
  useEventHandlers({
    [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
      const rowData = data?.items[payload.rowIndex]
      if (!rowData) return

      dispatch(
        tableRef.current as HTMLElement,
        TableEvents.CELL_SAVE_START,
        { rowIndex: payload.rowIndex, colIndex: payload.colIndex } as CellSaveStartEvent
      )

      try {
        const response = await apiCall<{ error?: string }>(`/api/shipments/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transportType: rowData.transportType,
            [payload.prop]: payload.newValue,
          }),
        })

        if (response.ok) {
          flash('Updated', 'success')
          dispatch(
            tableRef.current as HTMLElement,
            TableEvents.CELL_SAVE_SUCCESS,
            { rowIndex: payload.rowIndex, colIndex: payload.colIndex } as CellSaveSuccessEvent
          )
          queryClient.invalidateQueries({ queryKey: ['shipments'] })
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
      const settings = dynamicTableToApi(payload.perspective, activeTab)
      const existingPerspective = savedPerspectives.find(p => p.name === payload.perspective.name)
      const response = await apiCall('/api/perspectives/shipments', {
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
        queryClient.invalidateQueries({ queryKey: ['perspectives', 'shipments'] })
      } else {
        flash('Failed to save perspective', 'error')
      }
    },

    [TableEvents.PERSPECTIVE_SELECT]: (payload: PerspectiveSelectEvent) => {
      setActivePerspectiveId(payload.id)
      if (payload.config) {
        const extendedConfig = savedPerspectives.find(p => p.id === payload.id)
        // Switch tab if perspective has a saved shipmentType
        if (extendedConfig?.shipmentType) {
          handleTabChange(extendedConfig.shipmentType)
        }
        setFilters(payload.config.filters)
        if (payload.config.sorting.length > 0) {
          setSortField(payload.config.sorting[0].field)
          setSortDir(payload.config.sorting[0].direction)
        }
        setPage(1)
      } else {
        // Reset to default when "All" is selected
        setFilters([])
        setSortField('date')
        setSortDir('desc')
        setPage(1)
      }
    },

    [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
      const perspective = savedPerspectives.find(p => p.id === payload.id)
      if (perspective) {
        const settings = dynamicTableToApi(perspective, activeTab)
        const response = await apiCall('/api/perspectives/shipments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'shipments'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      }
    },

    [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
      const response = await apiCall(`/api/perspectives/shipments/${payload.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Perspective deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['perspectives', 'shipments'] })
        if (activePerspectiveId === payload.id) {
          setActivePerspectiveId(null)
          setFilters([])
          setSortField('date')
          setSortDir('desc')
        }
      } else {
        flash('Failed to delete perspective', 'error')
      }
    },
  }, tableRef as React.RefObject<HTMLElement>)

  // Tab selector component for the header
  const tabSelector = (
    <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
      {SHIPMENT_TABS.map(tab => (
        <button
          key={tab.value}
          onClick={() => handleTabChange(tab.value)}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            activeTab === tab.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

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
        {/* DynamicTable with integrated tabs */}
        <DynamicTable
          tableRef={tableRef}
          data={data?.items ?? []}
          columns={columns}
          tableName="Shipments"
          idColumnName="id"
          height="calc(100vh - 140px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
            topBarEnd: tabSelector,
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
    </Page>
  )
}
