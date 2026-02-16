'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Trash2, Eye } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { AcceptOfferDialog } from '../../components/AcceptOfferDialog'
import { FrcOfferCreateDialog } from '../../components/FrcOfferCreateDialog'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'

interface FrcOfferRow {
  id: string
  name: string
  rfqId: string
  rfqName?: string | null
  totalAmount?: number | null
  currency: string
  status: string
  departureDate?: string | null
  validUntil?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

interface OfferDetailForAccept {
  id: string
  name: string
  rfqId: string
  originAirport?: { id: string; code: string; city: string | null } | null
  destinationAirport?: { id: string; code: string; city: string | null } | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f3f4f6', text: '#374151' },
  sent: { bg: '#dbeafe', text: '#1e40af' },
  booked: { bg: '#d1fae5', text: '#065f46' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  expired: { bg: '#fef3c7', text: '#92400e' },
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

const NameLinkRenderer = ({ value, row }: { value: string; row: FrcOfferRow }) => {
  if (!row?.id) return <span>{value}</span>
  return (
    <Link 
      href={`/backend/frc-offers/${row.id}`}
      className="text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </Link>
  )
}

const RENDERERS: Record<string, (value: any, row?: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  NameLinkRenderer: (value, row) => <NameLinkRenderer value={value} row={row} />,
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Offer', width: 200, type: 'text', readOnly: true, renderer: RENDERERS.NameLinkRenderer },
  { data: 'rfqName', title: 'Opportunity', width: 180, type: 'text', readOnly: true },
  { data: 'departureDate', title: 'Departure', width: 120, type: 'date', renderer: RENDERERS.DateRenderer },
  { data: 'totalAmount', title: 'Total Amount', width: 120, type: 'numeric' },
  { data: 'currency', title: 'Currency', width: 80, type: 'text' },
  { data: 'status', title: 'Status', width: 100, type: 'text', readOnly: true, renderer: RENDERERS.StatusRenderer },
  { data: 'validUntil', title: 'Valid Until', width: 120, type: 'date', renderer: RENDERERS.DateRenderer },
  { data: 'createdAt', title: 'Created', width: 120, type: 'date', readOnly: true, renderer: RENDERERS.DateRenderer },
  { data: 'notes', title: 'Notes', width: 200, type: 'text' },
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

// Global ref for delete handler
let onOfferDeleteHandler: ((offer: FrcOfferRow) => void) | null = null

function setOfferDeleteHandler(handler: ((offer: FrcOfferRow) => void) | null) {
  onOfferDeleteHandler = handler
}

export default function FrcOffersPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const router = useRouter()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Accept dialog state
  const [acceptDialogOffer, setAcceptDialogOffer] = useState<OfferDetailForAccept | null>(null)

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [offerToDelete, setOfferToDelete] = useState<FrcOfferRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Register delete handler for action renderer
  const openDeleteDialog = useCallback((offer: FrcOfferRow) => {
    setOfferToDelete(offer)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setOfferDeleteHandler(openDeleteDialog)
    return () => setOfferDeleteHandler(null)
  }, [openDeleteDialog])

  // Handle view action - navigate to detail page
  const handleViewOffer = useCallback(
    (offerId: string) => {
      router.push(`/backend/frc-offers/${offerId}`)
    },
    [router]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!offerToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_offers/offers/${offerToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Offer deleted', 'success')
        setDeleteDialogOpen(false)
        setOfferToDelete(null)
        queryClient.invalidateQueries({ queryKey: ['frc_offers'] })
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
  }, [offerToDelete, queryClient])

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
    queryKey: ['frc_offers', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcOfferRow[]; total: number }>(
        `/api/frc_offers/offers?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load offers')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'frc_offers'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/frc_offers')
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

  const handleAcceptOffer = useCallback(async (offerId: string) => {
    // Fetch full offer details including airports
    const call = await apiCall<OfferDetailForAccept>(`/api/frc_offers/offers/${offerId}`)
    if (call.ok && call.result) {
      setAcceptDialogOffer(call.result)
    } else {
      flash('Failed to load offer details', 'error')
    }
  }, [])

  const handleCreateSuccess = useCallback(() => {
    setCreateDialogOpen(false)
    flash('Offer created', 'success')
    queryClient.invalidateQueries({ queryKey: ['frc_offers'] })
  }, [queryClient])

  // Actions renderer with View, Accept and Delete icons
  const actionsRenderer = useCallback((rowData: FrcOfferRow, _rowIndex: number) => {
    if (!rowData.id) return null
    
    // Only show Accept button for sent/draft offers
    const canAccept = rowData.status === 'sent' || rowData.status === 'draft'
    
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/backend/frc-offers/${rowData.id}`}
          className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
          title="View Details"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="w-4 h-4" />
        </Link>
        {canAccept && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAcceptOffer(rowData.id)
            }}
            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
            title="Accept Offer"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onOfferDeleteHandler) {
              onOfferDeleteHandler(rowData)
            }
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete Offer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [handleAcceptOffer])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View offer details', key: 'Enter', shift: true },
      { id: 'accept', label: 'Accept offer', key: 'a', ctrlOrCmd: true },
      { id: 'delete', label: 'Delete offer', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcOfferRow) => {
    if (actionId === 'view' && rowData.id) {
      handleViewOffer(rowData.id)
    } else if (actionId === 'accept' && rowData.id) {
      const canAccept = rowData.status === 'sent' || rowData.status === 'draft'
      if (canAccept) {
        handleAcceptOffer(rowData.id)
      } else {
        flash(`Cannot accept offer with status "${rowData.status}"`, 'error')
      }
    } else if (actionId === 'delete' && rowData.id) {
      openDeleteDialog(rowData)
    }
  }, [handleViewOffer, handleAcceptOffer, openDeleteDialog])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const response = await apiCall<{ error?: string }>(
            `/api/frc_offers/offers/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Offer updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_offers'] })
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
        const response = await apiCall<{ id: string }>('/api/perspectives/frc_offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_offers'] })
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
        const response = await apiCall(`/api/perspectives/frc_offers/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_offers'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/frc_offers/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_offers'] })
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
        <TableSkeleton rows={10} columns={9} />
      </div>
    )
  }

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        New Offer
      </Button>
    </div>
  )

  return (
    <div>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Offers"
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
          topBarEnd: topBarButtons,
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

      {/* Create Offer Dialog */}
      <FrcOfferCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleCreateSuccess}
      />

      {/* Accept Offer Dialog */}
      <AcceptOfferDialog
        offer={acceptDialogOffer}
        open={!!acceptDialogOffer}
        onClose={() => setAcceptDialogOffer(null)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={offerToDelete?.name}
        itemType="offer"
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          tableRef.current?.focus()
        }}
      />
    </div>
  )
}
