'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Send, Check, XCircle, Trash2, FileText, Download, Mail, FolderOpen, ChevronDown, User, ExternalLink, ArrowRight } from 'lucide-react'
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
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { useDrawerTableFocus } from '../../../hooks'
import type { FmsOfferStatus } from '../data/types'
import { SendOfferDialog } from './SendOfferDialog'
import { ConvertToProjectDialog } from './ConvertToProjectDialog'

type OfferLine = {
  id: string
  lineNumber: number
  productName?: string | null
  chargeCode?: string | null
  chargeBasis?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
}

type OfferCalculation = {
  id: string
  calculationNumber: number
  label?: string | null
  containers?: string[] | null
  originLocationId?: string | null
  destinationLocationId?: string | null
  lines: OfferLine[]
}

type Location = {
  id: string
  name: string
  code?: string | null
  type?: string | null
}

type ConvertDialogLine = {
  id: string
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
  originLocationId: string | null
  destinationLocationId: string | null
}

type ConvertDialogData = {
  locations: Location[]
  lines: ConvertDialogLine[]
  rfqLineLocations: Array<{
    rfqLineId: string
    originLocationId: string | null
    originLocation: Location | null
    destinationLocationId: string | null
    destinationLocation: Location | null
  }>
  defaultOriginLocationId: string | null
  defaultDestinationLocationId: string | null
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
  supersededById?: string | null
  createdAt: string
  updatedAt: string
  sentAt?: string | null
  sentToEmail?: string | null
  operationalGuardian?: { id: string; name: string; email: string } | null
  businessGuardian?: { id: string; name: string; email: string } | null
  createdBy?: { id: string; name: string; email: string } | null
  documentId?: string | null
  rfq?: {
    id: string
    title?: string | null
    companyName?: string | null
    origin?: string | null
    destination?: string | null
  }
  calculations?: OfferCalculation[]
  convertDialogData?: ConvertDialogData | null
  project?: {
    id: string
    projectNumber: string
  } | null
  projects?: {
    id: string
    projectNumber: string
  }[]
}

type OfferDetailDrawerProps = {
  offerId: string | null
  open: boolean
  onClose: () => void
  onDelete?: () => void
  /** Ref to the main table for focus restoration when drawer closes */
  mainTableRef?: React.RefObject<HTMLDivElement | null>
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

// Status dropdown component
function StatusDropdown({
  status,
  onStatusChange,
  disabled,
}: {
  status: FmsOfferStatus
  onStatusChange: (newStatus: FmsOfferStatus) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // All status options except current and superseded
  const allStatuses: Array<{ status: FmsOfferStatus; label: string; icon?: React.ReactNode }> = [
    { status: 'draft', label: 'Draft', icon: <FileText className="h-4 w-4 text-gray-500" /> },
    { status: 'sent', label: 'Sent', icon: <Send className="h-4 w-4 text-blue-500" /> },
    { status: 'accepted', label: 'Accepted', icon: <Check className="h-4 w-4 text-green-600" /> },
    { status: 'declined', label: 'Declined', icon: <XCircle className="h-4 w-4 text-red-600" /> },
    { status: 'expired', label: 'Expired', icon: <XCircle className="h-4 w-4 text-orange-500" /> },
  ]

  const availableStatuses = allStatuses.filter(s => s.status !== status)

  // Superseded offers cannot change status
  if (status === 'superseded') {
    return (
      <span className={`${config.bg} ${config.text} text-xs font-semibold px-2 py-1 rounded-md`}>
        {config.label}
      </span>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          ${config.bg} ${config.text} text-xs font-semibold px-2 py-1 rounded-md
          inline-flex items-center gap-1
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'}
          transition-opacity
        `}
      >
        {config.label}
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-background border rounded-lg shadow-lg z-50 py-1">
          {availableStatuses.map((item) => (
            <button
              key={item.status}
              type="button"
              onClick={() => {
                onStatusChange(item.status)
                setIsOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


export function OfferDetailDrawer({
  offerId,
  open,
  onClose,
  onDelete,
  mainTableRef,
}: OfferDetailDrawerProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const referenceTableRef = useRef<HTMLDivElement>(null)
  const termsTableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)

  const { data: offer, isLoading, refetch } = useQuery({
    queryKey: ['fms_offer', offerId],
    queryFn: async () => {
      if (!offerId) return null
      const response = await apiCall<Offer>(`/api/fms_offers/offers/${offerId}`)
      if (!response.ok) throw new Error('Failed to load offer')
      return response.result
    },
    enabled: !!offerId && open,
  })

  const { handleOpenAutoFocus, handleCloseAutoFocus } = useDrawerTableFocus({
    isOpen: open,
    isContentReady: !isLoading && !!offer,
    drawerTableRef: referenceTableRef,
    mainTableRef,
  })

  // Calculate totals from calculation lines
  const allLines = useMemo(() => {
    if (!offer?.calculations) return []
    return offer.calculations.flatMap(c => c.lines || [])
  }, [offer?.calculations])

  const enabledLines = useMemo(() => allLines.filter(l => l.isEnabled), [allLines])

  const totals = useMemo(() => {
    const total = enabledLines.reduce((sum, line) => sum + (parseFloat(line.sellPrice) || 0), 0)
    return { total, lineCount: enabledLines.length }
  }, [enabledLines])

  // Table columns for offer lines - with proper widths to prevent truncation
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'chargeCode',
      title: 'Code',
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-mono text-xs">{value || '-'}</span>
      ),
    },
    {
      data: 'productName',
      title: 'Product / Service',
      width: 260,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate block" title={value || ''}>{value || '-'}</span>
      ),
    },
    {
      data: 'chargeBasis',
      title: 'Basis',
      width: 100,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'rate',
      title: 'Rate',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <span className="text-right block text-muted-foreground">
          {formatCurrency(value, (rowData.currencyCode as string) || 'USD')}
        </span>
      ),
    },
    {
      data: 'buyPrice',
      title: 'Buy',
      width: 110,
      type: 'numeric',
      readOnly: true,
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <span className="text-right block text-muted-foreground">
          {formatCurrency(value, (rowData.currencyCode as string) || 'USD')}
        </span>
      ),
    },
    {
      data: 'sellPrice',
      title: 'Sell',
      width: 110,
      type: 'numeric',
      readOnly: true,
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <span className="font-semibold text-right block">
          {formatCurrency(value, (rowData.currencyCode as string) || 'USD')}
        </span>
      ),
    },
  ], [])

  // Table data - flatten enabled lines from all calculations
  const tableData = useMemo(() => {
    return enabledLines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      chargeCode: line.chargeCode || '',
      productName: line.productName || '',
      chargeBasis: line.chargeBasis || '',
      rate: line.rate,
      buyPrice: line.buyPrice,
      sellPrice: line.sellPrice,
      currencyCode: line.currencyCode,
    }))
  }, [enabledLines])

  // RFQ reference columns
  const referenceColumns = useMemo((): ColumnDef[] => [
    {
      data: 'rfqTitle',
      title: 'RFQ',
      width: 130,
      type: 'text',
      readOnly: true,
      renderer: (value: string, rowData: Record<string, unknown>) => (
        <a
          href={`/backend/fms-rfqs?rfqId=${rowData.rfqId || ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
          <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
    {
      data: 'companyName',
      title: 'Company',
      width: 180,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'operationalGuardian',
      title: 'Op. Guardian',
      width: 130,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'businessGuardian',
      title: 'Bus. Guardian',
      width: 130,
      type: 'text',
      readOnly: true,
    },
  ], [])

  const referenceData = useMemo(() => [{
    id: 'reference',
    rfqId: offer?.rfq?.id || '',
    rfqTitle: offer?.rfq?.title || `#${offer?.rfq?.id?.slice(0, 8) || '...'}`,
    companyName: offer?.rfq?.companyName || '-',
    operationalGuardian: offer?.operationalGuardian?.name || '-',
    businessGuardian: offer?.businessGuardian?.name || '-',
  }], [offer])

  // Terms columns
  const termsColumns = useMemo((): ColumnDef[] => [
    {
      data: 'validUntil',
      title: 'Valid Until',
      width: 150,
      type: 'text',
      readOnly: true,
      cellClassName: (_value: unknown, rowData: { expired?: boolean }) =>
        rowData?.expired ? 'cell-red' : undefined,
    },
    {
      data: 'paymentTerms',
      title: 'Payment Terms',
      width: 200,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'currency',
      title: 'Currency',
      width: 80,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800">
          {value}
        </span>
      ),
    },
    {
      data: 'lines',
      title: 'Lines',
      width: 60,
      type: 'numeric',
      readOnly: true,
    },
  ], [])

  const termsData = useMemo(() => {
    const isOfferExpired = offer?.validUntil ? isExpired(offer.validUntil) : false
    return [{
      id: 'terms',
      validUntil: offer?.validUntil ? formatDate(offer.validUntil) + (isOfferExpired ? ' (Expired)' : '') : '-',
      paymentTerms: offer?.paymentTerms || '-',
      currency: 'USD',
      lines: totals.lineCount,
      expired: isOfferExpired,
    }]
  }, [offer, totals])

  const handleStatusChange = useCallback(async (newStatus: FmsOfferStatus) => {
    if (!offer) return

    setIsUpdating(true)
    try {
      const response = await apiCall<Offer>(`/api/fms_offers/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        flash(`Offer marked as ${newStatus}`, 'success')
        refetch()
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
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
      const response = await apiCall(`/api/fms_offers/offers/${offer.id}`, {
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



  const handleGeneratePdf = useCallback(async () => {
    if (!offer) return

    setIsGeneratingPdf(true)
    try {
      const response = await apiCall<{ documentId: string; url: string }>(`/api/fms_offers/offers/${offer.id}/pdf`, {
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


  const isSuperseded = offer?.status === 'superseded'

  // Calculate table height
  const linesCount = offer?.lines?.length || 0
  const tableHeight = Math.min(Math.max(linesCount * 36 + 60, 150), 350)

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
        <SheetContent
          side="right"
          className="p-0 flex flex-col"
          style={{ width: '50vw', maxWidth: '50vw' }}
          hideCloseButton
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">{offer?.offerNumber || 'Loading...'}</h2>
                  <Badge variant="outline" className="text-xs">v{offer?.version || 1}</Badge>
                  {/* Status Dropdown */}
                  {offer && (
                    <StatusDropdown
                      status={offer.status}
                      onStatusChange={handleStatusChange}
                      disabled={isUpdating}
                    />
                  )}
                  {/* Delete button - only for draft */}
                  {offer?.status === 'draft' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isUpdating}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {offer?.createdAt && (
                    <p className="text-sm text-muted-foreground">
                      Created {formatDate(offer.createdAt)}
                    </p>
                  )}
                  {offer?.createdBy && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      by {offer.createdBy.name}
                    </p>
                  )}
                </div>
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
            {/* DynamicTable-based info sections */}
            <div className="p-6 space-y-4">
              {/* Section 1: RFQ & Company Reference */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  RFQ Reference
                </h3>
                <div style={{ height: 72 }}>
                  <DynamicTable
                    tableRef={referenceTableRef}
                    data={referenceData}
                    columns={referenceColumns}
                    idColumnName="id"
                    width="100%"
                    height="100%"
                    colHeaders={true}
                    rowHeaders={false}
                    stretchColumns={true}
                    autoSelectOnFocus={true}
                    siblingTableRefs={{ next: termsTableRef }}
                    uiConfig={{
                      hideToolbar: true,
                      hideSearch: true,
                      hideFilterButton: true,
                      hideAddRowButton: true,
                      hideBottomBar: true,
                      hideActionsColumn: true,
                      readOnlyStyle: 'normal',
                    }}
                  />
                </div>
              </section>

              {/* Section 2: Terms */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Terms
                </h3>
                <div style={{ height: 72 }}>
                  <DynamicTable
                    tableRef={termsTableRef}
                    data={termsData}
                    columns={termsColumns}
                    idColumnName="id"
                    width="100%"
                    height="100%"
                    colHeaders={true}
                    rowHeaders={false}
                    stretchColumns={true}
                    autoSelectOnFocus={true}
                    siblingTableRefs={{ prev: referenceTableRef, next: tableRef }}
                    uiConfig={{
                      hideToolbar: true,
                      hideSearch: true,
                      hideFilterButton: true,
                      hideAddRowButton: true,
                      hideBottomBar: true,
                      hideActionsColumn: true,
                      readOnlyStyle: 'normal',
                    }}
                  />
                </div>
              </section>

              {/* Section 3: Offer Lines */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Offer Lines
                </h3>
                {linesCount > 0 ? (
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
                      autoSelectOnFocus={true}
                      siblingTableRefs={{ prev: termsTableRef }}
                      uiConfig={{
                        hideToolbar: true,
                        hideSearch: true,
                        hideFilterButton: true,
                        hideAddRowButton: true,
                        hideBottomBar: true,
                        hideActionsColumn: true,
                        readOnlyStyle: 'normal',
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    No lines in this offer
                  </div>
                )}
              </section>

              {/* PDF & Send Section */}
              <section className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* PDF buttons */}
                  {offer.documentId ? (
                    <>
                      <a
                        href={`/api/fms_documents/documents/${offer.documentId}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors font-medium"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGeneratePdf}
                        disabled={isGeneratingPdf}
                      >
                        <FileText className="h-4 w-4 mr-1.5" />
                        {isGeneratingPdf ? 'Regenerating...' : 'Regenerate'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGeneratePdf}
                      disabled={isGeneratingPdf}
                    >
                      <FileText className="h-4 w-4 mr-1.5" />
                      {isGeneratingPdf ? 'Generating...' : 'Generate PDF'}
                    </Button>
                  )}
                  {/* Separator */}
                  <div className="h-6 w-px bg-border mx-1" />
                  {/* Send button or status */}
                  {offer.sentAt ? (
                    <div className="text-sm flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Sent {formatDateTime(offer.sentAt)}</span>
                      {offer.sentToEmail && (
                        <span className="font-medium">{offer.sentToEmail}</span>
                      )}
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowSendDialog(true)}
                      disabled={isUpdating || !offer.rfq?.companyName}
                      size="sm"
                    >
                      <Mail className="h-4 w-4 mr-1.5" />
                      Send to Client
                    </Button>
                  )}
                </div>
              </section>

              {/* PROJECT Section - Always visible */}
              <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {(offer.projects?.length ?? 0) > 1 ? 'Projects' : 'Project'}
                  </h3>
                  <Button
                    onClick={() => setShowConvertDialog(true)}
                    disabled={isUpdating}
                    size="sm"
                    variant={(offer.projects?.length ?? 0) > 0 ? 'outline' : 'default'}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {(offer.projects?.length ?? 0) > 0 ? 'Create Another Project' : 'Convert to Project'}
                  </Button>
                </div>
                {(offer.projects?.length ?? 0) > 0 ? (
                  <div className="space-y-1">
                    {offer.projects?.map((project) => (
                      <div key={project.id} className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`/backend/fms-projects/${project.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:underline inline-flex items-center gap-1"
                        >
                          {project.projectNumber}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No project linked yet.
                  </p>
                )}
              </section>

              {/* Notes (conditional) */}
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

      </SheetContent>
      </Sheet>

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
          clientName={offer.rfq?.companyName || ''}
          currentStatus={offer.status}
          sentAt={offer.sentAt}
          sentToEmail={offer.sentToEmail}
          open={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          onSuccess={handleSendSuccess}
        />
      )}

      {/* Convert to Project Dialog */}
      {offer && (
        <ConvertToProjectDialog
          offerId={offer.id}
          offerNumber={offer.offerNumber}
          clientName={offer.rfq?.companyName || ''}
          originPortCode={offer.rfq?.origin}
          destinationPortCode={offer.rfq?.destination}
          totalAmount={totals.total}
          currencyCode={offer.rfq?.currencyCode || 'USD'}
          convertDialogData={offer.convertDialogData}
          open={showConvertDialog}
          onClose={() => {
            setShowConvertDialog(false)
            onClose()
          }}
        />
      )}
    </>
  )
}
