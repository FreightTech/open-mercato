'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, FileText } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { OfferDetailDrawer } from './OfferDetailDrawer'
import { FMS_OFFER_STATUSES, type FmsOfferStatus } from '../data/types'

type Offer = {
  id: string
  offerNumber: string
  version: number
  status: FmsOfferStatus
  validUntil?: string | null
  currencyCode: string
  totalAmount: string
  paymentTerms?: string | null
  createdAt: string
  updatedAt: string
  assignedTo?: { id: string; name: string; email: string } | null
  documentId?: string | null
}

type QuoteOffersSectionProps = {
  quoteId: string
  /** Optional external ref for the table - used by parent for focus management */
  tableRef?: React.RefObject<HTMLDivElement | null>
  /** Refs to adjacent DynamicTable containers for cross-table arrow navigation */
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    expired: 'bg-orange-100 text-orange-800',
    superseded: 'bg-purple-100 text-purple-600',
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

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  const date = new Date(value)
  const now = new Date()
  const isExpired = date < now
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return <span className={isExpired ? 'text-red-600' : ''}>{formatted}</span>
}

const AssignedToRenderer = ({ value }: { value: { name: string } | null }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  return <span className="text-xs">{value.name}</span>
}

const PdfRenderer = ({ value, rowData }: { value: string | null; rowData: Record<string, unknown> }) => {
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

// Status options for dropdown
const STATUS_OPTIONS = FMS_OFFER_STATUSES.map((status) => ({
  value: status,
  label: status.charAt(0).toUpperCase() + status.slice(1),
}))

export function QuoteOffersSection({ quoteId, tableRef: externalTableRef, siblingTableRefs }: QuoteOffersSectionProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const queryClient = useQueryClient()
  const [offerToDelete, setOfferToDelete] = React.useState<Offer | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [selectedOfferId, setSelectedOfferId] = React.useState<string | null>(null)

  // User editor config for Assigned To
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  const { data: offers, isLoading } = useQuery({
    queryKey: ['fms_offers', quoteId],
    queryFn: async () => {
      const response = await apiCall<{ items: Offer[] }>(`/api/fms_quotes/offers?quoteId=${quoteId}`)
      if (!response.ok) throw new Error('Failed to load offers')
      return response.result?.items || []
    },
    enabled: !!quoteId,
  })

  const handleOfferClick = useCallback((offerId: string) => {
    setSelectedOfferId(offerId)
  }, [])

  // Assigned To renderer that handles JSON value
  const assignedToEditableRenderer = useCallback((value: unknown) => {
    if (!value) return <span className="text-muted-foreground">-</span>
    // Handle both object format and JSON string format
    if (typeof value === 'object' && value !== null && 'name' in value) {
      return <span className="text-xs">{(value as { name: string }).name}</span>
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object' && 'name' in parsed) {
          return <span className="text-xs">{parsed.name}</span>
        }
      } catch {
        // Not JSON, display as-is
      }
      return <span className="text-xs">{value}</span>
    }
    return <span className="text-muted-foreground">-</span>
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'offerNumber',
      title: 'Offer',
      width: 110,
      type: 'text',
      readOnly: true,
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOfferClick(rowData.id as string)
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      data: 'version',
      title: 'Ver',
      width: 50,
      type: 'numeric',
      renderer: (value) => <VersionRenderer value={value} />,
    },
    {
      data: 'status',
      title: 'Status',
      width: 90,
      type: 'dropdown',
      source: STATUS_OPTIONS.map(o => o.label),
      renderer: (value) => <StatusRenderer value={value} />,
    },
    {
      data: 'assignedToDisplay',
      title: 'Assigned To',
      width: 120,
      renderer: assignedToEditableRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'documentId',
      title: 'PDF',
      width: 50,
      type: 'text',
      readOnly: true,
      renderer: (value, rowData) => <PdfRenderer value={value} rowData={rowData} />,
    },
    {
      data: 'validUntil',
      title: 'Valid Until',
      width: 90,
      type: 'date',
      renderer: (value) => <DateRenderer value={value} />,
    },
  ], [handleOfferClick, assignedToEditableRenderer, userEditorConfig])

  const tableData = useMemo(() => {
    return (offers || []).map((offer) => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      version: offer.version,
      status: offer.status.charAt(0).toUpperCase() + offer.status.slice(1), // Capitalize for dropdown
      validUntil: offer.validUntil || '',
      assignedTo: offer.assignedTo || null,
      assignedToDisplay: offer.assignedTo
        ? JSON.stringify({ id: offer.assignedTo.id, name: offer.assignedTo.name })
        : '',
      assignedToId: offer.assignedTo?.id || null,
      documentId: offer.documentId || null,
    }))
  }, [offers])

  // Handle offer updates
  const handleOfferUpdate = useCallback(async (offerId: string, field: string, value: unknown) => {
    const payload: Record<string, unknown> = {}

    if (field === 'status') {
      // Convert dropdown label back to lowercase value
      const statusValue = String(value).toLowerCase() as FmsOfferStatus
      payload.status = statusValue
    } else if (field === 'version') {
      payload.version = Number(value)
    } else if (field === 'assignedToDisplay') {
      // Handle assignedTo from entity search
      const strValue = String(value || '')
      try {
        const parsed = JSON.parse(strValue)
        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
          payload.assignedToId = parsed.id
        } else {
          payload.assignedToId = null
        }
      } catch {
        payload.assignedToId = null
      }
    } else if (field === 'validUntil') {
      payload.validUntil = value || null
    } else {
      payload[field] = value
    }

    const response = await apiCall(`/api/fms_quotes/offers/${offerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('Failed to update offer')
    }

    // Refresh the offers list
    queryClient.invalidateQueries({ queryKey: ['fms_offers', quoteId] })
  }, [queryClient, quoteId])

  // Event handlers for table cell edits
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          await handleOfferUpdate(payload.id as string, payload.prop, payload.newValue)

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
          flash(errorMessage, 'error')
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleDelete = useCallback(async () => {
    if (!offerToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/fms_quotes/offers/${offerToDelete.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Offer deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers', quoteId] })
        setOfferToDelete(null)
      } else {
        flash('Failed to delete offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Failed to delete offer', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [offerToDelete, queryClient, quoteId])

  const actionsRenderer = useCallback((rowData: Record<string, unknown>) => {
    const canDelete = rowData.status === 'draft'
    if (!canDelete) {
      return null
    }
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          const offer = offers?.find(o => o.id === rowData.id)
          if (offer) setOfferToDelete(offer)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [offers])

  if (isLoading) {
    return (
      <div className="border-t mt-4 pt-4">
        <TableSkeleton rows={3} columns={5} />
      </div>
    )
  }

  const offerCount = offers?.length || 0

  // Calculate table height based on offer count
  const tableHeight = Math.min(Math.max(offerCount * 40 + 100, 180), 300)

  return (
    <div className="border-t mt-4 pt-4">
      {offerCount === 0 ? (
        <div className="flex flex-col items-center justify-center border rounded-lg bg-muted/20 py-6 px-4">
          <p className="text-sm text-muted-foreground">
            No offers yet. Use the "Create Offer" button above to generate an offer.
          </p>
        </div>
      ) : (
        <div style={{ height: tableHeight }}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName="Offers"
            idColumnName="id"
            width="100%"
            height="100%"
            colHeaders={true}
            rowHeaders={false}
            stretchColumns={true}
            autoSelectOnFocus={true}
            siblingTableRefs={siblingTableRefs}
            uiConfig={{
              hideSearch: true,
              hideFilterButton: true,
              hideAddRowButton: true,
              hideBottomBar: true,
              enableFullscreen: true,
              readOnlyStyle: 'normal',
            }}
            actionsRenderer={actionsRenderer}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!offerToDelete} onOpenChange={(open) => !open && setOfferToDelete(null)}>
        <DialogContent>
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
              onClick={handleDelete}
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
          queryClient.invalidateQueries({ queryKey: ['fms_offers', quoteId] })
        }}
      />
    </div>
  )
}
