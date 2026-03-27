'use client'

import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import {
  CheckCircle,
  XCircle,
  Building2,
  Truck,
  Receipt,
  ArrowRight,
  EyeOff,
  Eye,
  Plus,
  Link2,
} from 'lucide-react'
import { PagePreview } from '../../../../components/PagePreview'
import { PageThumbnails } from '../../../../components/PageThumbnails'

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
  isExcluded: boolean
  isManuallyAdded: boolean
  productId: string | null
  productName: string | null
  chargeCode: string | null
}

interface Invoice {
  id: string
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  serviceDate: string | null
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
  status: string
  invoiceType: string | null
  expenseCategory: string | null
  expenseNote: string | null
  documentId: string | null
  sellerContractorId: string | null
  buyerContractorId: string | null
  extractionConfidence: string | null
  blNumber: string | null
  vesselName: string | null
  voyageNumber: string | null
  containerNumbers: string[] | null
  transportationMetadata: Record<string, unknown> | null
  lineItems?: LineItem[]
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
  const invoiceId = params?.id
  const router = useRouter()
  const queryClient = useQueryClient()

  const [selectedPage, setSelectedPage] = useState(1)
  const [invoiceType, setInvoiceType] = useState<'project_cost' | 'company_expense' | null>(null)
  const [expenseCategory, setExpenseCategory] = useState<string | null>(null)
  const [expenseNote, setExpenseNote] = useState('')

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async (): Promise<Invoice> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${invoiceId}`)
      return result as unknown as Invoice
    },
  })

  const { data: pagesData } = useQuery({
    queryKey: ['invoice-pages', invoiceId],
    queryFn: async (): Promise<PagesResponse | null> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${invoiceId}/pages`)
      return result as unknown as PagesResponse
    },
  })

  const { data: contractors } = useQuery({
    queryKey: ['invoice-contractors', invoiceId],
    queryFn: async (): Promise<{ seller: ContractorMatch; buyer: ContractorMatch }> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${invoiceId}/match-contractors`)
      return result as unknown as { seller: ContractorMatch; buyer: ContractorMatch }
    },
    enabled: !!invoice,
  })

  // Initialize form state from invoice data
  React.useEffect(() => {
    if (invoice) {
      if (invoice.invoiceType) {
        setInvoiceType(invoice.invoiceType as 'project_cost' | 'company_expense')
      }
      if (invoice.expenseCategory) setExpenseCategory(invoice.expenseCategory)
      if (invoice.expenseNote) setExpenseNote(invoice.expenseNote)
    }
  }, [invoice])

  const totalPages = pagesData?.totalPages ?? 0
  const hasPages = totalPages > 0

  const toggleExcludeMutation = useMutation({
    mutationFn: async (lineItemId: string) => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${invoiceId}/toggle-exclude`, {
        method: 'POST',
        body: JSON.stringify({ lineItemId }),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${invoiceId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          invoiceType,
          expenseCategory: invoiceType === 'company_expense' ? expenseCategory : null,
          expenseNote: invoiceType === 'company_expense' ? expenseNote : null,
          sellerContractorId: contractors?.seller?.contractorId ?? null,
          buyerContractorId: contractors?.buyer?.contractorId ?? null,
        }),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      if (invoiceType === 'project_cost') {
        router.push(`/backend/fms-documents/invoices/${invoiceId}/allocate`)
      }
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${invoiceId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', reviewNotes: 'Rejected during verification' }),
      })
      return result
    },
    onSuccess: () => {
      router.push('/backend/fms-documents')
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
    () => (invoice?.lineItems ?? []).filter((li) => !li.isExcluded),
    [invoice]
  )
  const excludedLines = useMemo(
    () => (invoice?.lineItems ?? []).filter((li) => li.isExcluded),
    [invoice]
  )

  const isAlreadyConfirmed = invoice?.status === 'confirmed' || invoice?.status === 'approved'
  const canConfirm = invoiceType !== null && (invoiceType !== 'company_expense' || expenseCategory)

  if (isLoading) {
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
                router.push(`/backend/fms-documents/invoices/${invoiceId}/allocate`)
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
            <PagePreview
              invoiceId={invoiceId}
              pageNumber={selectedPage}
              totalPages={totalPages}
              className="flex-1"
            />
            <PageThumbnails
              invoiceId={invoiceId}
              totalPages={totalPages}
              selectedPage={selectedPage}
              onSelectPage={setSelectedPage}
            />
          </div>
        )}

        {/* Right panel - Verification form */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6 max-w-2xl">
              {/* A. Header */}
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Extracted data</h2>
                {getConfidenceBadge(invoice.extractionConfidence)}
                {invoice.invoiceNumber && (
                  <Badge variant="outline">{invoice.invoiceNumber}</Badge>
                )}
              </div>

              {/* B. Parties */}
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

              {/* C. Invoice Type Selector */}
              <div>
                <label className="text-sm font-medium mb-3 block">Invoice classification</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setInvoiceType('project_cost')}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                      invoiceType === 'project_cost'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <Truck className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Project cost</div>
                      <div className="text-xs text-muted-foreground">Freight, customs, shipping charges</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setInvoiceType('company_expense')}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                      invoiceType === 'company_expense'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Company expense</div>
                      <div className="text-xs text-muted-foreground">Telecom, insurance, office, etc.</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* D. Conditional section */}
              {invoiceType === 'project_cost' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium block">Shipping details</label>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Booking Ref" value={invoice.transportationMetadata?.bookingNumber as string} />
                    <InfoField label="B/L Number" value={invoice.blNumber} />
                    <InfoField label="Vessel / Voyage" value={[invoice.vesselName, invoice.voyageNumber].filter(Boolean).join(' / ')} />
                    <InfoField label="POL / POD" value={[invoice.transportationMetadata?.portOfLoading as string, invoice.transportationMetadata?.portOfDischarge as string].filter(Boolean).join(' → ')} />
                  </div>
                  {invoice.containerNumbers && invoice.containerNumbers.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Containers</label>
                      <div className="flex flex-wrap gap-1.5">
                        {invoice.containerNumbers.map((cn, i) => (
                          <Badge key={i} variant="secondary" className="font-mono text-xs">{cn}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {invoiceType === 'company_expense' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium block">Expense details</label>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setExpenseCategory(cat)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                            expenseCategory === cat
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
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
                    />
                  </div>
                </div>
              )}

              {/* E. Line items table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">
                    Line items ({activeLines.length})
                    {excludedLines.length > 0 && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({excludedLines.length} excluded)
                      </span>
                    )}
                  </label>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                        <th className="text-right px-3 py-2 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 font-medium">Rate</th>
                        <th className="text-right px-3 py-2 font-medium">Total</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {(invoice.lineItems ?? []).map((li) => (
                        <tr
                          key={li.id}
                          className={`border-t ${li.isExcluded ? 'opacity-40 bg-muted/20' : ''}`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{li.lineNumber}</td>
                          <td className="px-3 py-2">
                            <span className={li.isExcluded ? 'line-through' : ''}>
                              {li.description}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{li.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatCurrency(li.unitPriceNet, invoice.currencyCode)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {formatCurrency(li.grossAmount, invoice.currencyCode)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => toggleExcludeMutation.mutate(li.id)}
                              className="p-1 rounded hover:bg-muted transition-colors"
                              title={li.isExcluded ? 'Restore line' : 'Exclude line'}
                            >
                              {li.isExcluded ? (
                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-medium">
                        <td colSpan={4} className="px-3 py-2 text-right">Total</td>
                        <td className="px-3 py-2 text-right font-mono">
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

          {/* F. Action bar */}
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
