'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

interface InvoiceLineItem {
  description: string
  quantity: number
  unit: string
  unitPriceNetto: number
  vatRate: number
  rowTotalNetto: number
  rowVat: number
  rowTotalBrutto: number
}

interface InvoiceItem {
  id: string
  documentId: string | null
  invoiceNumber: string | null
  sellerName: string | null
  sellerNip: string | null
  buyerName: string | null
  buyerNip: string | null
  netAmount: string | null
  vatAmount: string | null
  grossAmount: string | null
  currencyCode: string
  invoiceDate: string | null
  paymentDueDate: string | null
  paymentMethod: string | null
  lineItems: InvoiceLineItem[] | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'REVIEW'
  status: 'pending_review' | 'approved' | 'rejected'
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
}

interface InvoiceTotals {
  totalNet: number
  totalVat: number
  totalGross: number
  approvedCount: number
  pendingCount: number
  rejectedCount: number
}

type FileInvoiceCostsSectionProps = {
  fileId: string
  estimatedCost: number
  currencyCode: string
  onTotalsChange?: (approved: number, pending: number) => void
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-orange-100 text-orange-800',
  REVIEW: 'bg-red-100 text-red-800',
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

function formatCurrency(amount: string | number | null, currency: string = 'PLN'): string {
  if (amount === null || amount === undefined) return '-'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
  }).format(num)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function FileInvoiceCostsSection({
  fileId,
  estimatedCost,
  currencyCode,
  onTotalsChange,
}: FileInvoiceCostsSectionProps) {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [totals, setTotals] = useState<InvoiceTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiCall<{ items: InvoiceItem[]; totals: InvoiceTotals }>(
        `/api/fms_files/files/${fileId}/invoices`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch invoices')
      }
      const data = response.result
      setInvoices(data?.items || [])
      setTotals(data?.totals || null)

      if (onTotalsChange && data?.totals) {
        onTotalsChange(data.totals.totalGross, data.totals.pendingCount)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [fileId, onTotalsChange])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const handleReview = async (invoiceId: string, status: 'approved' | 'rejected') => {
    try {
      setReviewingId(invoiceId)
      setError(null)

      const response = await apiCall(`/api/fms_files/files/${fileId}/invoices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          status,
          reviewNotes: reviewNotes || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Review failed')
      }

      await fetchInvoices()
      setReviewNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setReviewingId(null)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (invoices.length === 0) {
    return null
  }

  const variance = estimatedCost - (totals?.totalGross ?? 0)

  return (
    <div className="space-y-3">
      {/* Divider header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4" />
          <span className="font-medium">Extracted Invoices</span>
          <span className="bg-secondary text-secondary-foreground text-xs px-1.5 py-0.5 rounded-full">
            {invoices.length}
          </span>
        </div>
        <div className="flex-1 border-t" />
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Estimated Cost</div>
          <div className="font-mono font-medium text-sm">
            {formatCurrency(estimatedCost, currencyCode)}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Approved Total</div>
          <div className="font-mono font-medium text-sm text-green-700">
            {formatCurrency(totals?.totalGross ?? 0, currencyCode)}
          </div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Pending Review</div>
          <div className="font-mono font-medium text-sm text-yellow-700">
            {totals?.pendingCount ?? 0} invoices
          </div>
        </div>
        <div className={`rounded-lg p-3 ${variance >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
          <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Variance</div>
          <div className={`font-mono font-medium text-sm ${variance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
            {formatCurrency(variance, currencyCode)}
          </div>
        </div>
      </div>

      {/* Invoice list */}
      <div className="space-y-2">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="border rounded-lg overflow-hidden">
            {/* Header */}
            <div
              className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/30"
              onClick={() => toggleExpanded(invoice.id)}
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">
                    {invoice.invoiceNumber || 'Invoice'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {invoice.sellerName || 'Unknown seller'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-semibold text-sm">
                    {formatCurrency(invoice.grossAmount, invoice.currencyCode)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(invoice.invoiceDate)}
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-full ${CONFIDENCE_COLORS[invoice.confidence]}`}>
                  {invoice.confidence}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[invoice.status]}`}>
                  {invoice.status.replace('_', ' ')}
                </span>
                {expandedId === invoice.id ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === invoice.id && (
              <div className="border-t p-4 bg-muted/10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Net Amount</div>
                    <div className="font-medium text-sm">
                      {formatCurrency(invoice.netAmount, invoice.currencyCode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">VAT</div>
                    <div className="font-medium text-sm">
                      {formatCurrency(invoice.vatAmount, invoice.currencyCode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Payment Due</div>
                    <div className="font-medium text-sm">{formatDate(invoice.paymentDueDate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Payment Method</div>
                    <div className="font-medium text-sm">{invoice.paymentMethod || '-'}</div>
                  </div>
                </div>

                {invoice.sellerNip && (
                  <div className="mb-4 text-sm">
                    <span className="text-muted-foreground">Seller NIP: </span>
                    <span>{invoice.sellerNip}</span>
                  </div>
                )}

                {/* Line items */}
                {invoice.lineItems && invoice.lineItems.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-muted-foreground mb-2">Line Items</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="pb-1 pr-3">Description</th>
                            <th className="pb-1 pr-3 text-right">Qty</th>
                            <th className="pb-1 pr-3 text-right">Unit Price</th>
                            <th className="pb-1 pr-3 text-right">VAT</th>
                            <th className="pb-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(invoice.lineItems as InvoiceLineItem[]).map((item, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="py-1 pr-3">{item.description}</td>
                              <td className="py-1 pr-3 text-right">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="py-1 pr-3 text-right">
                                {formatCurrency(item.unitPriceNetto, invoice.currencyCode)}
                              </td>
                              <td className="py-1 pr-3 text-right">{item.vatRate}%</td>
                              <td className="py-1 text-right font-medium">
                                {formatCurrency(item.rowTotalBrutto, invoice.currencyCode)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Review section */}
                {invoice.status === 'pending_review' && (
                  <div className="border-t pt-3 mt-3">
                    {(invoice.confidence === 'LOW' || invoice.confidence === 'REVIEW') && (
                      <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-2 text-yellow-700 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Low confidence extraction — please review carefully
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Review notes (optional)"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        className="flex-1 text-sm border rounded px-3 py-1.5"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(invoice.id, 'rejected')}
                        disabled={reviewingId === invoice.id}
                        className="text-red-600 hover:bg-red-50"
                      >
                        {reviewingId === invoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4 mr-1" />
                        )}
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleReview(invoice.id, 'approved')}
                        disabled={reviewingId === invoice.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {reviewingId === invoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Approve
                      </Button>
                    </div>
                  </div>
                )}

                {invoice.status !== 'pending_review' && invoice.reviewedAt && (
                  <div className="border-t pt-2 mt-2 text-xs text-muted-foreground">
                    Reviewed on {formatDate(invoice.reviewedAt)}
                    {invoice.reviewNotes && <span className="ml-2">— {invoice.reviewNotes}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default FileInvoiceCostsSection
