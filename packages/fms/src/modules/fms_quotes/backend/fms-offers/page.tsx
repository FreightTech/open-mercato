'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Eye, FileText } from 'lucide-react'
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
  createEntitySearchEditor,
  useFilterSuggestions,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
  FilterRow,
  PerspectiveChangeEvent,
  PerspectiveConfig,
  SortRule,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { OfferDetailDrawer } from '../../components/OfferDetailDrawer'
import type { FmsOfferStatus } from '../../data/types'

interface FmsOfferRow {
  id: string
  offerNumber: string
  version: number
  status: FmsOfferStatus
  quoteId?: string | null
  quoteNumber?: string | null
  clientId?: string | null
  clientName?: string | null
  originPortCode?: string | null
  destinationPortCode?: string | null
  validUntil?: string | null
  currencyCode?: string
  paymentTerms?: string | null
  createdAt: string
  assignedTo?: { id: string; name: string; email: string } | null
  documentId?: string | null
  operationalGuardianId?: string | null
  operationalGuardianName?: string | null
  businessGuardianId?: string | null
  businessGuardianName?: string | null
  quote?: {
    id: string
    quoteNumber?: string | null
    clientName?: string | null
    originPortCode?: string | null
    destinationPortCode?: string | null
  }
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    expired: 'bg-orange-100 text-orange-800',
    superseded: 'bg-purple-100 text-purple-600 italic',
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

const VersionRenderer = ({ value }: { value: number }) => {
  return <span className="text-xs text-muted-foreground">v{value}</span>
}

const DateRenderer = ({ value, format = 'short' }: { value: string; format?: 'short' | 'full' }) => {
  if (!value) return <span>-</span>
  const date = new Date(value)
  const now = new Date()
  const isExpired = date < now
  let formatted: string
  if (format === 'full') {
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    formatted = `${day}/${month}/${year}`
  } else {
    formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return (
    <span className={isExpired ? 'text-red-600' : ''}>{formatted}</span>
  )
}

// Status options for dropdown editor
const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'declined', 'expired']

const PdfRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  return (
    <a
      href={`/api/fms_documents/documents/${value}/download`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 hover:text-blue-800"
      title="Download PDF"
    >
      <FileText className="h-4 w-4" />
    </a>
  )
}

// Helper: Parse filter parameters from URL
function parseOffersFiltersFromUrl(searchParams: URLSearchParams | null): FilterRow[] {
  if (!searchParams) return []
  const filters: FilterRow[] = []
  
  // Handle status parameter (can be comma-separated)
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
function serializeOffersFiltersToUrl(filters: FilterRow[]): string {
  const params = new URLSearchParams()
  
  filters.forEach(filter => {
    if (filter.field === 'status' && filter.values.length > 0) {
      params.set('status', filter.values.join(','))
    }
    // Add other filterable fields here as needed
  })
  
  return params.toString()
}

export default function OffersListPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [offerToDelete, setOfferToDelete] = useState<FmsOfferRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>(() => {
    // Initialize filters from URL params (only on mount)
    return parseOffersFiltersFromUrl(searchParams)
  })
  const [filtersInitialized, setFiltersInitialized] = useState(false)
  
  // State for perspectives
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Server-side filter suggestions for large datasets
  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'fms_quotes:fms_offer',
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

  const { data, isLoading } = useQuery({
    queryKey: ['fms_offers', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FmsOfferRow[]; total: number; totalPages?: number }>(
        `/api/fms_quotes/offers?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load offers')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => {
    return (data?.items ?? []).map((offer) => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      version: offer.version,
      status: offer.status,
      quoteId: offer.quoteId || offer.quote?.id || null,
      quoteNumber: offer.quote?.quoteNumber || `#${offer.quote?.id?.slice(0, 8) || '...'}`,
      clientName: offer.clientName || '-',
      validUntil: offer.validUntil,
      createdAt: offer.createdAt,
      documentId: offer.documentId || null,
      operationalGuardianId: offer.operationalGuardianId || null,
      operationalGuardianName: offer.operationalGuardianName || null,
      businessGuardianId: offer.businessGuardianId || null,
      businessGuardianName: offer.businessGuardianName || null,
    }))
  }, [data?.items])

  // Bidirectional sync: Update URL when filters change
  useEffect(() => {
    // Skip on first render to avoid double-sync
    if (!filtersInitialized) {
      setFiltersInitialized(true)
      return
    }
    
    // Build new URL with current filters
    const filterParams = serializeOffersFiltersToUrl(filters)
    const currentPath = '/backend/fms-offers'
    const newUrl = filterParams ? `${currentPath}?${filterParams}` : currentPath
    
    // Get current URL params
    const currentFilterParams = serializeOffersFiltersToUrl(parseOffersFiltersFromUrl(searchParams))
    
    // Only update URL if filter params changed
    if (filterParams !== currentFilterParams) {
      router.replace(newUrl, { scroll: false })
    }
  }, [filters, router, filtersInitialized, searchParams])

  const handleOfferClick = useCallback((offerId: string) => {
    setSelectedOfferId(offerId)
  }, [])

  // Entity search editor config for quote selection
  const quoteEditorConfig = useMemo(() => ({
    entityType: 'fms_quotes:fms_quote',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, number: r.presenter?.title || '' }),
    placeholder: 'Search quotes...',
    minQueryLength: 2,
  }), [])

  // Entity search editor configs for guardian selection
  const operationalGuardianEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  const businessGuardianEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'offerNumber',
      title: 'Offer',
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: string, rowData: FmsOfferRow) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOfferClick(rowData.id)
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      data: 'status',
      title: 'Status',
      width: 100,
      type: 'dropdown',
      readOnly: false,
      source: STATUS_OPTIONS.map((s) => ({ value: s, label: s.toUpperCase() })),
      renderer: (value) => <StatusRenderer value={value} />,
    },
    {
      data: 'version',
      title: 'Ver',
      width: 45,
      type: 'numeric',
      readOnly: false,
      renderer: (value) => <VersionRenderer value={value} />,
    },
    {
      data: 'quoteId',
      title: 'Quote',
      width: 110,
      readOnly: false,
      editor: createEntitySearchEditor(quoteEditorConfig),
      renderer: (_value: string, rowData: FmsOfferRow) => (
        <span className="block truncate max-w-[100px]" title={rowData.quoteNumber || ''}>
          {rowData.quoteNumber || '-'}
        </span>
      ),
    },
    {
      data: 'clientName',
      title: 'Client',
      width: 140,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate">{value || '-'}</span>
      ),
    },
    {
      data: 'operationalGuardianName',
      title: 'Ops Guardian',
      width: 140,
      readOnly: false,
      editor: createEntitySearchEditor(operationalGuardianEditorConfig),
      renderer: (value: string) => (
        <span className="truncate text-sm">{value || '-'}</span>
      ),
    },
    {
      data: 'businessGuardianName',
      title: 'Biz Guardian',
      width: 140,
      readOnly: false,
      editor: createEntitySearchEditor(businessGuardianEditorConfig),
      renderer: (value: string) => (
        <span className="truncate text-sm">{value || '-'}</span>
      ),
    },
    {
      data: 'documentId',
      title: 'PDF',
      width: 45,
      type: 'text',
      readOnly: true,
      renderer: (value) => <PdfRenderer value={value} />,
    },
    {
      data: 'validUntil',
      title: 'Valid Until',
      width: 100,
      type: 'date',
      readOnly: false,
      renderer: (value) => <DateRenderer value={value} format="full" />,
    },
    {
      data: 'createdAt',
      title: 'Created',
      width: 80,
      type: 'date',
      readOnly: true,
      renderer: (value) => {
        if (!value) return <span>-</span>
        const date = new Date(value)
        const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return <span>{formatted}</span>
      },
    },
  ], [handleOfferClick, quoteEditorConfig, operationalGuardianEditorConfig, businessGuardianEditorConfig])

  const handleConfirmDelete = useCallback(async () => {
    if (!offerToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall<{ error?: string }>(`/api/fms_quotes/offers/${offerToDelete.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Offer deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        setOfferToDelete(null)
      } else {
        flash(response.result?.error || 'Failed to delete offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete offer', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [offerToDelete, queryClient])

  // Create URL filter perspective (memoized to prevent recreation)
  const urlFilterPerspective = useMemo(() => {
    if (columns.length === 0) return null
    
    const urlFilters = parseOffersFiltersFromUrl(searchParams)
    if (urlFilters.length === 0) return null
    
    const allCols = columns.map(c => c.data)
    return {
      id: '__url_filters__',
      name: 'Filters from URL',
      columns: { visible: allCols, hidden: [] },
      filters: urlFilters,
      sorting: [{ id: sortField, field: sortField, direction: sortDir }],
    }
  }, [columns, searchParams, sortField, sortDir])

  // Sync URL filter perspective to state
  // Track if we've initialized to prevent setting activeId after user clears it
  const hasInitializedOfferPerspectiveRef = useRef(false)
  
  useEffect(() => {
    if (urlFilterPerspective) {
      setSavedPerspectives([urlFilterPerspective])
      // Only auto-set activePerspectiveId on initial load, not when user clears filters
      if (!hasInitializedOfferPerspectiveRef.current) {
        setActivePerspectiveId('__url_filters__')
        hasInitializedOfferPerspectiveRef.current = true
      }
    } else {
      setSavedPerspectives([])
    }
  }, [urlFilterPerspective])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open detail', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete offer', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FmsOfferRow) => {
    if (actionId === 'view') {
      setSelectedOfferId(rowData.id)
    } else if (actionId === 'delete') {
      if (rowData.status === 'draft') {
        setOfferToDelete(rowData)
      } else {
        flash('Only draft offers can be deleted', 'warning')
      }
    }
  }, [])

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      const selectedCell = tableRef.current?.querySelector('td[data-cell-selected="true"]') as HTMLElement | null
      if (!selectedCell) return
      const rowIndex = selectedCell.getAttribute('data-row')
      if (rowIndex === null) return
      const row = tableData[Number(rowIndex)] as FmsOfferRow | undefined
      if (row?.id) {
        if (row.status === 'draft') {
          setOfferToDelete(row)
        } else {
          flash('Only draft offers can be deleted', 'warning')
        }
      }
    }
  }, [tableData])

  const actionsRenderer = useCallback((rowData: FmsOfferRow, _rowIndex: number) => {
    if (!rowData.id) return null
    const canDelete = rowData.status === 'draft'
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSelectedOfferId(rowData.id)
          }}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title="View"
        >
          <Eye className="h-4 w-4" />
        </button>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOfferToDelete(rowData)
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
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
          // Handle empty string as null for optional fields
          let value = payload.newValue
          let fieldName = payload.prop
          const updates: Record<string, unknown> = {}

          if (payload.prop === 'assignedToId' && value === '') {
            value = null
          }

          // Handle entity search editor JSON values
          if (payload.prop === 'quoteId') {
            try {
              const parsed = JSON.parse(String(value || ''))
              updates.quoteId = parsed.id || null
            } catch {
              updates.quoteId = value || null
            }
          } else if (payload.prop === 'operationalGuardianName') {
            try {
              const parsed = JSON.parse(String(value || ''))
              updates.operationalGuardianId = parsed.id || null
            } catch {
              updates.operationalGuardianId = null
            }
          } else if (payload.prop === 'businessGuardianName') {
            try {
              const parsed = JSON.parse(String(value || ''))
              updates.businessGuardianId = parsed.id || null
            } catch {
              updates.businessGuardianId = null
            }
          } else {
            updates[fieldName] = value
          }

          const response = await apiCall<{ error?: string }>(`/api/fms_quotes/offers/${payload.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          })

          if (response.ok) {
            flash('Offer updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            // Refresh the table data
            queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
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
        
        // Clear URL filter perspective when filters are manually cleared
        if (payload.filters.length === 0 && activePerspectiveId === '__url_filters__') {
          setActivePerspectiveId(null)
        }
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
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Only show skeleton on initial load, not during refetches
  if (isLoading && !data) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={9} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        {/* onKeyDown wrapper intercepts Cmd/Ctrl+D during edit mode to prevent browser bookmark */}
        <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Freight Offers"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          actionsRenderer={actionsRenderer}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          loadFilterSuggestions={loadFilterSuggestions}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
            readOnlyStyle: 'normal',
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

        {/* Delete confirmation dialog */}
        <Dialog open={!!offerToDelete} onOpenChange={(open) => !open && setOfferToDelete(null)}>
          <DialogContent
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              tableRef.current?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete Offer</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete offer &quot;{offerToDelete?.offerNumber}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOfferToDelete(null)}
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

        {/* Offer detail drawer */}
        <OfferDetailDrawer
          offerId={selectedOfferId}
          open={!!selectedOfferId}
          onClose={() => setSelectedOfferId(null)}
          onDelete={() => {
            queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
          }}
          mainTableRef={tableRef}
        />
      </PageBody>
    </Page>
  )
}
