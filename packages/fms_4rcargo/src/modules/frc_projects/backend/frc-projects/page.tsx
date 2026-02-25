'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { ProjectWizardDrawer } from '../../components/ProjectWizard'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'
import Link from 'next/link'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
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
  rfqId?: string | null
  rfqName?: string | null
  offerId?: string | null
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

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
]

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

// Renderer for RFQ/Opportunity name with link
const RfqNameRenderer = ({ value, row }: { value: string; row: FrcProjectRow }) => {
  // Value might be JSON from EntitySearchEditor
  let displayName = value
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      displayName = parsed.name || value
    } catch {
      // Use value as-is
    }
  }

  if (!displayName) return <span className="text-muted-foreground">-</span>

  // If we have rfqId, make it a link
  if (row?.rfqId) {
    return (
      <Link
        href={`/backend/frc-rfqs/${row.rfqId}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
      </Link>
    )
  }

  return <span className="text-foreground">{displayName}</span>
}

// Renderer for Offer name with link
const OfferNameRenderer = ({ value, row }: { value: string; row: FrcProjectRow }) => {
  // Value might be JSON from EntitySearchEditor
  let displayName = value
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      displayName = parsed.name || value
    } catch {
      // Use value as-is
    }
  }

  if (!displayName) return <span className="text-muted-foreground">-</span>

  // If we have offerId, make it a link
  if (row?.offerId) {
    return (
      <Link
        href={`/backend/frc-offers/${row.offerId}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
      </Link>
    )
  }

  return <span className="text-foreground">{displayName}</span>
}

const RENDERERS: Record<string, (value: any, row?: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  RfqNameRenderer: (value, row) => <RfqNameRenderer value={value} row={row} />,
  OfferNameRenderer: (value, row) => <OfferNameRenderer value={value} row={row} />,
}

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

// Global ref for delete handler (used by action renderer)
let onProjectDeleteHandler: ((project: FrcProjectRow) => void) | null = null

function setProjectDeleteHandler(handler: ((project: FrcProjectRow) => void) | null) {
  onProjectDeleteHandler = handler
}

export default function FrcProjectsPage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [showWizard, setShowWizard] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<FrcProjectRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Entity search editor configs
  const rfqEditorConfig = useMemo(() => ({
    entityType: 'frc_rfqs:frc_rfq',
    extractValue: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
        currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
        amount: r.fields?.amount ?? null,
      }),
    additionalFields: (r: { fields?: Record<string, unknown> }) => ({
      currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
      totalValue: r.fields?.amount ?? null,
    }),
    placeholder: 'Search opportunities...',
    minQueryLength: 2,
  }), [])

  const offerEditorConfig = useMemo(() => ({
    entityType: 'frc_offers:frc_offer',
    extractValue: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
        rfqId: r.fields?.rfq_id ?? r.fields?.rfqId ?? null,
        currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
        totalAmount: r.fields?.total_amount ?? r.fields?.totalAmount ?? null,
      }),
    additionalFields: (r: { fields?: Record<string, unknown> }) => ({
      currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
      totalValue: r.fields?.total_amount ?? r.fields?.totalAmount ?? null,
    }),
    placeholder: 'Search offers...',
    minQueryLength: 2,
  }), [])

  // Define columns with entity search editors
  const columns = useMemo((): ColumnDef[] => [
    { data: 'projectNumber', title: 'Project #', width: 150, type: 'text' },
    {
      data: 'rfqName',
      title: 'Opportunity',
      width: 200,
      type: 'text',
      renderer: RENDERERS.RfqNameRenderer,
      editor: createEntitySearchEditor(rfqEditorConfig),
    },
    {
      data: 'offerName',
      title: 'Offer',
      width: 200,
      type: 'text',
      renderer: RENDERERS.OfferNameRenderer,
      editor: createEntitySearchEditor(offerEditorConfig),
    },
    {
      data: 'status',
      title: 'Status',
      width: 120,
      type: 'dropdown',
      source: PROJECT_STATUS_OPTIONS,
      renderer: RENDERERS.StatusRenderer,
    },
    { data: 'totalValue', title: 'Total Value', width: 120, type: 'numeric' },
    { data: 'currencyCode', title: 'Currency', width: 80, type: 'dropdown', source: CURRENCY_OPTIONS },
    { data: 'createdAt', title: 'Created', width: 120, type: 'date', readOnly: true, renderer: RENDERERS.DateRenderer },
  ], [rfqEditorConfig, offerEditorConfig])

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
    if (perspectivesData?.perspectives && columns.length > 0) {
      const allCols = columns.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, columns, activePerspectiveId])

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  const handleViewProject = useCallback((projectId: string) => {
    router.push(`/backend/frc-projects/${projectId}`)
  }, [router])

  // Register delete handler for action renderer
  const openDeleteDialog = useCallback((project: FrcProjectRow) => {
    setProjectToDelete(project)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setProjectDeleteHandler(openDeleteDialog)
    return () => setProjectDeleteHandler(null)
  }, [openDeleteDialog])

  const handleDeleteConfirm = useCallback(async () => {
    if (!projectToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_projects/projects/${projectToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Project deleted', 'success')
        setDeleteDialogOpen(false)
        setProjectToDelete(null)
        queryClient.invalidateQueries({ queryKey: ['frc_projects'] })
      } else {
        const error = (response.result as { error?: string })?.error ?? 'Delete failed'
        flash(error, 'error')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [projectToDelete, queryClient])

  // Actions renderer with View and Delete icons
  const actionsRenderer = useCallback((rowData: FrcProjectRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <div className="flex items-center gap-1">
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
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onProjectDeleteHandler) {
              onProjectDeleteHandler(rowData)
            }
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete Project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [handleViewProject])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View project', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete project', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcProjectRow) => {
    if (actionId === 'view' && rowData.id) {
      handleViewProject(rowData.id)
    } else if (actionId === 'delete' && rowData.id) {
      openDeleteDialog(rowData)
    }
  }, [handleViewProject, openDeleteDialog])

  // Handle Ctrl+D to prevent browser bookmark dialog
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Build the update body - handle entity search JSON values
          let updateBody: Record<string, unknown> = {}

          if (payload.prop === 'rfqName') {
            // Parse JSON from entity search to get rfqId and additional fields
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateBody = {
                rfqId: parsed.id || null,
                ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
                ...(parsed.amount && { totalValue: String(parsed.amount) }),
              }
            } catch {
              // Not JSON, set rfqId to null (unlinking)
              updateBody = { rfqId: payload.newValue || null }
            }
          } else if (payload.prop === 'offerName') {
            // Parse JSON from entity search to get offerId and additional fields
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateBody = {
                offerId: parsed.id || null,
                ...(parsed.rfqId && { rfqId: parsed.rfqId }),
                ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
                ...(parsed.totalAmount && { totalValue: String(parsed.totalAmount) }),
              }
            } catch {
              // Not JSON, set offerId to null (unlinking)
              updateBody = { offerId: payload.newValue || null }
            }
          } else {
            // Regular field update
            updateBody = { [payload.prop]: payload.newValue }
          }

          const response = await apiCall<{ error?: string }>(
            `/api/frc_projects/projects/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateBody),
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
        const response = await apiCall<{ perspective: { id: string } }>('/api/perspectives/frc_projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.perspective?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_projects'] })
        } else {
          flash('Failed to save perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_SELECT]: (payload: PerspectiveSelectEvent) => {
        setActivePerspectiveId(payload.id)
        if (payload.id === null) {
          // Reset to defaults when "All" is selected
          setFilters([])
          setSortField('createdAt')
          setSortDir('desc')
        } else if (payload.config) {
          setFilters(payload.config.filters)
          if (payload.config.sorting.length > 0) {
            setSortField(payload.config.sorting[0].field)
            setSortDir(payload.config.sorting[0].direction)
          }
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

  const handleWizardCreated = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['frc_projects'] })
    setShowWizard(false)
  }, [queryClient])

  if (isLoading && !data) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={7} />
      </div>
    )
  }

  return (
    <div onKeyDown={handleTableKeyDown}>
      {/* Header with New Project button */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
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

      {/* Project Wizard Drawer */}
      <ProjectWizardDrawer
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={handleWizardCreated}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={projectToDelete?.projectNumber}
        itemType="project"
        isDeleting={isDeleting}
      />
    </div>
  )
}
