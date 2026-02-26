'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2, Eye, FileDown } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { AcceptOfferDialog } from '../../components/AcceptOfferDialog'
import { ExportReportDialog } from '../../components/ExportReportDialog'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'
import { FRC_OFFER_STATUSES } from '../../../../lib/types'

interface FrcOfferRow {
  id: string
  name: string
  rfqId: string
  rfqName?: string | null
  totalAmount?: number | null
  currencyCode: string
  status: string
  departureDate?: string | null
  validUntil?: string | null
  notes?: string | null
  assignedToId?: string | null
  assignedToName?: string | null
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

const STATUS_OPTIONS = FRC_OFFER_STATUSES.map((s) => ({
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
  if (!value) return <span className="text-muted-foreground">-</span>
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

const RfqNameRenderer = ({ value, row }: { value: string; row: FrcOfferRow }) => {
  // For new rows, value might be JSON from EntitySearchEditor
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
  
  return <span>{displayName}</span>
}

const UserNameRenderer = ({ value, row }: { value: string; row: FrcOfferRow }) => {
  // Value might be JSON from EntitySearchEditor
  let displayName = row?.assignedToName || value
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      displayName = parsed.name || value
    } catch {
      // Use value as-is
    }
  }

  if (!displayName) return <span className="text-muted-foreground">-</span>
  return <span className="text-foreground">{displayName}</span>
}

const RENDERERS: Record<string, (value: any, row?: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  NameLinkRenderer: (value, row) => <NameLinkRenderer value={value} row={row} />,
  RfqNameRenderer: (value, row) => <RfqNameRenderer value={value} row={row} />,
  UserNameRenderer: (value, row) => <UserNameRenderer value={value} row={row} />,
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

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [offerToDelete, setOfferToDelete] = useState<FrcOfferRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // Custom filter suggestions - uses custom endpoint that handles rfqName specially
  const loadFilterSuggestions = useCallback(async (field: string, query: string): Promise<string[]> => {
    try {
      const params = new URLSearchParams({ field, query: query || '' })
      const result = await apiCall<{ items: string[] }>(
        `/api/frc_offers/filter-suggestions?${params.toString()}`,
        { credentials: 'include' }
      )
      return result.ok ? (result.result?.items ?? []) : []
    } catch (error) {
      console.error('[FrcOffers] Failed to fetch filter suggestions:', error)
      return []
    }
  }, [])

  // EntitySearchEditor config for opportunity selection
  const rfqEditorConfig = useMemo(() => ({
    entityType: 'frc_rfqs:frc_rfq',
    extractValue: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
        shipmentReadyDate: r.fields?.shipment_ready_date ?? r.fields?.shipmentReadyDate ?? null,
        currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? 'EUR',
        amount: r.fields?.amount ?? null,
      }),
    additionalFields: (r: { fields?: Record<string, unknown> }) => ({
      departureDate: r.fields?.shipment_ready_date ?? r.fields?.shipmentReadyDate ?? null,
      currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? 'EUR',
      totalAmount: r.fields?.amount ?? null,
    }),
    placeholder: 'Search opportunities...',
    minQueryLength: 2,
  }), [])

  // User editor config for assigned to field
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
      }),
    placeholder: 'Search users...',
    minQueryLength: 2,
  }), [])

  // Define columns with proper editors
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: 'Offer Name',
      width: 180,
      type: 'text',
      renderer: RENDERERS.NameLinkRenderer,
    },
    {
      data: 'rfqName',
      title: 'Opportunity',
      width: 220,
      type: 'text',
      renderer: RENDERERS.RfqNameRenderer,
      editor: createEntitySearchEditor(rfqEditorConfig),
    },
    {
      data: 'status',
      title: 'Status',
      width: 110,
      type: 'dropdown',
      source: STATUS_OPTIONS,
      renderer: RENDERERS.StatusRenderer,
    },
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 80,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
    {
      data: 'departureDate',
      title: 'Departure',
      width: 120,
      type: 'date',
      renderer: RENDERERS.DateRenderer,
    },
    {
      data: 'totalAmount',
      title: 'Total Amount',
      width: 120,
      type: 'numeric',
    },
    {
      data: 'validUntil',
      title: 'Valid Until',
      width: 120,
      type: 'date',
      renderer: RENDERERS.DateRenderer,
    },
    {
      data: 'assignedToName',
      title: 'Assigned To',
      width: 150,
      type: 'text',
      renderer: RENDERERS.UserNameRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'notes',
      title: 'Notes',
      width: 200,
      type: 'text',
    },
  ], [rfqEditorConfig, userEditorConfig])

  // Get the active perspective for export dialog
  const activePerspective = useMemo(() => {
    return savedPerspectives.find((p) => p.id === activePerspectiveId) ?? null
  }, [savedPerspectives, activePerspectiveId])

  // Compute visible columns for export (based on perspective or all columns)
  const visibleColumnsForExport = useMemo(() => {
    const allColumnDefs = columns.map((c) => ({ 
      data: c.data, 
      title: c.title ?? c.data, 
      width: c.width 
    }))
    
    if (activePerspective) {
      // Use perspective's visible columns, maintaining order
      return activePerspective.columns.visible
        .map((colData) => allColumnDefs.find((c) => c.data === colData))
        .filter((c): c is { data: string; title: string; width: number | undefined } => c !== undefined)
    }
    
    return allColumnDefs
  }, [columns, activePerspective])

  // Export button for toolbar
  const exportButton = useMemo(() => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setExportDialogOpen(true)}
      className="gap-1.5"
    >
      <FileDown className="h-4 w-4" />
      Export PDF
    </Button>
  ), [])

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

  const handleAcceptOffer = useCallback(async (offerId: string) => {
    // Fetch full offer details including airports
    const call = await apiCall<OfferDetailForAccept>(`/api/frc_offers/offers/${offerId}`)
    if (call.ok && call.result) {
      setAcceptDialogOffer(call.result)
    } else {
      flash('Failed to load offer details', 'error')
    }
  }, [])

  // Actions renderer with Accept, View, and Delete icons
  const actionsRenderer = useCallback((rowData: FrcOfferRow, _rowIndex: number) => {
    if (!rowData.id) return null
    
    // Only show Accept button for sent/draft offers
    const canAccept = rowData.status === 'sent' || rowData.status === 'draft'
    
    return (
      <div className="flex items-center gap-1">
        {canAccept && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAcceptOffer(rowData.id)
            }}
            className="p-1 rounded text-muted-foreground hover:bg-green-100 hover:text-green-600 transition-colors cursor-pointer"
            title="Accept Offer"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <Link
          href={`/backend/frc-offers/${rowData.id}`}
          className="p-1 rounded text-muted-foreground hover:bg-blue-100 hover:text-blue-600 transition-colors"
          title="View Details"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="w-4 h-4" />
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onOfferDeleteHandler) {
              onOfferDeleteHandler(rowData)
            }
          }}
          className="p-1 rounded text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"
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

  // Handle Ctrl+D to prevent browser bookmark dialog
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  // Handle inline row creation
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    const { rowIndex, rowData } = payload

    console.log('[FrcOffer] NEW_ROW_SAVE triggered with rowData:', JSON.stringify(rowData, null, 2))

    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      // Parse opportunity from JSON (EntitySearchEditor returns JSON string)
      let rfqId: string | null = null
      let rfqName = ''
      let rfqShipmentReadyDate: string | null = null
      let rfqCurrencyCode = 'EUR'
      let rfqAmount: string | null = null

      if (rowData.rfqName) {
        console.log('[FrcOffer] Parsing rfqName:', rowData.rfqName)
        try {
          const parsed = JSON.parse(rowData.rfqName)
          rfqId = parsed.id || null
          rfqName = parsed.name || ''
          rfqShipmentReadyDate = parsed.shipmentReadyDate || null
          rfqCurrencyCode = parsed.currencyCode || 'EUR'
          rfqAmount = parsed.amount || null
          console.log('[FrcOffer] Parsed opportunity:', { rfqId, rfqName, rfqShipmentReadyDate, rfqCurrencyCode, rfqAmount })
        } catch (e) {
          // Not JSON, might be a direct string - this shouldn't happen with EntitySearchEditor
          console.log('[FrcOffer] Failed to parse rfqName as JSON:', e)
          rfqId = null
        }
      }

      if (!rfqId) {
        throw new Error('Please select an opportunity')
      }

      // Build offer data
      const offerData = {
        rfqId,
        name: rowData.name?.trim() || `Offer - ${rfqName}`,
        status: rowData.status || 'draft',
        currencyCode: rowData.currencyCode || rfqCurrencyCode,
        // Use departure date from row or auto-populated from RFQ
        departureDate: rowData.departureDate || rfqShipmentReadyDate || null,
        // Use total amount from row or auto-populated from RFQ
        totalRate: rowData.totalAmount || rfqAmount || null,
        validUntil: rowData.validUntil || null,
        notes: rowData.notes || null,
      }

      console.log('[FrcOffer] Built offerData:', JSON.stringify(offerData, null, 2))

      // Validate name
      if (!offerData.name) {
        throw new Error('Offer name is required')
      }

      console.log('[FrcOffer] Calling API to create offer...')
      const response = await apiCall<{ id: string; error?: string; autoPopulated?: { offerLines: number; airRouting: number } }>(
        '/api/frc_offers/offers',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(offerData),
        }
      )

      console.log('[FrcOffer] API response:', response.ok, response.result)

      if (!response.ok || !response.result?.id) {
        const error = response.result?.error || 'Failed to create offer'
        throw new Error(error)
      }

      // Show success message with auto-populated info
      const autoInfo = response.result.autoPopulated
      let successMessage = 'Offer created'
      if (autoInfo && (autoInfo.offerLines > 0 || autoInfo.airRouting > 0)) {
        const parts: string[] = []
        if (autoInfo.offerLines > 0) parts.push(`${autoInfo.offerLines} cargo lines`)
        if (autoInfo.airRouting > 0) parts.push('routing')
        successMessage = `Offer created with ${parts.join(' and ')}`
      }
      flash(successMessage, 'success')

      console.log('[FrcOffer] Dispatching NEW_ROW_SAVE_SUCCESS')
      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...offerData, id: response.result.id, rfqName },
      })

      console.log('[FrcOffer] Invalidating queries')
      queryClient.invalidateQueries({ queryKey: ['frc_offers'] })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create offer'
      console.error('[FrcOffer] Error creating offer:', errorMessage, error)
      flash(errorMessage, 'error')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex,
        error: errorMessage,
      })
    }
  }, [queryClient])

  useEventHandlers(
    {
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,

      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          // Handle entity search columns - parse JSON to get IDs
          let updateData: Record<string, unknown> = {}
          
          if (payload.prop === 'rfqName') {
            try {
              const parsed = JSON.parse(String(payload.newValue || ''))
              updateData = { rfqId: parsed.id || null }
            } catch {
              updateData = { rfqId: null }
            }
          } else if (payload.prop === 'assignedToName') {
            // Parse JSON from entity search to get assignedToId
            try {
              const parsed = JSON.parse(String(payload.newValue))
              updateData = { assignedToId: parsed.id || null }
            } catch {
              // Not JSON, set assignedToId to null (unlinking)
              updateData = { assignedToId: payload.newValue || null }
            }
          } else {
            updateData = { [payload.prop]: payload.newValue }
          }

          const response = await apiCall<{ error?: string }>(
            `/api/frc_offers/offers/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateData),
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
        const response = await apiCall<{ perspective: { id: string } }>('/api/perspectives/frc_offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.perspective?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_offers'] })
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

  return (
    <div onKeyDown={handleTableKeyDown}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
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
        loadFilterSuggestions={loadFilterSuggestions}
        uiConfig={{
          hideAddRowButton: false, // Enable inline row creation
          topBarEnd: exportButton,
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

      {/* Export Report Dialog */}
      <ExportReportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        perspectiveName={activePerspective?.name ?? null}
        visibleColumns={visibleColumnsForExport}
        currentFilters={filters}
        currentSorting={[{ id: sortField, field: sortField, direction: sortDir }]}
      />
    </div>
  )
}
