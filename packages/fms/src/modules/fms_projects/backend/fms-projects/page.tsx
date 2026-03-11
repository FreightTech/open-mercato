/**
 * FMS Projects Module - List View
 * Projects list with DynamicTable
 */

'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
  useFilterSuggestions,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
  PerspectiveConfig,
  PerspectiveChangeEvent,
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'

interface FmsProjectRow {
  id: string
  project_number: string
  current_step: string
  client_id?: string | null
  client_name?: string | null
  cargo_type: string
  shipment_type?: string | null
  origin_address?: string | null
  destination_address?: string | null
  requested_pickup_date?: string | null
  client_reference?: string | null
  created_at: string
  updated_at: string
}

// Status options for dropdown with labels
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'plan_route', label: 'Planning' },
  { value: 'add_cargo', label: 'Adding Cargo' },
  { value: 'validated', label: 'Validated' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

// Cargo type options with labels
const CARGO_TYPE_OPTIONS = [
  { value: 'fcl', label: 'FCL' },
  { value: 'lcl', label: 'LCL' },
]

// Shipment type options with labels
const SHIPMENT_TYPE_OPTIONS = [
  { value: 'EXP', label: 'Export' },
  { value: 'IMP', label: 'Import' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'FTL', label: 'Full Truck' },
  { value: 'LTL', label: 'Less Than Truck' },
  { value: 'AIR', label: 'Air' },
  { value: 'DEPOT', label: 'Depot' },
]

const StatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    plan_route: { label: 'Planning', color: 'bg-blue-100 text-blue-800' },
    add_cargo: { label: 'Adding Cargo', color: 'bg-yellow-100 text-yellow-800' },
    validated: { label: 'Validated', color: 'bg-green-100 text-green-800' },
    confirmed: { label: 'Confirmed', color: 'bg-purple-100 text-purple-800' },
    in_transit: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-800' },
    delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800' },
    completed: { label: 'Completed', color: 'bg-green-200 text-green-900' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

const CargoTypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{value.toUpperCase()}</span>
}

const ProjectNumberRenderer = ({ value, rowData }: { value: string; rowData: { id: string } }) => {
  const displayValue = value || `#${rowData.id?.slice(0, 8) || '...'}`
  return (
    <a
      href={`/backend/fms-projects/${rowData.id}`}
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left font-mono"
    >
      {displayValue}
    </a>
  )
}

const ClientRenderer = ({ value }: { value: string }) => {
  if (!value) return <span className="text-gray-400">-</span>
  // Value might be JSON from entity search editor
  try {
    const parsed = JSON.parse(value)
    if (parsed?.name) return <span>{parsed.name}</span>
  } catch {
    // Not JSON, display as-is
  }
  return <span>{value}</span>
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  CargoTypeRenderer: (value) => <CargoTypeRenderer value={value} />,
  ProjectNumberRenderer: (value, rowData) => <ProjectNumberRenderer value={value} rowData={rowData} />,
  ClientRenderer: (value) => <ClientRenderer value={value} />,
}

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

export default function ProjectsListPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useT()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<FmsProjectRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Server-side filter suggestions for large datasets
  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'fms_projects:fms_project',
  })

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_projects'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/fms_projects')
      return response.ok ? response.result : null
    },
  })

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('q', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['fms_projects', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FmsProjectRow[]; total: number; totalPages?: number }>(
        `/api/fms_projects/projects?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load projects')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => {
    return (data?.items ?? []).map((project) => {
      const camelCaseObject: Record<string, any> = { id: project.id }

      Object.keys(project).forEach((key) => {
        if (key === 'id') return

        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        const value = project[key as keyof FmsProjectRow]
        camelCaseObject[camelKey] = value
      })

      // Format client as JSON for entity search editor display
      if (project.client_id && project.client_name) {
        camelCaseObject.clientName = JSON.stringify({
          id: project.client_id,
          name: project.client_name,
        })
      }

      return camelCaseObject
    })
  }, [data?.items])

  // Client editor config for entity search
  const clientEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
    minQueryLength: 1,
  }), [])

  const actionsRenderer = useCallback((rowData: any, _rowIndex: number) => {
    const row = rowData as FmsProjectRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setProjectToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'projectNumber',
        title: 'Project #',
        width: 180,
        readOnly: true,
        renderer: RENDERERS.ProjectNumberRenderer,
      },
      {
        data: 'currentStep',
        title: 'Status',
        width: 120,
        type: 'dropdown',
        source: STATUS_OPTIONS,
        renderer: RENDERERS.StatusRenderer,
      },
      {
        data: 'clientName',
        title: 'Client',
        width: 180,
        renderer: RENDERERS.ClientRenderer,
        editor: createEntitySearchEditor(clientEditorConfig),
      },
      {
        data: 'cargoType',
        title: 'Type',
        width: 80,
        type: 'dropdown',
        source: CARGO_TYPE_OPTIONS,
        renderer: RENDERERS.CargoTypeRenderer,
      },
      {
        data: 'shipmentType',
        title: 'Shipment',
        width: 100,
        type: 'dropdown',
        source: SHIPMENT_TYPE_OPTIONS,
      },
      {
        data: 'originAddress',
        title: 'Origin',
        width: 180,
        className: 'text-sm',
      },
      {
        data: 'destinationAddress',
        title: 'Destination',
        width: 180,
        className: 'text-sm',
      },
      {
        data: 'requestedPickupDate',
        title: 'Pickup Date',
        width: 120,
        type: 'date',
      },
      {
        data: 'clientReference',
        title: 'Client Ref',
        width: 140,
      },
      {
        data: 'createdAt',
        title: 'Created',
        width: 140,
        type: 'date',
        readOnly: true,
      },
    ] as ColumnDef[]
  }, [clientEditorConfig])

  useEffect(() => {
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectivesData, columns])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open project', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete project', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    if (actionId === 'view' && rowData.id) {
      router.push(`/backend/fms-projects/${rowData.id}`)
    } else if (actionId === 'delete' && rowData.id) {
      setProjectToDelete(rowData as FmsProjectRow)
    }
  }, [router])

  const handleConfirmDelete = useCallback(async () => {
    if (!projectToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall<{ error?: string }>(
        `/api/fms_projects/projects/${projectToDelete.id}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        flash(t('fms_projects.list.deleted', 'Project deleted'), 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_projects'] })
        setProjectToDelete(null)
      } else {
        flash(response.result?.error || t('fms_projects.list.delete_failed', 'Failed to delete project'), 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : t('fms_projects.list.delete_failed', 'Failed to delete project'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [projectToDelete, queryClient])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Build the update payload
          let updatePayload: Record<string, unknown> = {}

          // Handle client field - extract clientId from JSON
          if (payload.prop === 'clientName') {
            const strValue = String(payload.newValue || '')
            if (strValue) {
              try {
                const parsed = JSON.parse(strValue)
                if (parsed?.id) {
                  updatePayload.clientId = parsed.id
                } else {
                  updatePayload.clientId = null
                }
              } catch {
                // Not JSON, set to null
                updatePayload.clientId = null
              }
            } else {
              updatePayload.clientId = null
            }
          } else {
            // For other fields, send directly
            updatePayload[payload.prop] = payload.newValue
          }

          const response = await apiCall<{ error?: string }>(
            `/api/fms_projects/projects/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload),
            }
          )

          if (response.ok) {
            flash('Project updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            // Refresh data to show updated values
            queryClient.invalidateQueries({ queryKey: ['fms_projects'] })
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

      [TableEvents.COLUMN_SORT]: (payload: {
        columnName: string
        direction: 'asc' | 'desc' | null
      }) => {
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

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        // Handle sort rules change from column header clicks
        if (payload.config.sorting) {
          if (payload.config.sorting.length > 0) {
            const firstSort = payload.config.sorting[0]
            setSortField(firstSort.field)
            setSortDir(firstSort.direction)
          } else {
            // Reset to default when all sorts removed
            setSortField('createdAt')
            setSortDir('desc')
          }
          setPage(1)
        }
      },

      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const settings = dynamicTableToApi(payload.perspective)
        const existingPerspective = savedPerspectives.find(
          (p) => p.name === payload.perspective.name
        )
        const response = await apiCall('/api/perspectives/fms_projects', {
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
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_projects'] })
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
          setFilters([])
          setSortField('createdAt')
          setSortDir('desc')
          setPage(1)
        }
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const perspective = savedPerspectives.find((p) => p.id === payload.id)
        if (perspective) {
          const settings = dynamicTableToApi(perspective)
          const response = await apiCall('/api/perspectives/fms_projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_projects'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const url = payload.hardDelete
          ? `/api/perspectives/fms_projects/${payload.id}?hardDelete=true`
          : `/api/perspectives/fms_projects/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_projects'] })
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
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Only show skeleton on initial load, not during refetches
  if (dataLoading && !data) {
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
          data={tableData}
          columns={columns}
          tableName="FMS Projects"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          actionsRenderer={actionsRenderer}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          loadFilterSuggestions={loadFilterSuggestions}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
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

        <Dialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
          <DialogContent
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              tableRef.current?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('fms_projects.list.delete_dialog_title', 'Delete Project')}</DialogTitle>
              <DialogDescription>
                {t('fms_projects.list.delete_dialog_description', 'Are you sure you want to delete project "{projectNumber}"? This action cannot be undone.', { projectNumber: projectToDelete?.project_number ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProjectToDelete(null)} disabled={isDeleting}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                {isDeleting ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
