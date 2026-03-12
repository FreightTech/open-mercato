'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { Check, Trash2, Eye, FileDown } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
  createEntitySearchEditor,
  dispatch,
  TableEvents,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  NewRowSaveEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { AcceptOfferDialog } from '../../components/AcceptOfferDialog'
import { ExportReportDialog } from '../../components/ExportReportDialog'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'
import { FRC_OFFER_STATUSES } from '../../../../lib/types'
import { loadInitialUsers, loadInitialRfqs } from '../../../../lib/initialSuggestions'

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

export default function FrcOffersPage() {
  const router = useRouter()

  // Accept dialog state
  const [acceptDialogOffer, setAcceptDialogOffer] = useState<OfferDetailForAccept | null>(null)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [offerToDelete, setOfferToDelete] = useState<FrcOfferRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
    } catch {
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
    initialSuggestions: {
      loadItems: loadInitialRfqs,
      limit: 4,
    },
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
    initialSuggestions: {
      loadItems: loadInitialUsers,
      limit: 4,
    },
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

  const table = useDynamicTablePage<FrcOfferRow>({
    source: '/api/frc_offers/offers',
    columns,
    tableName: 'Offers',
    perspectives: 'frc_offers',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'frc_offers',
    create: {
      handler: async (payload, { tableRef, invalidate }) => {
        const { rowIndex, rowData } = payload

        dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

        try {
          // Parse opportunity from JSON (EntitySearchEditor returns JSON string)
          let rfqId: string | null = null
          let rfqName = ''
          let rfqShipmentReadyDate: string | null = null
          let rfqCurrencyCode = 'EUR'
          let rfqAmount: string | null = null

          if (rowData.rfqName) {
            try {
              const parsed = JSON.parse(rowData.rfqName)
              rfqId = parsed.id || null
              rfqName = parsed.name || ''
              rfqShipmentReadyDate = parsed.shipmentReadyDate || null
              rfqCurrencyCode = parsed.currencyCode || 'EUR'
              rfqAmount = parsed.amount || null
            } catch {
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
            departureDate: rowData.departureDate || rfqShipmentReadyDate || null,
            totalRate: rowData.totalAmount || rfqAmount || null,
            validUntil: rowData.validUntil || null,
            notes: rowData.notes || null,
          }

          if (!offerData.name) {
            throw new Error('Offer name is required')
          }

          const response = await apiCall<{ id: string; error?: string; autoPopulated?: { offerLines: number; airRouting: number } }>(
            '/api/frc_offers/offers',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(offerData),
            }
          )

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

          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
            rowIndex,
            savedRowData: { ...offerData, id: response.result.id, rfqName },
          })

          invalidate()
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create offer'
          flash(errorMessage, 'error')

          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: errorMessage,
          })
        }
      },
    },
    hooks: {
      beforeCellEdit: (payload) => {
        if (payload.prop === 'rfqName') {
          try {
            const parsed = JSON.parse(String(payload.newValue || ''))
            return { payload: { rfqId: parsed.id || null } }
          } catch {
            return { payload: { rfqId: null } }
          }
        }
        if (payload.prop === 'assignedToName') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { assignedToId: parsed.id || null } }
          } catch {
            return { payload: { assignedToId: payload.newValue || null } }
          }
        }
      },
    },
    tableProps: {
      height: 'calc(100vh - 110px)',
      loadFilterSuggestions,
      uiConfig: {
        hideAddRowButton: false,
        topBarEnd: exportButton,
      },
    },
  })

  // Get the active perspective for export dialog
  const activePerspective = useMemo(() => {
    const perspectives = table.props.savedPerspectives
    const activeId = table.props.activePerspectiveId
    if (!perspectives || !activeId) return null
    return perspectives.find((p) => p.id === activeId) ?? null
  }, [table.props.savedPerspectives, table.props.activePerspectiveId])

  // Compute visible columns for export (based on perspective or all columns)
  const visibleColumnsForExport = useMemo(() => {
    const allColumnDefs = columns.map((c) => ({
      data: c.data,
      title: c.title ?? c.data,
      width: c.width
    }))

    if (activePerspective) {
      return activePerspective.columns.visible
        .map((colData) => allColumnDefs.find((c) => c.data === colData))
        .filter((c): c is { data: string; title: string; width: number | undefined } => c !== undefined)
    }

    return allColumnDefs
  }, [columns, activePerspective])

  const handleAcceptOffer = useCallback(async (offerId: string) => {
    const call = await apiCall<OfferDetailForAccept>(`/api/frc_offers/offers/${offerId}`)
    if (call.ok && call.result) {
      setAcceptDialogOffer(call.result)
    } else {
      flash('Failed to load offer details', 'error')
    }
  }, [])

  // Handle view action - navigate to detail page
  const handleViewOffer = useCallback(
    (offerId: string) => {
      router.push(`/backend/frc-offers/${offerId}`)
    },
    [router]
  )

  // Open delete dialog for a row
  const openDeleteDialog = useCallback((offer: FrcOfferRow) => {
    setOfferToDelete(offer)
    setDeleteDialogOpen(true)
  }, [])

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
        table.refresh()
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
  }, [offerToDelete, table])

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

  // Actions renderer with Accept, View, and Delete icons
  const actionsRenderer = useCallback((rowData: unknown) => {
    const row = rowData as FrcOfferRow
    if (!row.id) return null

    const canAccept = row.status === 'sent' || row.status === 'draft'

    return (
      <div className="flex items-center gap-1">
        {canAccept && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleAcceptOffer(row.id)
            }}
            className="p-1 rounded text-muted-foreground hover:bg-green-100 hover:text-green-600 transition-colors cursor-pointer"
            title="Accept Offer"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <Link
          href={`/backend/frc-offers/${row.id}`}
          className="p-1 rounded text-muted-foreground hover:bg-blue-100 hover:text-blue-600 transition-colors"
          title="View Details"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="w-4 h-4" />
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation()
            openDeleteDialog(row)
          }}
          className="p-1 rounded text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"
          title="Delete Offer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [handleAcceptOffer, openDeleteDialog])

  if (table.isLoading) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={9} />
      </div>
    )
  }

  return (
    <div onKeyDown={handleTableKeyDown}>
      <DynamicTable
        {...table.props}
        actionsRenderer={actionsRenderer}
        onRowAction={handleRowAction}
        keyboardShortcuts={{
          rowActions: [
            { id: 'view', label: 'View offer details', key: 'Enter', shift: true },
            { id: 'accept', label: 'Accept offer', key: 'a', ctrlOrCmd: true },
            { id: 'delete', label: 'Delete offer', key: 'd', ctrlOrCmd: true },
          ],
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
          table.props.tableRef?.current?.focus()
        }}
      />

      {/* Export Report Dialog */}
      <ExportReportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        perspectiveName={activePerspective?.name ?? null}
        visibleColumns={visibleColumnsForExport}
        currentFilters={table.state.filters}
        currentSorting={[{ id: table.state.sortField, field: table.state.sortField, direction: table.state.sortDir }]}
      />
    </div>
  )
}
