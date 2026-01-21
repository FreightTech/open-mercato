'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Send, Check, XCircle, Trash2, FileText, Download, Mail, FolderOpen, Link2, ChevronDown, User } from 'lucide-react'
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
import { SendOfferDialog } from './SendOfferDialog'

type OfferLine = {
  id: string
  lineNumber: number
  productName?: string | null
  chargeCode?: string | null
  containerSize?: string | null
  chargeCategory?: string | null
  quantity: string
  unitCost?: string | null
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
  createdBy?: { id: string; name: string; email: string } | null
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

  const getAvailableStatuses = (): Array<{ status: FmsOfferStatus; label: string; icon?: React.ReactNode }> => {
    switch (status) {
      case 'draft':
        return [{ status: 'sent', label: 'Mark as Sent', icon: <Send className="h-4 w-4" /> }]
      case 'sent':
        return [
          { status: 'accepted', label: 'Mark as Accepted', icon: <Check className="h-4 w-4 text-green-600" /> },
          { status: 'declined', label: 'Mark as Declined', icon: <XCircle className="h-4 w-4 text-red-600" /> },
        ]
      default:
        return []
    }
  }

  const availableStatuses = getAvailableStatuses()

  if (status === 'superseded' || availableStatuses.length === 0) {
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

// Compact user assignment select component
function UserAssignmentSelect({
  value,
  displayName,
  onChange,
  disabled,
}: {
  value: string | null
  displayName: string | null
  onChange: (userId: string | null) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users-for-assignment', search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' })
      if (search) params.set('search', search)
      const response = await apiCall<{ items: Array<{ id: string; name: string; email: string }> }>(
        `/api/fms_quotes/entities/users?${params}`
      )
      return response.result?.items || []
    },
    enabled: isOpen,
    staleTime: 60000,
  })

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded-md border
          transition-colors min-w-[120px] max-w-[180px]
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}
          ${displayName ? 'text-foreground' : 'text-muted-foreground'}
        `}
      >
        <span className="truncate">{displayName || 'Unassigned'}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-background border rounded-lg shadow-lg z-50">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {/* Unassign option */}
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setIsOpen(false)
                  setSearch('')
                }}
                className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted text-muted-foreground"
              >
                Remove assignment
              </button>
            )}
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
            ) : users.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No users found</div>
            ) : (
              users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    onChange(user.id)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={`
                    w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted
                    flex items-center justify-between
                    ${user.id === value ? 'bg-primary/10 text-primary' : ''}
                  `}
                >
                  <div className="truncate">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                  {user.id === value && <Check className="h-4 w-4 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
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
}: OfferDetailDrawerProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const routingTableRef = useRef<HTMLDivElement>(null)
  const referenceTableRef = useRef<HTMLDivElement>(null)
  const termsTableRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)

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

  // Routing & Logistics columns
  const routingColumns = useMemo((): ColumnDef[] => [
    {
      data: 'origin',
      title: 'Origin',
      width: 150,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate block text-sm" title={value || '-'}>
          {value || '-'}
        </span>
      ),
    },
    {
      data: 'destination',
      title: 'Destination',
      width: 150,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate block text-sm" title={value || '-'}>
          {value || '-'}
        </span>
      ),
    },
    {
      data: 'carrier',
      title: 'Carrier',
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'containerTypes',
      title: 'Container Types',
      width: 180,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="text-xs">{value || '-'}</span>
      ),
    },
  ], [])

  const routingData = useMemo(() => {
    const containerTypes = [...new Set(offer?.lines?.map(l => l.containerSize).filter(Boolean))]
    return [{
      id: 'routing',
      origin: offer?.quote?.originPortCode || '-',
      destination: offer?.quote?.destinationPortCode || '-',
      carrier: (offer as { carrierName?: string })?.carrierName || '-',
      containerTypes: containerTypes.join(', ') || '-',
    }]
  }, [offer])

  // Quote reference columns
  const referenceColumns = useMemo((): ColumnDef[] => [
    {
      data: 'quoteNumber',
      title: 'Quote',
      width: 130,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-mono text-sm text-blue-600">{value}</span>
      ),
    },
    {
      data: 'clientName',
      title: 'Client',
      width: 200,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'assignedTo',
      title: 'Assigned To',
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'total',
      title: 'Total',
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-semibold">{value}</span>
      ),
    },
  ], [])

  const referenceData = useMemo(() => [{
    id: 'reference',
    quoteNumber: offer?.quote?.quoteNumber || `#${offer?.quote?.id?.slice(0, 8) || '...'}`,
    clientName: offer?.quote?.clientName || '-',
    assignedTo: offer?.assignedTo?.name || 'Unassigned',
    total: formatCurrency(totals.total, offer?.currencyCode || 'USD'),
  }], [offer, totals])

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
      currency: offer?.currencyCode || 'USD',
      lines: totals.lineCount,
      expired: isOfferExpired,
    }]
  }, [offer, totals])

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
            {/* Top Actions Bar - PDF, Assignment, and Send */}
            <div className="px-6 py-3 bg-muted/30 border-b flex items-center gap-4">
              <div className="flex items-center gap-2">
                {offer.documentId ? (
                  <>
                    <a
                      href={`/api/fms_documents/documents/${offer.documentId}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors font-medium"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGeneratePdf}
                      disabled={isGeneratingPdf}
                    >
                      <FileText className="h-4 w-4 mr-1.5" />
                      {isGeneratingPdf ? 'Regenerating...' : 'Regenerate PDF'}
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
              </div>

              {/* Separator */}
              <div className="h-6 w-px bg-border" />

              {/* User Assignment - compact inline */}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <UserAssignmentSelect
                  value={offer.assignedTo?.id || null}
                  displayName={offer.assignedTo?.name || null}
                  onChange={handleAssignUser}
                  disabled={isUpdating}
                />
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {offer.status === 'draft' && (
                <Button
                  onClick={() => setShowSendDialog(true)}
                  disabled={isUpdating || !offer.quote?.client}
                  size="sm"
                >
                  <Mail className="h-4 w-4 mr-1.5" />
                  Send to Client
                </Button>
              )}
              {offer.sentAt && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Sent {formatDateTime(offer.sentAt)}
                  {offer.sentToEmail && <> to <span className="font-mono">{offer.sentToEmail}</span></>}
                </p>
              )}
            </div>

            {/* DynamicTable-based info sections */}
            <div className="p-6 space-y-5">
              {/* Section 1: Routing & Logistics */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Routing & Logistics
                </h3>
                <div className="border rounded-lg overflow-hidden" style={{ height: 72 }}>
                  <DynamicTable
                    tableRef={routingTableRef}
                    data={routingData}
                    columns={routingColumns}
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
              </section>

              {/* Section 2: Quote & Client Reference */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Quote Reference
                </h3>
                <div className="border rounded-lg overflow-hidden" style={{ height: 72 }}>
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
              </section>

              {/* Section 3: Terms */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Terms
                </h3>
                <div className="border rounded-lg overflow-hidden" style={{ height: 72 }}>
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
              </section>

              {/* Section 4: Offer Lines */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
                  </div>
                ) : (
                  <div className="border rounded-lg p-6 text-center text-muted-foreground">
                    No lines in this offer
                  </div>
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

        {/* Actions footer */}
        {offer && !isLoading && (
          <div className="px-6 py-4 border-t bg-muted/30 space-y-2">
            {/* Delete button for drafts */}
            {offer.status === 'draft' && (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isUpdating}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Offer
              </Button>
            )}

            {/* Convert to Project for sent/accepted */}
            {(offer.status === 'sent' || offer.status === 'accepted') && (
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

            {/* Open Quote and Copy Link buttons */}
            {offer.quote?.id && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onClose()
                    router.push(`/backend/fms-quotes?quoteId=${offer.quote?.id}`)
                  }}
                  className="flex-1"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Open Quote
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = `${window.location.origin}/backend/fms-quotes?quoteId=${offer.quote?.id}`
                    navigator.clipboard.writeText(url)
                    flash('Link copied to clipboard', 'success')
                  }}
                  className="flex-1"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
              </div>
            )}

            {offer.status === 'superseded' && (
              <p className="text-sm text-center text-muted-foreground py-2">
                This offer has been superseded. No actions available.
              </p>
            )}
          </div>
        )}
      </div>

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
