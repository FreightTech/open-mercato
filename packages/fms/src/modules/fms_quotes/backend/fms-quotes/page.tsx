'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
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
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  FilterRow,
  ColumnDef,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
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
import { useTableConfig } from '../../components/useTableConfig'
import { QuotePreviewDrawer } from '../../components/QuotePreviewDrawer'
import { QuoteWizardDrawer } from '../../components/QuoteWizard'

interface ClientRef {
  id: string
  name: string
  shortName?: string | null
}

interface PortRef {
  id: string
  locode?: string | null
  name: string
  city?: string | null
  country?: string | null
}

interface FmsQuoteRow {
  id: string
  quoteNumber: string
  client?: ClientRef | null
  status: string
  direction: string
  incoterm?: string | null
  cargoType: string
  originPorts?: PortRef[]
  destinationPorts?: PortRef[]
  validUntil?: string | null
  currencyCode: string
  notes?: string | null
  createdAt: string
  updatedAt: string
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    ready: 'bg-blue-100 text-blue-800',
    offered: 'bg-indigo-100 text-indigo-800',
    won: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800',
    expired: 'bg-yellow-100 text-yellow-800',
    archived: 'bg-gray-200 text-gray-600',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span
      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getStatusColor(value)}`}
    >
      {value.toUpperCase()}
    </span>
  )
}

// Global ref to store the quote click handler (set by the page component)
let onQuoteClickHandler: ((quoteId: string) => void) | null = null

export function setQuoteClickHandler(handler: ((quoteId: string) => void) | null) {
  onQuoteClickHandler = handler
}

const QuoteNumberRenderer = ({ value, rowData }: { value: string; rowData: { id: string } }) => {
  const displayValue = value || `#${rowData.id?.slice(0, 8) || '...'}`
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onQuoteClickHandler && rowData.id) {
          onQuoteClickHandler(rowData.id)
        }
      }}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
    >
      {displayValue}
    </button>
  )
}

// Renderer for relation columns that may contain JSON or plain string
const RelationNameRenderer = ({ value }: { value: unknown }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  const strValue = String(value)
  if (!strValue || strValue === 'null') return <span className="text-muted-foreground">-</span>

  // Try to parse as JSON (from search selection)
  let displayName: string | null = null
  try {
    const parsed = JSON.parse(strValue)
    if (parsed && typeof parsed === 'object' && 'name' in parsed) {
      displayName = parsed.name
    }
  } catch {
    // Not JSON, display as-is (plain string from API)
  }
  if (displayName !== null) {
    return <span>{displayName}</span>
  }
  return <span>{strValue}</span>
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  QuoteNumberRenderer: (value, rowData) => <QuoteNumberRenderer value={value} rowData={rowData} />,
  RelationNameRenderer: (value) => <RelationNameRenderer value={value} />,
}

// Helper: Parse filter parameters from URL
function parseQuotesFiltersFromUrl(searchParams: URLSearchParams | null): FilterRow[] {
  if (!searchParams) return []
  const filters: FilterRow[] = []
  
  const status = searchParams.get('status')
  if (status) {
    const values = status.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length > 0) {
      filters.push({ 
        id: 'url-filter-status',  // Stable ID for consistent referential equality
        field: 'status', 
        operator: 'is_any_of',  // Always use is_any_of for dropdown fields
        values: values 
      })
    }
  }
  
  return filters
}

// Helper: Serialize filters to URL query string
function serializeQuotesFiltersToUrl(filters: FilterRow[]): string {
  const params = new URLSearchParams()
  
  filters.forEach(filter => {
    if (filter.field === 'status' && filter.values.length > 0) {
      params.set('status', filter.values.join(','))
    }
    // Add other filterable fields here as needed
  })
  
  return params.toString()
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

export default function FmsQuotesPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewQuoteId, setPreviewQuoteId] = useState<string | null>(null)
  const [wizardState, setWizardState] = useState<{
    open: boolean
    mode: 'new' | 'edit'
    quoteId: string | null
  }>({ open: false, mode: 'edit', quoteId: null })

  const [quoteToDelete, setQuoteToDelete] = useState<FmsQuoteRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>(() => {
    // Initialize filters from URL params (only on mount)
    return parseQuotesFiltersFromUrl(searchParams)
  })
  const [filtersInitialized, setFiltersInitialized] = useState(false)

  // Handle quoteId URL param to auto-open wizard
  useEffect(() => {
    const quoteIdParam = searchParams.get('quoteId')
    if (quoteIdParam && !wizardState.open) {
      setWizardState({ open: true, mode: 'edit', quoteId: quoteIdParam })
      // Clean URL param after opening
      router.replace('/backend/fms-quotes', { scroll: false })
    }
  }, [searchParams, wizardState.open, router])

  // Bidirectional sync: Update URL when filters change
  useEffect(() => {
    // Skip on first render to avoid double-sync
    if (!filtersInitialized) {
      setFiltersInitialized(true)
      return
    }
    
    // Build new URL with current filters
    const filterParams = serializeQuotesFiltersToUrl(filters)
    const currentPath = '/backend/fms-quotes'
    const newUrl = filterParams ? `${currentPath}?${filterParams}` : currentPath
    
    // Get current URL params (excluding quoteId which is handled separately)
    const currentFilterParams = serializeQuotesFiltersToUrl(parseQuotesFiltersFromUrl(searchParams))
    
    // Only update URL if filter params changed
    if (filterParams !== currentFilterParams) {
      router.replace(newUrl, { scroll: false })
    }
  }, [filters, router, filtersInitialized, searchParams])

  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  const { data: tableConfig, isLoading: configLoading } = useTableConfig('fms_quotes')

  // Server-side filter suggestions for large datasets
  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'fms_quotes:fms_quote',
  })

  // Editor configs for relation columns
  const clientEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
    minQueryLength: 2,
  }), [])

  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  // Register the quote click handler for the renderer - opens wizard in edit mode
  useEffect(() => {
    setQuoteClickHandler((quoteId: string) => {
      setWizardState({ open: true, mode: 'edit', quoteId })
    })
    return () => setQuoteClickHandler(null)
  }, [])

  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'fms_quotes'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/fms_quotes')
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
    queryKey: ['fms_quotes', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FmsQuoteRow[]; total: number; totalPages?: number }>(
        `/api/fms_quotes?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load quotes')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => {
    return (data?.items ?? []).map((quote) => {
      const camelCaseObject: Record<string, any> = { id: quote.id }

      Object.keys(quote).forEach((key) => {
        if (key === 'id') return

        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        const value = quote[key as keyof FmsQuoteRow]
        camelCaseObject[camelKey] = value
      })

      // Compute display strings for ports arrays
      if (quote.originPorts && Array.isArray(quote.originPorts)) {
        camelCaseObject.originPortsDisplay = quote.originPorts
          .map((p) => p.locode || p.name)
          .filter(Boolean)
          .join(', ')
      } else {
        camelCaseObject.originPortsDisplay = ''
      }

      if (quote.destinationPorts && Array.isArray(quote.destinationPorts)) {
        camelCaseObject.destinationPortsDisplay = quote.destinationPorts
          .map((p) => p.locode || p.name)
          .filter(Boolean)
          .join(', ')
      } else {
        camelCaseObject.destinationPortsDisplay = ''
      }

      // Remove raw port arrays - only keep display strings for the table
      delete camelCaseObject.originPorts
      delete camelCaseObject.destinationPorts
      // Remove totals - only needed in context panel
      delete camelCaseObject.totalCost
      delete camelCaseObject.totalSales

      return camelCaseObject
    })
  }, [data?.items])

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns.map((col) => {
      const baseCol = {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
        renderer: col.renderer ? RENDERERS[col.renderer] : undefined,
      }

      // Add custom editor and renderer for Client column
      if (col.data === 'clientName') {
        return {
          ...baseCol,
          readOnly: false,
          editor: createEntitySearchEditor(clientEditorConfig),
          renderer: RENDERERS.RelationNameRenderer,
        }
      }

      // Add custom editor and renderer for Assigned To column
      if (col.data === 'assignedToName') {
        return {
          ...baseCol,
          readOnly: false,
          editor: createEntitySearchEditor(userEditorConfig),
          renderer: RENDERERS.RelationNameRenderer,
        }
      }

      return baseCol
    }) as ColumnDef[]
  }, [tableConfig, clientEditorConfig, userEditorConfig])

  // Create URL filter perspective when URL has filters (memoized to prevent recreation)
  const urlFilterPerspective = useMemo(() => {
    if (columns.length === 0) return null
    
    const urlFilters = parseQuotesFiltersFromUrl(searchParams)
    if (urlFilters.length === 0) return null
    
    const allCols = columns.map((c) => c.data)
    return {
      id: '__url_filters__',
      name: 'Filters from URL',
      columns: { visible: allCols, hidden: [] },
      filters: urlFilters,
      sorting: [{ id: sortField, field: sortField, direction: sortDir }],
    }
  }, [columns, searchParams, sortField, sortDir])

  // Compute perspectives including URL filter perspective
  const computedPerspectives = useMemo(() => {
    if (!perspectivesData?.perspectives || columns.length === 0) {
      return { perspectives: [], activeId: null }
    }

    const allCols = columns.map((c) => c.data)
    const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
    
    if (urlFilterPerspective) {
      return {
        perspectives: [urlFilterPerspective, ...transformed],
        activeId: '__url_filters__'
      }
    }
    
    return {
      perspectives: transformed,
      activeId: perspectivesData.defaultPerspectiveId || null
    }
  }, [perspectivesData, columns, urlFilterPerspective])

  // Sync computed perspectives to state
  // Track if we've initialized to prevent setting activeId after user clears it
  const hasInitializedPerspectiveRef = useRef(false)
  
  useEffect(() => {
    if (computedPerspectives.perspectives.length > 0) {
      setSavedPerspectives(computedPerspectives.perspectives)
      
      // Only auto-set activePerspectiveId on initial load, not when user clears filters
      if (computedPerspectives.activeId && !hasInitializedPerspectiveRef.current) {
        setActivePerspectiveId(computedPerspectives.activeId)
        hasInitializedPerspectiveRef.current = true
      }
    }
  }, [computedPerspectives])

  const handleConfirmDelete = useCallback(async () => {
    if (!quoteToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall<{ error?: string }>(`/api/fms_quotes/${quoteToDelete.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Quote deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_quotes'] })
        setQuoteToDelete(null)
      } else {
        flash(response.result?.error || 'Failed to delete quote', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete quote', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [quoteToDelete, queryClient])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open quote wizard', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete quote', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FmsQuoteRow
    if (actionId === 'view') {
      setWizardState({ open: true, mode: 'edit', quoteId: row.id })
    } else if (actionId === 'delete') {
      setQuoteToDelete(row)
    }
  }, [])

  const actionsRenderer = useCallback((rowData: any, _rowIndex: number) => {
    const row = rowData as FmsQuoteRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setQuoteToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Handle relation columns - parse JSON to extract ID
          let updateData: Record<string, unknown> = {}

          if (payload.prop === 'clientName') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { clientId: parsed.id }
            } catch {
              updateData = { clientId: null }
            }
          } else if (payload.prop === 'assignedToName') {
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { assignedToId: parsed.id }
            } catch {
              updateData = { assignedToId: null }
            }
          } else {
            updateData = { [payload.prop]: payload.newValue }
          }

          const response = await apiCall<{ error?: string }>(`/api/fms_quotes/${payload.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (response.ok) {
            flash('Quote updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            // Refresh data to show updated client/user name from afterList hook
            if (payload.prop === 'clientName' || payload.prop === 'assignedToName') {
              queryClient.invalidateQueries({ queryKey: ['fms_quotes'] })
            }
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

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        const filteredRowData = Object.fromEntries(
          Object.entries(payload.rowData).filter(([_, value]) => value !== '')
        )

        try {
          const response = await apiCall<{ id: string; error?: string }>(`/api/fms_quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filteredRowData),
          })

          if (response.ok && response.result) {
            flash('Quote created', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: {
                ...payload.rowData,
                id: response.result.id,
              },
            } as NewRowSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['fms_quotes'] })
          } else {
            const error = response.result?.error || 'Creation failed'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error,
            } as NewRowSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
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
        
        // Clear URL filter perspective when filters are manually cleared
        // This prevents stale perspective ID from causing issues
        if (payload.filters.length === 0 && activePerspectiveId === '__url_filters__') {
          setActivePerspectiveId(null)
        }
      },

      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const settings = dynamicTableToApi(payload.perspective)
        const existingPerspective = savedPerspectives.find(
          (p) => p.name === payload.perspective.name
        )
        const response = await apiCall('/api/perspectives/fms_quotes', {
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
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_quotes'] })
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
          const response = await apiCall('/api/perspectives/fms_quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payload.id, name: payload.newName, settings }),
          })
          if (response.ok) {
            flash('Perspective renamed', 'success')
            queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_quotes'] })
          } else {
            flash('Failed to rename perspective', 'error')
          }
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        // Prevent deletion of virtual/system perspectives (IDs starting with __)
        if (payload.id.startsWith('__')) {
          flash('Cannot delete system perspective', 'info')
          return
        }
        
        const url = payload.hardDelete
          ? `/api/perspectives/fms_quotes/${payload.id}?hardDelete=true`
          : `/api/perspectives/fms_quotes/${payload.id}`
        const response = await apiCall(url, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'fms_quotes'] })
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

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        if (payload.config.sorting) {
          if (payload.config.sorting.length > 0) {
            const firstSort = payload.config.sorting[0]
            setSortField(firstSort.field)
            setSortDir(firstSort.direction)
          } else {
            setSortField('createdAt')
            setSortDir('desc')
          }
          setPage(1)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (configLoading || (dataLoading && !data)) {
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
          tableName="Freight Quotes"
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
            topBarEnd: (
              <Button onClick={() => setWizardState({ open: true, mode: 'new', quoteId: null })} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Quote
              </Button>
            ),
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
        <QuotePreviewDrawer
          quoteId={previewQuoteId}
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
        />
        <QuoteWizardDrawer
          quoteId={wizardState.quoteId}
          mode={wizardState.mode}
          open={wizardState.open}
          onClose={() => {
            setWizardState({ open: false, mode: 'edit', quoteId: null })
            queryClient.invalidateQueries({ queryKey: ['fms_quotes'] })
          }}
          mainTableRef={tableRef}
        />
        <Dialog open={!!quoteToDelete} onOpenChange={(open) => !open && setQuoteToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Quote</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete quote &quot;{quoteToDelete?.quoteNumber || `#${quoteToDelete?.id?.slice(0, 8)}`}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setQuoteToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
