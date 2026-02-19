'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Eye, Plus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { ConsoleWizardDrawer } from '../../components/ConsoleWizard'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor, type SearchResult } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
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
import { FRC_CONSOLE_STATUSES } from '../../../../lib/types'

interface FrcConsoleRow {
  id: string
  name: string
  customName: string | null
  date: string
  status: string
  truckPresetId: string | null
  truckPresetName: string | null
  projectId: string | null
  projectNumber: string | null
  truckId: string | null
  truckName: string | null
  originAirportId: string | null
  originAirportCode: string | null
  destinationAirportId: string | null
  destinationAirportCode: string | null
  createdAt: string
  updatedAt: string
}

// Dropdown options from types
const CONSOLE_STATUS_OPTIONS = FRC_CONSOLE_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '),
}))

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
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

// Project renderer - uses row data to create link
const createProjectRenderer = (rowData: FrcConsoleRow) => {
  const value = rowData.projectNumber
  const projectId = rowData.projectId
  if (!value || !projectId) return <span className="text-muted-foreground">-</span>
  return (
    <a
      href={`/backend/frc-projects/${projectId}`}
      className="font-mono text-xs text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {String(value)}
    </a>
  )
}

const RENDERERS: Record<string, (value: unknown) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value as string} />,
  DateRenderer: (value) => <DateRenderer value={value as string} />,
}

// Base columns (without dynamic editors)
const BASE_COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 200, type: 'text', readOnly: true },
  { data: 'customName', title: 'Custom Name', width: 150, type: 'text' },
  { data: 'date', title: 'Loading Date', width: 120, type: 'date' },
  { data: 'truckName', title: 'Truck', width: 120, type: 'text' },
  { data: 'originAirportCode', title: 'Origin', width: 100, type: 'text' },
  { data: 'destinationAirportCode', title: 'Destination', width: 100, type: 'text' },
  {
    data: 'status',
    title: 'Status',
    width: 120,
    type: 'dropdown',
    source: CONSOLE_STATUS_OPTIONS,
    renderer: RENDERERS.StatusRenderer,
  },
  { data: 'truckPresetName', title: 'Preset', width: 150, type: 'text' },
  { data: 'projectNumber', title: 'Project', width: 120, type: 'text' },
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

export default function FrcConsolePage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [showWizard, setShowWizard] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Entity search editor configs
  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: 'Search airports...',
    minQueryLength: 1,
    additionalFilters: { type: 'airport' },
  }), [])

  const presetEditorConfig = useMemo(() => ({
    entityType: 'frc_trucks:frc_truck_preset',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search presets...',
    minQueryLength: 1,
  }), [])

  const truckEditorConfig = useMemo(() => ({
    entityType: 'frc_trucks:frc_truck',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search trucks...',
    minQueryLength: 1,
  }), [])

  const projectEditorConfig = useMemo(() => ({
    entityType: 'frc_projects:frc_project',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, number: r.presenter?.title || '' }),
    placeholder: 'Search projects...',
    minQueryLength: 1,
  }), [])

  // Build columns with entity search editors
  const columns = useMemo((): ColumnDef[] => {
    return BASE_COLUMNS.map((col) => {
      if (col.data === 'originAirportCode') {
        return {
          ...col,
          editor: createEntitySearchEditor(airportEditorConfig),
        }
      }
      if (col.data === 'destinationAirportCode') {
        return {
          ...col,
          editor: createEntitySearchEditor(airportEditorConfig),
        }
      }
      if (col.data === 'truckPresetName') {
        return {
          ...col,
          editor: createEntitySearchEditor(presetEditorConfig),
        }
      }
      if (col.data === 'truckName') {
        return {
          ...col,
          editor: createEntitySearchEditor(truckEditorConfig),
        }
      }
      if (col.data === 'projectNumber') {
        return {
          ...col,
          editor: createEntitySearchEditor(projectEditorConfig),
          renderer: (_value: unknown, row: Record<string, unknown>) => createProjectRenderer(row as unknown as FrcConsoleRow),
        }
      }
      return col
    })
  }, [airportEditorConfig, presetEditorConfig, truckEditorConfig, projectEditorConfig])

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
    queryKey: ['frc_console', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcConsoleRow[]; total: number }>(
        `/api/frc_console/console?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load consoles')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'frc_console'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/frc_console')
      return response.ok ? response.result : null
    },
  })

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, activePerspectiveId, columns])

  // Data is already flat from API, no transformation needed
  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  const handleViewConsole = useCallback((consoleId: string) => {
    router.push(`/backend/frc-console/${consoleId}`)
  }, [router])

  // Actions renderer with Eye icon
  const actionsRenderer = useCallback((rowData: FrcConsoleRow & { truckName: string; route: string; projectNumber: string | null }, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleViewConsole(rowData.id)
        }}
        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
        title="View Console"
      >
        <Eye className="h-4 w-4" />
      </button>
    )
  }, [handleViewConsole])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View console', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcConsoleRow) => {
    if (actionId === 'view' && rowData.id) {
      handleViewConsole(rowData.id)
    }
  }, [handleViewConsole])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Parse relation columns (JSON values from entity search editors)
          let updateData: Record<string, unknown> = {}

          if (payload.prop === 'originAirportCode') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { originAirportId: parsed.id }
            } catch {
              updateData = { originAirportId: null }
            }
          } else if (payload.prop === 'destinationAirportCode') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { destinationAirportId: parsed.id }
            } catch {
              updateData = { destinationAirportId: null }
            }
          } else if (payload.prop === 'truckPresetName') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { truckPresetId: parsed.id }
            } catch {
              updateData = { truckPresetId: null }
            }
          } else if (payload.prop === 'truckName') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { truckId: parsed.id }
            } catch {
              // Truck is required, don't allow null
              flash('Invalid truck selection', 'error')
              dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
                rowIndex: payload.rowIndex,
                colIndex: payload.colIndex,
                error: 'Invalid truck selection',
              } as CellSaveErrorEvent)
              return
            }
          } else if (payload.prop === 'projectNumber') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { projectId: parsed.id }
            } catch {
              updateData = { projectId: null }
            }
          } else if (payload.prop === 'customName') {
            updateData = { customName: payload.newValue || null }
          } else {
            updateData = { [payload.prop]: payload.newValue }
          }

          const response = await apiCall<{ error?: string }>(
            `/api/frc_console/console/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateData),
            }
          )

          if (response.ok) {
            flash('Console updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_console'] })
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
        const response = await apiCall<{ id: string }>('/api/perspectives/frc_console', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_console'] })
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
          setSortField('date')
          setSortDir('desc')
        }
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const response = await apiCall(`/api/perspectives/frc_console/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_console'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/frc_console/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_console'] })
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

  const handleWizardCreated = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['frc_console'] })
    setShowWizard(false)
  }, [queryClient])

  if (isLoading && !data) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={8} />
      </div>
    )
  }

  return (
    <div>
      {/* Header with New Console button */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Truck Loading Console</h1>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Console
        </Button>
      </div>

      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Truck Loading Console"
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

      {/* Console Wizard Drawer */}
      <ConsoleWizardDrawer
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={handleWizardCreated}
      />
    </div>
  )
}
