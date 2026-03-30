'use client'

import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import {
  CheckCircle,
  XCircle,
  Building2,
  Truck,
  ArrowRight,
  EyeOff,
  Eye,
  Link2,
} from 'lucide-react'

interface RouteParams {
  params?: { id?: string }
}

interface LineItem {
  id: string
  lineNumber: number
  description: string
  quantity: string
  unit: string | null
  unitPriceNet: string
  vatRate: string
  netAmount: string
  vatAmount: string
  grossAmount: string
  sourceLineItemId: string | null
}

interface InvoicingInvoice {
  id: string
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  sellerName: string | null
  sellerTaxId: string | null
  sellerAddress: string | null
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string
  direction: string | null
  status: string
  sourceDocumentInvoiceId: string | null
  sourceDocumentId: string | null
  lineItems: LineItem[]
}

interface FmsInvoice {
  id: string
  extractionConfidence: string | null
  blNumber: string | null
  vesselName: string | null
  voyageNumber: string | null
  containerNumbers: string[] | null
  transportationMetadata: Record<string, unknown> | null
  invoiceType: string | null
  expenseCategory: string | null
  expenseNote: string | null
  status: string
}

interface PagesResponse {
  invoiceId: string
  totalPages: number
}

interface ContractorMatch {
  name: string | null
  taxId: string | null
  contractorId: string | null
  contractorName: string | null
  matched: boolean
}

const formatCurrency = (value: string | number, currency: string = 'PLN') => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

const EXPENSE_CATEGORIES = [
  'telecom',
  'insurance',
  'office',
  'utilities',
  'legal',
  'consulting',
  'marketing',
  'travel',
  'maintenance',
  'other',
]

export default function VerifyInvoicePage({ params }: RouteParams) {
  const invoicingId = params?.id
  const router = useRouter()
  const queryClient = useQueryClient()

  const [selectedPage, setSelectedPage] = useState(1)
  const [invoiceType, setInvoiceType] = useState<'project_cost' | 'company_expense' | null>(null)
  const [expenseCategory, setExpenseCategory] = useState<string | null>(null)
  const [expenseNote, setExpenseNote] = useState('')

  // Load invoicing invoice
  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoicing-invoice', invoicingId],
    queryFn: async (): Promise<InvoicingInvoice> => {
      const { result } = await apiCall(`/api/invoicing/invoices/${invoicingId}`)
      return result as unknown as InvoicingInvoice
    },
  })

  const sourceDocInvoiceId = invoice?.sourceDocumentInvoiceId

  // Load FMS invoice for extraction metadata
  const { data: fmsInvoice } = useQuery({
    queryKey: ['fms-invoice', sourceDocInvoiceId],
    queryFn: async (): Promise<FmsInvoice> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}`)
      return result as unknown as FmsInvoice
    },
    enabled: !!sourceDocInvoiceId,
  })

  // Load PDF pages from FMS
  const { data: pagesData } = useQuery({
    queryKey: ['fms-invoice-pages', sourceDocInvoiceId],
    queryFn: async (): Promise<PagesResponse | null> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/pages`)
      return result as unknown as PagesResponse
    },
    enabled: !!sourceDocInvoiceId,
  })

  // Load contractor matches from FMS
  const { data: contractors } = useQuery({
    queryKey: ['fms-invoice-contractors', sourceDocInvoiceId],
    queryFn: async (): Promise<{ seller: ContractorMatch; buyer: ContractorMatch }> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/match-contractors`)
      return result as unknown as { seller: ContractorMatch; buyer: ContractorMatch }
    },
    enabled: !!sourceDocInvoiceId,
  })

  // Initialize form state from FMS invoice data
  React.useEffect(() => {
    if (fmsInvoice) {
      if (fmsInvoice.invoiceType) {
        setInvoiceType(fmsInvoice.invoiceType as 'project_cost' | 'company_expense')
      }
      if (fmsInvoice.expenseCategory) setExpenseCategory(fmsInvoice.expenseCategory)
      if (fmsInvoice.expenseNote) setExpenseNote(fmsInvoice.expenseNote)
    }
  }, [fmsInvoice])

  const totalPages = pagesData?.totalPages ?? 0
  const hasPages = totalPages > 0

  // Toggle line item exclude via FMS API
  const toggleExcludeMutation = useMutation({
    mutationFn: async (lineItem: LineItem) => {
      if (!lineItem.sourceLineItemId || !sourceDocInvoiceId) return
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/toggle-exclude`, {
        method: 'POST',
        body: JSON.stringify({ lineItemId: lineItem.sourceLineItemId }),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoicing-invoice', invoicingId] })
      queryClient.invalidateQueries({ queryKey: ['fms-invoice', sourceDocInvoiceId] })
    },
  })

  // Confirm invoice: delegates to FMS + updates invoicing status
  const confirmMutation = useMutation({
    mutationFn: async () => {
      // 1. Confirm FMS invoice
      await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          invoiceType,
          expenseCategory: invoiceType === 'company_expense' ? expenseCategory : null,
          expenseNote: invoiceType === 'company_expense' ? expenseNote : null,
          sellerContractorId: contractors?.seller?.contractorId ?? null,
          buyerContractorId: contractors?.buyer?.contractorId ?? null,
        }),
      })

      // 2. Update invoicing invoice status
      await apiCall(`/api/invoicing/invoices/${invoicingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending_review' }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoicing-invoice', invoicingId] })
      queryClient.invalidateQueries({ queryKey: ['fms-invoice', sourceDocInvoiceId] })
      if (invoiceType === 'project_cost') {
        router.push(`/backend/invoicing/${invoicingId}/verify/allocate`)
      } else {
        router.push('/backend/invoicing')
      }
    },
  })

  // Reject invoice
  const rejectMutation = useMutation({
    mutationFn: async () => {
      // 1. Reject FMS invoice
      await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', reviewNotes: 'Rejected during verification' }),
      })

      // 2. Update invoicing status
      await apiCall(`/api/invoicing/invoices/${invoicingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      })
    },
    onSuccess: () => {
      router.push('/backend/invoicing')
    },
  })

  const getConfidenceBadge = useCallback((confidence: string | null) => {
    switch (confidence) {
      case 'HIGH':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">High confidence</Badge>
      case 'MEDIUM':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Medium confidence</Badge>
      case 'LOW':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Low confidence</Badge>
      default:
        return null
    }
  }, [])

  const activeLines = useMemo(
    () => (invoice?.lineItems ?? []),
    [invoice]
  )

  const fmsIsConfirmed = fmsInvoice?.status === 'confirmed' || fmsInvoice?.status === 'approved'
  const isAlreadyConfirmed = fmsIsConfirmed || invoice?.status === 'pending_review' || invoice?.status === 'approved'
  const canConfirm = invoiceType !== null && (invoiceType !== 'company_expense' || expenseCategory)

  if (invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-muted-foreground">
        Invoice not found
      </div>
    )
  }

  // If no source document, redirect to normal edit page
  if (!invoice.sourceDocumentInvoiceId) {
    router.replace(`/backend/invoicing/${invoicingId}/edit`)
    return null
  }

  const pageImageUrl = (pageNum: number) =>
    `/api/fms_documents/invoices/${sourceDocInvoiceId}/pages/${pageNum}/image`

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Tab bar */}
      <div className="flex-shrink-0 border-b bg-background">
        <div className="flex items-center px-6 py-0">
          <button
            className="px-4 py-3 text-sm font-medium border-b-2 border-primary text-primary"
          >
            1. Verify invoice
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 ${
              isAlreadyConfirmed && invoiceType === 'project_cost'
                ? 'border-transparent text-muted-foreground hover:text-foreground cursor-pointer'
                : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
            }`}
            onClick={() => {
              if (isAlreadyConfirmed && invoiceType === 'project_cost') {
                router.push(`/backend/invoicing/${invoicingId}/verify/allocate`)
              }
            }}
            disabled={!isAlreadyConfirmed || invoiceType !== 'project_cost'}
          >
            2. Allocate costs
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel - PDF preview */}
        {hasPages && (
          <div className="flex-shrink-0 border-r flex flex-col h-full bg-muted/30" style={{ width: '50%' }}>
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pageImageUrl(selectedPage)}
                alt={`Page ${selectedPage}`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            {totalPages > 1 && (
              <div className="flex-shrink-0 border-t bg-background px-4 py-2 flex items-center justify-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selectedPage <= 1}
                  onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {selectedPage} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selectedPage >= totalPages}
                  onClick={() => setSelectedPage((p) => Math.min(totalPages, p + 1))}
                >
                  →
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Right panel - Verification form */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6 max-w-2xl">
              {/* Header */}
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Extracted data</h2>
                {getConfidenceBadge(fmsInvoice?.extractionConfidence ?? null)}
                {invoice.invoiceNumber && (
                  <Badge variant="outline">{invoice.invoiceNumber}</Badge>
                )}
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4">
                <PartyCard
                  label="Seller"
                  name={invoice.sellerName}
                  taxId={invoice.sellerTaxId}
                  address={invoice.sellerAddress}
                  contractorMatch={contractors?.seller}
                />
                <PartyCard
                  label="Buyer"
                  name={invoice.buyerName}
                  taxId={invoice.buyerTaxId}
                  address={invoice.buyerAddress}
                  contractorMatch={contractors?.buyer}
                />
              </div>

              {/* Invoice Type Selector */}
              <div>
                <label className="text-sm font-medium mb-3 block">Invoice type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => !isAlreadyConfirmed && setInvoiceType('project_cost')}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                      invoiceType === 'project_cost'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-muted-foreground/30'
                    } ${isAlreadyConfirmed ? 'pointer-events-none' : ''}`}
                  >
                    <Truck className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Project cost</div>
                      <div className="text-xs text-muted-foreground">Linked to a shipment / file</div>
                    </div>
                  </button>
                  <button
                    onClick={() => !isAlreadyConfirmed && setInvoiceType('company_expense')}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                      invoiceType === 'company_expense'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-muted-foreground/30'
                    } ${isAlreadyConfirmed ? 'pointer-events-none' : ''}`}
                  >
                    <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Company expense</div>
                      <div className="text-xs text-muted-foreground">Office, telecom, insurance, etc.</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Conditional: Shipping details for project_cost */}
              {invoiceType === 'project_cost' && fmsInvoice && (
                <div className="space-y-3">
                  <label className="text-sm font-medium block">Shipping details</label>
                  <div className="grid grid-cols-3 gap-3">
                    <InfoField label="Booking Ref" value={fmsInvoice.transportationMetadata?.bookingNumber as string} />
                    <InfoField label="B/L Number" value={fmsInvoice.blNumber} />
                    <InfoField label="Currency" value={invoice.currencyCode} />
                    <InfoField label="Vessel / Voyage" value={[fmsInvoice.vesselName, fmsInvoice.voyageNumber].filter(Boolean).join(' / ')} />
                    <InfoField label="POL" value={fmsInvoice.transportationMetadata?.portOfLoading as string} />
                    <InfoField label="POD" value={fmsInvoice.transportationMetadata?.portOfDischarge as string} />
                  </div>
                  {fmsInvoice.containerNumbers && fmsInvoice.containerNumbers.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        Container numbers <Badge variant="secondary" className="ml-1 text-xs">{fmsInvoice.containerNumbers.length}</Badge>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {fmsInvoice.containerNumbers.map((cn, i) => (
                          <Badge key={i} variant="secondary" className="font-mono text-xs">{cn}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Conditional: Expense details for company_expense */}
              {invoiceType === 'company_expense' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium block">Expense details</label>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => !isAlreadyConfirmed && setExpenseCategory(cat)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                            expenseCategory === cat
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          } ${isAlreadyConfirmed ? 'pointer-events-none' : ''}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</label>
                    <Textarea
                      value={expenseNote}
                      onChange={(e) => setExpenseNote(e.target.value)}
                      placeholder="Additional notes about this expense..."
                      rows={2}
                      className="text-sm"
                      disabled={isAlreadyConfirmed}
                    />
                  </div>
                </div>
              )}

              {/* Line items table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">
                    Line items <Badge variant="secondary" className="ml-1">{activeLines.length}</Badge>
                  </label>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium text-xs">Description</th>
                        <th className="text-right px-3 py-2 font-medium text-xs">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-xs">Rate</th>
                        <th className="text-right px-3 py-2 font-medium text-xs">Total</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {activeLines.map((li) => (
                        <tr key={li.id} className="border-t">
                          <td className="px-3 py-2 text-xs">{li.description}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{li.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {formatCurrency(li.unitPriceNet, invoice.currencyCode)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                            {formatCurrency(li.grossAmount, invoice.currencyCode)}
                          </td>
                          <td className="px-3 py-2">
                            {li.sourceLineItemId && (
                              <button
                                onClick={() => toggleExcludeMutation.mutate(li)}
                                className="p-1 rounded hover:bg-muted transition-colors"
                                title="Toggle exclude"
                              >
                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-medium">
                        <td colSpan={3} className="px-3 py-2 text-right text-xs">
                          Total {invoice.currencyCode}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {formatCurrency(invoice.grossAmount, invoice.currencyCode)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex-shrink-0 border-t bg-background px-6 py-3">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || isAlreadyConfirmed}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={!canConfirm || confirmMutation.isPending || isAlreadyConfirmed}
              >
                {invoiceType === 'project_cost' ? (
                  <>
                    Confirm & allocate
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm expense
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PartyCard({
  label,
  name,
  taxId,
  address,
  contractorMatch,
}: {
  label: string
  name: string | null
  taxId: string | null
  address: string | null
  contractorMatch?: ContractorMatch
}) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        {contractorMatch?.matched ? (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
            <Link2 className="h-3 w-3 mr-1" />
            In system
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
            Not recognized
          </Badge>
        )}
      </div>
      <div className="text-sm font-medium">{name || '-'}</div>
      {taxId && <div className="text-xs text-muted-foreground font-mono">{taxId}</div>}
      {address && <div className="text-xs text-muted-foreground">{address}</div>}
      {contractorMatch?.contractorName && (
        <div className="text-xs text-emerald-600">
          Linked: {contractorMatch.contractorName}
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-0.5 block">{label}</label>
      <div className="text-sm font-medium">{value || '-'}</div>
    </div>
  )
}
