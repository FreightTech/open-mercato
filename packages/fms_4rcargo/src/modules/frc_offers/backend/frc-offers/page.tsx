'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Check } from 'lucide-react'
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
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { AcceptOfferDialog } from '../../components/AcceptOfferDialog'

interface FrcOfferRow {
  id: string
  name: string
  rfqId: string
  rfqNumber?: string | null
  totalAmount?: number | null
  currency: string
  status: string
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

const RENDERERS: Record<string, (value: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Offer', width: 200, type: 'text', readOnly: true },
  { data: 'rfqNumber', title: 'RFQ', width: 120, type: 'text', readOnly: true },
  { data: 'totalAmount', title: 'Total Amount', width: 120, type: 'numeric' },
  { data: 'currency', title: 'Currency', width: 80, type: 'text' },
  { data: 'status', title: 'Status', width: 100, type: 'text', readOnly: true, renderer: RENDERERS.StatusRenderer },
  { data: 'validUntil', title: 'Valid Until', width: 120, type: 'date' },
  { data: 'notes', title: 'Notes', width: 200, type: 'text' },
]

export default function FrcOffersPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Accept dialog state
  const [acceptDialogOffer, setAcceptDialogOffer] = useState<OfferDetailForAccept | null>(null)

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

  // Actions renderer with Accept icon
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
            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
            title="Accept Offer"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }, [handleAcceptOffer])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'accept', label: 'Accept offer', key: 'Enter', shift: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcOfferRow) => {
    if (actionId === 'accept' && rowData.id) {
      const canAccept = rowData.status === 'sent' || rowData.status === 'draft'
      if (canAccept) {
        handleAcceptOffer(rowData.id)
      } else {
        flash(`Cannot accept offer with status "${rowData.status}"`, 'error')
      }
    }
  }, [handleAcceptOffer])

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

  const topBarButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled>
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

      {/* Accept Offer Dialog */}
      <AcceptOfferDialog
        offer={acceptDialogOffer}
        open={!!acceptDialogOffer}
        onClose={() => setAcceptDialogOffer(null)}
      />
    </div>
  )
}
