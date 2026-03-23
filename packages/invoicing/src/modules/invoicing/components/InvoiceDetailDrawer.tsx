'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Pencil,
  FileText,
  Building2,
  CreditCard,
  CalendarDays,
  Hash,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface InvoiceDetailDrawerProps {
  invoiceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  mainTableRef?: React.RefObject<HTMLDivElement | null>
}

interface LineItem {
  id: string
  lineNumber: number
  description: string
  quantity: string
  unit: string | null
  unitPriceNet: string
  vatRate: string
  vatRateCode: string | null
  netAmount: string
  vatAmount: string
  grossAmount: string
  gtuCode: string | null
  pkwiuCode: string | null
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
  sellerCountryCode: string | null
  sellerBankAccount: string | null
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  buyerCountryCode: string | null
  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string
  paymentMethod: string | null
  paymentTerms: string | null
  direction: string | null
  sourceType: string | null
  status: string | null
  ksefStatus: string | null
  ksefNumber: string | null
  ksefReferenceNumber: string | null
  ksefSubmittedAt: string | null
  ksefAcceptedAt: string | null
  ksefErrorMessage: string | null
  notes: string | null
  reviewNotes: string | null
  attachmentId: string | null
  sourceDocumentInvoiceId: string | null
  sourceDocumentId: string | null
  createdAt: string
  updatedAt: string
  lineItems: LineItem[]
}

const formatCurrency = (value: string | number | null, currency: string = 'PLN') => {
  if (value == null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pl-PL')
}

const getStatusBadge = (status: string | null) => {
  if (!status) return null
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800 border-gray-200',
    extracted: 'bg-purple-100 text-purple-800 border-purple-200',
    pending_review: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    submitted: 'bg-blue-100 text-blue-800 border-blue-200',
    sent: 'bg-blue-100 text-blue-800 border-blue-200',
    paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <Badge variant="outline" className={styles[status] || 'bg-gray-100 text-gray-800'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

const getKsefBadge = (status: string | null) => {
  if (!status || status === 'none') return null
  const styles: Record<string, string> = {
    submitted: 'bg-blue-50 text-blue-700 border-blue-200',
    accepted: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  }
  return (
    <Badge variant="outline" className={`text-xs ${styles[status] || ''}`}>
      KSeF: {status}
    </Badge>
  )
}

export function InvoiceDetailDrawer({
  invoiceId,
  open,
  onOpenChange,
  mainTableRef,
}: InvoiceDetailDrawerProps) {
  const router = useRouter()
  const [selectedPage, setSelectedPage] = useState(1)

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoicing-invoice', invoiceId],
    queryFn: async (): Promise<Invoice | null> => {
      if (!invoiceId) return null
      const { result } = await apiCall(`/api/invoicing/invoices/${invoiceId}`)
      return result as unknown as Invoice
    },
    enabled: !!invoiceId && open,
  })

  const sourceDocInvoiceId = invoice?.sourceDocumentInvoiceId

  const { data: pagesData } = useQuery({
    queryKey: ['fms-invoice-pages', sourceDocInvoiceId],
    queryFn: async (): Promise<{ invoiceId: string; totalPages: number } | null> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/pages`)
      return result as unknown as { invoiceId: string; totalPages: number }
    },
    enabled: !!sourceDocInvoiceId && open,
  })

  const totalPages = pagesData?.totalPages ?? 0
  const hasDocument = totalPages > 0

  // Reset page when invoice changes
  React.useEffect(() => { setSelectedPage(1) }, [invoiceId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={`p-0 overflow-hidden ${hasDocument ? 'w-full sm:max-w-5xl' : 'w-full sm:max-w-2xl'}`}
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Spinner className="h-8 w-8" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-destructive">
            Failed to load invoice
          </div>
        )}

        {invoice && (
          <div className="flex h-full">
            {/* Left panel — Document preview */}
            {hasDocument && (
              <div className="flex-shrink-0 border-r flex flex-col bg-muted/30" style={{ width: '50%' }}>
                <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/fms_documents/invoices/${sourceDocInvoiceId}/pages/${selectedPage}/image`}
                    alt={`Invoice page ${selectedPage}`}
                    className="max-h-full max-w-full object-contain rounded shadow-sm"
                  />
                </div>
                {totalPages > 1 && (
                  <div className="flex-shrink-0 border-t bg-background px-3 py-2 flex items-center justify-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={selectedPage <= 1}
                      onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {selectedPage} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={selectedPage >= totalPages}
                      onClick={() => setSelectedPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Right panel — Invoice details */}
            <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-background px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h2 className="text-lg font-semibold">
                      {invoice.invoiceNumber || 'Invoice'}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {invoice.direction && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {invoice.direction === 'outgoing' ? (
                            <ArrowUpRight className="h-3 w-3 text-blue-500" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3 text-orange-500" />
                          )}
                          {invoice.direction}
                        </span>
                      )}
                      {getStatusBadge(invoice.status)}
                      {getKsefBadge(invoice.ksefStatus)}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={invoice.status === 'extracted' ? 'default' : 'outline'}
                  onClick={() => {
                    onOpenChange(false)
                    if (
                      invoice.status === 'extracted' &&
                      invoice.direction === 'incoming' &&
                      invoice.sourceDocumentInvoiceId
                    ) {
                      router.push(`/backend/invoicing/${invoice.id}/verify`)
                    } else {
                      router.push(`/backend/invoicing/${invoice.id}/edit`)
                    }
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {invoice.status === 'extracted' && invoice.direction === 'incoming' && invoice.sourceDocumentInvoiceId
                    ? 'Verify & Allocate'
                    : invoice.status === 'extracted'
                      ? 'Verify & Edit'
                      : 'Edit'}
                </Button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Dates */}
                <div className="grid grid-cols-3 gap-4">
                  <Field icon={<CalendarDays className="h-3.5 w-3.5" />} label="Issue Date" value={formatDate(invoice.invoiceDate)} />
                  <Field icon={<CalendarDays className="h-3.5 w-3.5" />} label="Due Date" value={formatDate(invoice.dueDate)} />
                  <Field icon={<CalendarDays className="h-3.5 w-3.5" />} label="Service Date" value={formatDate(invoice.serviceDate)} />
                </div>

                {/* Parties */}
                <div className="grid grid-cols-2 gap-4">
                  <PartyCard
                    label="Seller"
                    name={invoice.sellerName}
                    taxId={invoice.sellerTaxId}
                    address={invoice.sellerAddress}
                    country={invoice.sellerCountryCode}
                    bankAccount={invoice.sellerBankAccount}
                  />
                  <PartyCard
                    label="Buyer"
                    name={invoice.buyerName}
                    taxId={invoice.buyerTaxId}
                    address={invoice.buyerAddress}
                    country={invoice.buyerCountryCode}
                  />
                </div>

                {/* Totals */}
                <div className="rounded-lg border p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Net Amount</span>
                      <span className="text-sm font-mono font-medium">{formatCurrency(invoice.netAmount, invoice.currencyCode)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">VAT</span>
                      <span className="text-sm font-mono font-medium">{formatCurrency(invoice.vatAmount, invoice.currencyCode)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Gross Amount</span>
                      <span className="text-lg font-mono font-semibold">{formatCurrency(invoice.grossAmount, invoice.currencyCode)}</span>
                    </div>
                  </div>
                  {(invoice.paymentMethod || invoice.paymentTerms) && (
                    <div className="mt-3 pt-3 border-t flex gap-4">
                      {invoice.paymentMethod && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-0.5">Payment Method</span>
                          <span className="text-sm capitalize">{invoice.paymentMethod.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {invoice.paymentTerms && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-0.5">Payment Terms</span>
                          <span className="text-sm">{invoice.paymentTerms}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Line Items */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Line Items ({invoice.lineItems.length})</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium text-xs">#</th>
                          <th className="text-left px-3 py-2 font-medium text-xs">Description</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Qty</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Unit Price</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">VAT%</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Net</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Gross</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.lineItems.map((li) => (
                          <tr key={li.id} className="border-t">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{li.lineNumber}</td>
                            <td className="px-3 py-2 text-xs">
                              {li.description}
                              {li.gtuCode && (
                                <Badge variant="secondary" className="ml-1 text-[9px] py-0">{li.gtuCode}</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{li.quantity} {li.unit || ''}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(li.unitPriceNet, invoice.currencyCode)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{li.vatRate}%</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(li.netAmount, invoice.currencyCode)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(li.grossAmount, invoice.currencyCode)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-medium">
                          <td colSpan={5} className="px-3 py-2 text-right text-xs">Total</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(invoice.netAmount, invoice.currencyCode)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{formatCurrency(invoice.grossAmount, invoice.currencyCode)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* KSeF Information */}
                {invoice.ksefStatus && invoice.ksefStatus !== 'none' && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <h3 className="text-sm font-medium">KSeF Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {invoice.ksefNumber && <Field label="KSeF Number" value={invoice.ksefNumber} />}
                      {invoice.ksefReferenceNumber && <Field label="Reference" value={invoice.ksefReferenceNumber} />}
                      {invoice.ksefSubmittedAt && <Field label="Submitted" value={formatDate(invoice.ksefSubmittedAt)} />}
                      {invoice.ksefAcceptedAt && <Field label="Accepted" value={formatDate(invoice.ksefAcceptedAt)} />}
                    </div>
                    {invoice.ksefErrorMessage && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        {invoice.ksefErrorMessage}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {invoice.notes && (
                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-medium mb-1">Notes</h3>
                    <p className="text-sm text-muted-foreground">{invoice.notes}</p>
                  </div>
                )}

                {/* Review Notes */}
                {invoice.reviewNotes && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-sm font-medium text-amber-800 mb-1">Review Notes</h3>
                    <p className="text-sm text-amber-700">{invoice.reviewNotes}</p>
                  </div>
                )}

                {/* Metadata footer */}
                <div className="text-xs text-muted-foreground pt-4 border-t space-y-1">
                  <div>Created: {formatDate(invoice.createdAt)}</div>
                  <div>Last updated: {formatDate(invoice.updatedAt)}</div>
                  {invoice.sourceType && invoice.sourceType !== 'manual' && (
                    <div>Source: {invoice.sourceType.replace(/_/g, ' ')}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PartyCard({
  label,
  name,
  taxId,
  address,
  country,
  bankAccount,
}: {
  label: string
  name: string | null
  taxId: string | null
  address: string | null
  country: string | null
  bankAccount?: string | null
}) {
  return (
    <div className="rounded-lg border p-4 space-y-1.5">
      <div className="flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-medium">{name || '-'}</div>
      {taxId && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Hash className="h-3 w-3" />
          {taxId}
          {country && <span className="ml-1">({country})</span>}
        </div>
      )}
      {address && <div className="text-xs text-muted-foreground">{address}</div>}
      {bankAccount && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CreditCard className="h-3 w-3" />
          {bankAccount}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  icon,
}: {
  label: string
  value: string | null | undefined
  icon?: React.ReactNode
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </span>
      <div className="text-sm font-medium">{value || '-'}</div>
    </div>
  )
}
