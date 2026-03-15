/**
 * Invoice Costs Section Component
 * Displays extracted invoice data and allows approval/rejection
 */

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
  documentId: string
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

interface InvoiceCostsSectionProps {
  projectId: string
  estimatedCost?: string | null
  currencyCode?: string
  onTotalsChange?: (totals: InvoiceTotals) => void
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
  if (amount === null) return '-'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
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

export function InvoiceCostsSection({
  projectId,
  estimatedCost,
  currencyCode = 'PLN',
  onTotalsChange,
}: InvoiceCostsSectionProps) {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [totals, setTotals] = useState<InvoiceTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/fms_projects/projects/${projectId}/invoices`)
      if (!response.ok) {
        throw new Error('Failed to fetch invoices')
      }
      const data = await response.json()
      setInvoices(data.items || [])
      setTotals(data.totals || null)

      if (onTotalsChange && data.totals) {
        onTotalsChange(data.totals)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [projectId, onTotalsChange])

  // Fetch on mount
  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Handle review
  const handleReview = async (invoiceId: string, status: 'approved' | 'rejected') => {
    try {
      setReviewingId(invoiceId)
      setError(null)

      const response = await fetch(`/api/fms_projects/projects/${projectId}/invoices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          status,
          reviewNotes: reviewNotes || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Review failed')
      }

      // Refresh the list
      await fetchInvoices()
      setReviewNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setReviewingId(null)
    }
  }

  // Toggle expanded invoice
  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Costs & Invoices</h2>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold mb-4">Costs & Invoices</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500">Estimated Cost</div>
          <div className="text-lg font-semibold">
            {estimatedCost ? formatCurrency(estimatedCost, currencyCode) : '-'}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-xs text-gray-500">Approved Total</div>
          <div className="text-lg font-semibold text-green-700">
            {totals ? formatCurrency(totals.totalGross, currencyCode) : '-'}
          </div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <div className="text-xs text-gray-500">Pending Review</div>
          <div className="text-lg font-semibold text-yellow-700">
            {totals?.pendingCount || 0} invoices
          </div>
        </div>
        {estimatedCost && totals && totals.totalGross > 0 && (
          <div
            className={`rounded-lg p-3 ${
              totals.totalGross > parseFloat(estimatedCost)
                ? 'bg-red-50'
                : 'bg-blue-50'
            }`}
          >
            <div className="text-xs text-gray-500">Variance</div>
            <div
              className={`text-lg font-semibold ${
                totals.totalGross > parseFloat(estimatedCost)
                  ? 'text-red-700'
                  : 'text-blue-700'
              }`}
            >
              {formatCurrency(
                totals.totalGross - parseFloat(estimatedCost),
                currencyCode
              )}
            </div>
          </div>
        )}
      </div>

      {/* Invoices list */}
      {invoices.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No invoices extracted yet</p>
          <p className="text-xs mt-1">
            Upload invoice documents and click the extract button
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="border rounded-lg overflow-hidden"
            >
              {/* Invoice header */}
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpanded(invoice.id)}
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-gray-400" />
                  <div>
                    <div className="font-medium">
                      {invoice.invoiceNumber || 'Invoice'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {invoice.sellerName || 'Unknown seller'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatCurrency(invoice.grossAmount, invoice.currencyCode)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(invoice.invoiceDate)}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      CONFIDENCE_COLORS[invoice.confidence]
                    }`}
                  >
                    {invoice.confidence}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      STATUS_COLORS[invoice.status]
                    }`}
                  >
                    {invoice.status.replace('_', ' ')}
                  </span>
                  {expandedId === invoice.id ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === invoice.id && (
                <div className="border-t p-4 bg-gray-50">
                  {/* Invoice details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-gray-500">Net Amount</div>
                      <div className="font-medium">
                        {formatCurrency(invoice.netAmount, invoice.currencyCode)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">VAT</div>
                      <div className="font-medium">
                        {formatCurrency(invoice.vatAmount, invoice.currencyCode)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Payment Due</div>
                      <div className="font-medium">
                        {formatDate(invoice.paymentDueDate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Payment Method</div>
                      <div className="font-medium">
                        {invoice.paymentMethod || '-'}
                      </div>
                    </div>
                  </div>

                  {/* Seller info */}
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-1">Seller</div>
                    <div className="text-sm">
                      <strong>{invoice.sellerName}</strong>
                      {invoice.sellerNip && (
                        <span className="text-gray-500 ml-2">
                          NIP: {invoice.sellerNip}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Line items */}
                  {invoice.lineItems && invoice.lineItems.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs text-gray-500 mb-2">Line Items</div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500">
                              <th className="pb-2">Description</th>
                              <th className="pb-2 text-right">Qty</th>
                              <th className="pb-2 text-right">Unit Price</th>
                              <th className="pb-2 text-right">VAT</th>
                              <th className="pb-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoice.lineItems.map((item, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="py-2 pr-4">{item.description}</td>
                                <td className="py-2 text-right">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="py-2 text-right">
                                  {formatCurrency(item.unitPriceNetto, invoice.currencyCode)}
                                </td>
                                <td className="py-2 text-right">
                                  {item.vatRate}%
                                </td>
                                <td className="py-2 text-right font-medium">
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
                    <div className="border-t pt-4 mt-4">
                      {(invoice.confidence === 'LOW' ||
                        invoice.confidence === 'REVIEW') && (
                        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-2 text-yellow-700 text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          Low confidence extraction - please review carefully
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          placeholder="Review notes (optional)"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          className="flex-1 text-sm border rounded px-3 py-2"
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

                  {/* Review info for already reviewed */}
                  {invoice.status !== 'pending_review' && invoice.reviewedAt && (
                    <div className="border-t pt-3 mt-3 text-sm text-gray-500">
                      Reviewed on {formatDate(invoice.reviewedAt)}
                      {invoice.reviewNotes && (
                        <span className="ml-2">- {invoice.reviewNotes}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default InvoiceCostsSection
