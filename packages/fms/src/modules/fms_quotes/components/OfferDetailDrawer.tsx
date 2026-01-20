'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, ChevronRight, Send, Check, XCircle, Copy, Trash2, FileText, Download, Mail, FolderOpen } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Badge } from '@open-mercato/ui/primitives/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { FmsOfferStatus } from '../data/types'
import { SearchableSelect } from './SearchableSelect'
import { SendOfferDialog } from './SendOfferDialog'

type OfferLine = {
  id: string
  lineNumber: number
  productName?: string | null
  chargeCode?: string | null
  containerSize?: string | null
  chargeCategory?: string | null
  quantity: string
  unitPrice: string
  amount: string
  currencyCode: string
}

type Offer = {
  id: string
  offerNumber: string
  version: number
  status: FmsOfferStatus
  validUntil?: string | null
  paymentTerms?: string | null
  specialTerms?: string | null
  customerNotes?: string | null
  currencyCode: string
  totalAmount: string
  supersededById?: string | null
  createdAt: string
  updatedAt: string
  sentAt?: string | null
  sentToEmail?: string | null
  assignedTo?: { id: string; name: string; email: string } | null
  documentId?: string | null
  quote?: {
    id: string
    quoteNumber?: string | null
    clientName?: string | null
    client?: { id: string; name: string } | null
    originPortCode?: string | null
    destinationPortCode?: string | null
  }
  lines?: OfferLine[]
}

type OfferDetailDrawerProps = {
  offerId: string | null
  open: boolean
  onClose: () => void
  onDelete?: () => void
  onCreateNewVersion?: (newOfferId: string) => void
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; bannerBg: string; label: string; description: string }> = {
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    bannerBg: 'bg-gray-100 border-gray-200',
    label: 'DRAFT',
    description: 'This offer has not been sent yet'
  },
  sent: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    bannerBg: 'bg-blue-50 border-blue-200',
    label: 'SENT',
    description: 'Awaiting client response'
  },
  accepted: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    bannerBg: 'bg-green-50 border-green-200',
    label: 'ACCEPTED',
    description: 'Client accepted this offer'
  },
  declined: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    bannerBg: 'bg-red-50 border-red-200',
    label: 'DECLINED',
    description: 'Client declined this offer'
  },
  expired: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    bannerBg: 'bg-orange-50 border-orange-200',
    label: 'EXPIRED',
    description: 'Validity period has passed'
  },
  superseded: {
    bg: 'bg-purple-100',
    text: 'text-purple-600',
    bannerBg: 'bg-purple-50 border-purple-200',
    label: 'SUPERSEDED',
    description: 'A newer version exists'
  },
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Status Banner Component
function StatusBanner({ status, sentAt, sentToEmail }: { status: FmsOfferStatus; sentAt?: string | null; sentToEmail?: string | null }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft

  const hasSentInfo = sentAt && status !== 'draft'

  return (
    <div className={`${config.bannerBg} ${config.text} px-6 py-3 border-b`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-wide">{config.label}</span>
          <span className="text-sm opacity-75">{config.description}</span>
        </div>
      </div>
      {hasSentInfo && (
        <div className="mt-2 text-sm opacity-75 flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" />
          <span>
            Sent on {formatDateTime(sentAt)}
            {sentToEmail && <> to <strong className="font-mono">{sentToEmail}</strong></>}
          </span>
        </div>
      )}
    </div>
  )
}

function formatCurrency(value: number | string, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isExpired(dateString: string | null | undefined): boolean {
  if (!dateString) return false
  return new Date(dateString) < new Date()
}

export function OfferDetailDrawer({
  offerId,
  open,
  onClose,
  onDelete,
  onCreateNewVersion,
}: OfferDetailDrawerProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState<{
    status: FmsOfferStatus
    title: string
    description: string
  } | null>(null)

  const { data: offer, isLoading, refetch } = useQuery({
    queryKey: ['fms_offer', offerId],
    queryFn: async () => {
      if (!offerId) return null
      const response = await apiCall<Offer>(`/api/fms_quotes/offers/${offerId}`)
      if (!response.ok) throw new Error('Failed to load offer')
      return response.result
    },
    enabled: !!offerId && open,
  })

  // Calculate totals from lines
  const totals = useMemo(() => {
    if (!offer?.lines) return { total: 0, lineCount: 0 }
    const total = offer.lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0)
    return { total, lineCount: offer.lines.length }
  }, [offer?.lines])

  // Table columns for offer lines - with proper widths to prevent truncation
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'lineNumber',
      title: 'Line',
      width: 50,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'chargeCode',
      title: 'Code',
      width: 80,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-mono text-xs">{value || '-'}</span>
      ),
    },
    {
      data: 'productName',
      title: 'Product / Service',
      width: 250,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate block" title={value || ''}>{value || '-'}</span>
      ),
    },
    {
      data: 'containerSize',
      title: 'Type',
      width: 70,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'quantity',
      title: 'Qty',
      width: 60,
      type: 'numeric',
      readOnly: true,
      className: 'text-right',
    },
    {
      data: 'unitPrice',
      title: 'Unit Price',
      width: 100,
      type: 'numeric',
      readOnly: true,
      className: 'text-right',
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <span className="text-right block">
          {formatCurrency(value, (rowData.currencyCode as string) || offer?.currencyCode || 'USD')}
        </span>
      ),
    },
    {
      data: 'amount',
      title: 'Amount',
      width: 120,
      type: 'numeric',
      readOnly: true,
      className: 'text-right',
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <span className="font-semibold text-right block">
          {formatCurrency(value, (rowData.currencyCode as string) || offer?.currencyCode || 'USD')}
        </span>
      ),
    },
  ], [offer?.currencyCode])

  // Table data
  const tableData = useMemo(() => {
    if (!offer?.lines) return []
    return offer.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      chargeCode: line.chargeCode || '',
      productName: line.productName || '',
      containerSize: line.containerSize || '',
      chargeCategory: line.chargeCategory || '',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      currencyCode: line.currencyCode,
    }))
  }, [offer?.lines])

  const handleStatusChange = useCallback(async (newStatus: FmsOfferStatus) => {
    if (!offer) return

    setIsUpdating(true)
    try {
      const response = await apiCall<Offer>(`/api/fms_quotes/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        flash(`Offer marked as ${newStatus}`, 'success')
        refetch()
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        setShowStatusDialog(null)
      } else {
        flash('Failed to update offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsUpdating(false)
    }
  }, [offer, refetch, queryClient])

  const handleDelete = useCallback(async () => {
    if (!offer) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/fms_quotes/offers/${offer.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Offer deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        setShowDeleteDialog(false)
        onDelete?.()
        onClose()
      } else {
        flash('Failed to delete offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [offer, queryClient, onDelete, onClose])

  const handleCreateNewVersion = useCallback(async () => {
    if (!offer) return

    setIsUpdating(true)
    try {
      const response = await apiCall<{ id: string; offerNumber: string }>('/api/fms_quotes/offers/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id }),
      })

      if (response.ok && response.result) {
        flash(`New version ${response.result.offerNumber} created`, 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        onCreateNewVersion?.(response.result.id)
      } else {
        flash('Failed to create new version', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsUpdating(false)
    }
  }, [offer, queryClient, onCreateNewVersion])

  const handleAssignUser = useCallback(async (userId: string | null) => {
    if (!offer) return

    setIsUpdating(true)
    try {
      const response = await apiCall<Offer>(`/api/fms_quotes/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId: userId }),
      })

      if (response.ok) {
        flash(userId ? 'Offer assigned' : 'Assignment removed', 'success')
        refetch()
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
      } else {
        flash('Failed to assign offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsUpdating(false)
    }
  }, [offer, refetch, queryClient])

  const handleGeneratePdf = useCallback(async () => {
    if (!offer) return

    setIsGeneratingPdf(true)
    try {
      const response = await apiCall<{ documentId: string; url: string }>(`/api/fms_quotes/offers/${offer.id}/pdf`, {
        method: 'POST',
      })

      if (response.ok && response.result) {
        flash('PDF generated successfully', 'success')
        refetch()
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
      } else {
        flash('Failed to generate PDF', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [offer, refetch, queryClient])

  const handleSendSuccess = useCallback(() => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
    setShowSendDialog(false)
  }, [refetch, queryClient])

  const handleConvertToProject = useCallback(async () => {
    if (!offer) return

    setIsConverting(true)
    try {
      const response = await apiCall<{ ok: boolean; projectId: string; projectNumber: string }>(
        `/api/fms_quotes/offers/${offer.id}/convert-to-project`,
        { method: 'POST' }
      )

      if (response.ok && response.result?.ok) {
        flash(`Project ${response.result.projectNumber} created successfully`, 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        queryClient.invalidateQueries({ queryKey: ['fms_offer', offer.id] })
        setShowConvertDialog(false)
        onClose()
        // Navigate to the new project
        router.push(`/backend/fms-projects/${response.result.projectId}`)
      } else {
        flash('Failed to convert offer to project', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsConverting(false)
    }
  }, [offer, queryClient, onClose, router])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  if (!open) return null

  const expired = offer ? isExpired(offer.validUntil) : false
  const isSuperseded = offer?.status === 'superseded'

  // Calculate table height
  const linesCount = offer?.lines?.length || 0
  const tableHeight = Math.min(Math.max(linesCount * 36 + 60, 150), 350)

  return (
    <>
      <div
        className="fixed inset-y-0 right-0 w-[750px] bg-background border-l shadow-xl z-50 flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">{offer?.offerNumber || 'Loading...'}</h2>
                  <Badge variant="outline" className="text-xs">v{offer?.version || 1}</Badge>
                </div>
                {offer?.createdAt && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Created {formatDate(offer.createdAt)}
                  </p>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : offer ? (
          <div className="flex-1 overflow-auto">
            {/* Status Banner - Full width, prominent */}
            <StatusBanner status={offer.status} sentAt={offer.sentAt} sentToEmail={offer.sentToEmail} />

            {/* Card-based info sections */}
            <div className="p-6 space-y-4">
              {/* Row 1: Quote & Client + Financial Summary */}
              <div className="grid grid-cols-2 gap-4">
                {/* Quote & Client Card */}
                <div className="border rounded-lg p-4 bg-background">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quote & Client</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Quote</span>
                      <span className="font-medium">
                        {offer.quote?.quoteNumber || `#${offer.quote?.id?.slice(0, 8) || '...'}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Client</span>
                      <span className="font-medium">{offer.quote?.clientName || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Route</span>
                      <span className="font-medium flex items-center gap-1">
                        {offer.quote?.originPortCode || '-'}
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        {offer.quote?.destinationPortCode || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Financial Summary Card - Highlighted */}
                <div className="border rounded-lg p-4 bg-primary/5 border-primary/20">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial Summary</h3>
                  <div className="text-center py-2">
                    <div className="text-3xl font-bold text-primary">
                      {formatCurrency(totals.total, offer.currencyCode)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {totals.lineCount} line{totals.lineCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Validity & Terms + Assignment & PDF */}
              <div className="grid grid-cols-2 gap-4">
                {/* Validity & Terms Card */}
                <div className="border rounded-lg p-4 bg-background">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Validity & Terms</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Valid Until</span>
                      <span className={`font-medium ${expired ? 'text-red-600' : ''}`}>
                        {offer.validUntil ? formatDate(offer.validUntil) : '-'}
                        {expired && ' (Expired)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Payment Terms</span>
                      <span className="font-medium">{offer.paymentTerms || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Assignment & PDF Card */}
                <div className="border rounded-lg p-4 bg-background">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Assignment & PDF</h3>
                  <div className="space-y-3">
                    <SearchableSelect
                      endpoint="/api/fms_quotes/entities/users"
                      value={offer.assignedTo?.id || null}
                      onChange={(value) => handleAssignUser(value)}
                      labelKey="name"
                      valueKey="id"
                      placeholder="Assign to user..."
                      disabled={isUpdating}
                    />
                    <div className="flex gap-2">
                      {offer.documentId ? (
                        <>
                          <a
                            href={`/api/fms_documents/documents/${offer.documentId}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download PDF
                          </a>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGeneratePdf}
                            disabled={isGeneratingPdf}
                            className="text-xs"
                          >
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            {isGeneratingPdf ? 'Regenerating...' : 'Regenerate'}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGeneratePdf}
                          disabled={isGeneratingPdf}
                          className="text-xs"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          {isGeneratingPdf ? 'Generating...' : 'Generate PDF'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Offer Lines Section */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Offer Lines
                </h3>
                {linesCount > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <div style={{ height: tableHeight }}>
                      <DynamicTable
                        tableRef={tableRef}
                        data={tableData}
                        columns={columns}
                        tableName="Offer Lines"
                        idColumnName="id"
                        width="100%"
                        height="100%"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        uiConfig={{
                          hideToolbar: true,
                          hideSearch: true,
                          hideFilterButton: true,
                          hideAddRowButton: true,
                          hideBottomBar: true,
                          hideActionsColumn: true,
                        }}
                      />
                    </div>
                    {/* Integrated Total Footer Row */}
                    <div className="flex justify-end items-center px-4 py-3 bg-muted/50 border-t-2 border-muted">
                      <span className="text-sm text-muted-foreground mr-4 font-medium">Total:</span>
                      <span className="text-xl font-bold">
                        {formatCurrency(totals.total, offer.currencyCode)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-6 text-center text-muted-foreground">
                    No lines in this offer
                  </div>
                )}
              </div>

              {/* Notes Section */}
              {(offer.specialTerms || offer.customerNotes) && (
                <div className="space-y-3">
                  {offer.specialTerms && (
                    <div className="border rounded-lg p-4 bg-background">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Special Terms</h4>
                      <p className="text-sm">{offer.specialTerms}</p>
                    </div>
                  )}
                  {offer.customerNotes && (
                    <div className="border rounded-lg p-4 bg-background">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes to Customer</h4>
                      <p className="text-sm">{offer.customerNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Superseded warning */}
              {isSuperseded && offer.supersededById && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
                  This offer has been superseded by a newer version.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Offer not found
          </div>
        )}

        {/* Actions footer */}
        {offer && !isLoading && (
          <div className="px-6 py-4 border-t bg-muted/30 space-y-2">
            {offer.status === 'draft' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setShowSendDialog(true)}
                    disabled={isUpdating || !offer.quote?.client}
                    className="flex-1"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send to Client
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowStatusDialog({
                      status: 'sent',
                      title: 'Mark as Sent',
                      description: 'Mark this offer as sent to the customer (manually). This action cannot be undone.',
                    })}
                    disabled={isUpdating}
                    className="flex-1"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Mark as Sent
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isUpdating}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {!offer.quote?.client && (
                  <p className="text-xs text-muted-foreground">
                    Assign a client to the quote to send offer via email
                  </p>
                )}
              </div>
            )}

            {offer.status === 'sent' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    onClick={() => setShowStatusDialog({
                      status: 'accepted',
                      title: 'Mark as Accepted',
                      description: 'The customer has accepted this offer.',
                    })}
                    disabled={isUpdating}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Accepted
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowStatusDialog({
                      status: 'declined',
                      title: 'Mark as Declined',
                      description: 'The customer has declined this offer.',
                    })}
                    disabled={isUpdating}
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Declined
                  </Button>
                </div>
                <Button
                  variant="default"
                  onClick={() => setShowConvertDialog(true)}
                  disabled={isUpdating || isConverting}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Convert to Project
                </Button>
              </div>
            )}

            {offer.status === 'accepted' && (
              <Button
                variant="default"
                onClick={() => setShowConvertDialog(true)}
                disabled={isUpdating || isConverting}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Convert to Project
              </Button>
            )}

            {(offer.status === 'sent' || offer.status === 'accepted' || offer.status === 'declined' || offer.status === 'expired') && (
              <Button
                variant="outline"
                onClick={handleCreateNewVersion}
                disabled={isUpdating}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                Create New Version
              </Button>
            )}

            {offer.status === 'superseded' && (
              <p className="text-sm text-center text-muted-foreground py-2">
                This offer has been superseded. No actions available.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Status change confirmation dialog */}
      <Dialog open={!!showStatusDialog} onOpenChange={(open) => !open && setShowStatusDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{showStatusDialog?.title}</DialogTitle>
            <DialogDescription>{showStatusDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStatusDialog(null)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => showStatusDialog && handleStatusChange(showStatusDialog.status)}
              disabled={isUpdating}
            >
              {isUpdating ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete offer &quot;{offer?.offerNumber}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
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

      {/* Send Offer Dialog */}
      {offer && (
        <SendOfferDialog
          offerId={offer.id}
          offerNumber={offer.offerNumber}
          clientName={offer.quote?.clientName || ''}
          currentStatus={offer.status}
          sentAt={offer.sentAt}
          sentToEmail={offer.sentToEmail}
          open={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          onSuccess={handleSendSuccess}
        />
      )}

      {/* Convert to Project confirmation dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Project</DialogTitle>
            <DialogDescription>
              This will create a new project from offer &quot;{offer?.offerNumber}&quot;.
              The offer will be marked as accepted and the quote will be marked as won.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client:</span>
                <span className="font-medium">{offer?.quote?.clientName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route:</span>
                <span className="font-medium">
                  {offer?.quote?.originPortCode || '-'} → {offer?.quote?.destinationPortCode || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">
                  {formatCurrency(totals.total, offer?.currencyCode || 'USD')}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConvertDialog(false)}
              disabled={isConverting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConvertToProject}
              disabled={isConverting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isConverting ? 'Converting...' : 'Convert to Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
