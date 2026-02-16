'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
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
  KeyboardShortcutsConfig,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
  SortRule,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { FRC_PROJECT_STATUSES } from '../../../../lib/types'

interface FrcProjectRow {
  id: string
  projectNumber: string
  rfqName?: string | null
  offerName?: string | null
  status: string
  totalValue?: string | null
  currencyCode: string
  createdAt: string
  updatedAt: string
}

// Dropdown options derived from types
const PROJECT_STATUS_OPTIONS = FRC_PROJECT_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#dcfce7', text: '#166534' },
  completed: { bg: '#dbeafe', text: '#1e40af' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.charAt(0).toUpperCase() + value.slice(1)
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{new Date(value).toLocaleDateString()}</span>
}

const RENDERERS: Record<string, (value: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
}

const COLUMNS: ColumnDef[] = [
  { data: 'projectNumber', title: 'Project #', width: 150, type: 'text', readOnly: true },
  { data: 'rfqName', title: 'Opportunity', width: 200, type: 'text', readOnly: true },
  { data: 'offerName', title: 'Offer', width: 200, type: 'text', readOnly: true },
  {
    data: 'status',
    title: 'Status',
    width: 120,
    type: 'dropdown',
    source: PROJECT_STATUS_OPTIONS,
    renderer: RENDERERS.StatusRenderer,
  },
  { data: 'totalValue', title: 'Total Value', width: 120, type: 'numeric', readOnly: true },
  { data: 'currencyCode', title: 'Currency', width: 80, type: 'text', readOnly: true },
  { data: 'createdAt', title: 'Created', width: 120, type: 'date', readOnly: true, renderer: RENDERERS.DateRenderer },
]

// Transform API perspective format to DynamicTable format
function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig {
  const { columnOrder = [], columnVisibility = {} } = dto.settings

  const visible =
    columnOrder.length > 0
      ? columnOrder.filter((col) => columnVisibility[col] !== false)
      : allColumns
  const hidden = allColumns.filter((col) => !visible.includes(col))

  const apiFilters = dto.settings.filters as Record<string, unknown> | undefined
  const filters: FilterRow[] = Array.isArray(apiFilters)
    ? (apiFilters as FilterRow[])
    : ((apiFilters?.rows as FilterRow[]) ?? [])
  const color = apiFilters?._color as PerspectiveConfig['color']

  const sorting: SortRule[] = (dto.settings.sorting ?? []).map((s) => ({
    id: s.id,
    field: s.id,
    direction: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc',
  }))

  return { id: dto.id, name: dto.name, color, columns: { visible, hidden }, filters, sorting }
}

// Transform DynamicTable perspective format to API format
function dynamicTableToApi(config: PerspectiveConfig): PerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach((col) => (columnVisibility[col] = true))
  config.columns.hidden.forEach((col) => (columnVisibility[col] = false))

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map((s) => ({
      id: s.field,
      desc: s.direction === 'desc',
    })),
  }
}

export default function FrcProjectsPage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('offset', String((page - 1) * limit))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('q', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data, isLoading } = useQuery({
    queryKey: ['frc_projects', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcProjectRow[]; total: number }>(
        `/api/frc_projects/projects?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load projects')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'frc_projects'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/frc_projects')
      return response.ok ? response.result : null
    },
  })

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && COLUMNS.length > 0) {
      const allCols = COLUMNS.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, activePerspectiveId])

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  const handleViewProject = useCallback((projectId: string) => {
    router.push(`/backend/frc-projects/${projectId}`)
  }, [router])

  // Actions renderer with Eye icon
  const actionsRenderer = useCallback((rowData: FrcProjectRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleViewProject(rowData.id)
        }}
        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
        title="View Project"
      >
        <Eye className="h-4 w-4" />
      </button>
    )
  }, [handleViewProject])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View project', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcProjectRow) => {
    if (actionId === 'view' && rowData.id) {
      handleViewProject(rowData.id)
    }
  }, [handleViewProject])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const response = await apiCall<{ error?: string }>(
            `/api/frc_projects/projects/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Project updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_projects'] })
          } else {
            const error = response.result?.error || 'Update failed'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error,
            } as CellSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },

      [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
        setSortField(payload.columnName)
        setSortDir(payload.direction || 'desc')
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

      // Perspective events
      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const apiSettings = dynamicTableToApi(payload.perspective)
        const response = await apiCall<{ id: string }>('/api/perspectives/frc_projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_projects'] })
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
        } else {
          // Reset to default when "All" is selected
          setFilters([])
          setSortField('createdAt')
          setSortDir('desc')
        }
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const response = await apiCall(`/api/perspectives/frc_projects/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_projects'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/frc_projects/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_projects'] })
        } else {
          flash('Failed to delete perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        if (payload.config.filters) {
          setFilters(payload.config.filters)
        }
        if (payload.config.sorting && payload.config.sorting.length > 0) {
          setSortField(payload.config.sorting[0].field)
          setSortDir(payload.config.sorting[0].direction)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (isLoading && !data) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={7} />
      </div>
    )
  }

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Projects"
        idColumnName="id"
        height="calc(100vh - 110px)"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={true}
        actionsRenderer={actionsRenderer}
        keyboardShortcuts={keyboardShortcuts}
        onRowAction={handleRowAction}
        savedPerspectives={savedPerspectives}
        activePerspectiveId={activePerspectiveId}
        uiConfig={{
          hideAddRowButton: true,
        }}
        pagination={{
          currentPage: page,
          totalPages: Math.ceil((data?.total || 0) / limit),
          limit,
          limitOptions: [25, 50, 100],
          onPageChange: setPage,
          onLimitChange: (l) => {
            setLimit(l)
            setPage(1)
          },
        }}
      />
    </div>
  )
}
