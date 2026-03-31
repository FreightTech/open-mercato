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
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Send,
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
  notes: string | null
  reviewNotes: string | null
  attachmentId: string | null
  sourceDocumentInvoiceId: string | null
  sourceDocumentId: string | null
  createdAt: string
  updatedAt: string
  lineItems: LineItem[]
}

// ── Helpers ──

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  verticalAlign: 'middle',
  borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
  whiteSpace: 'nowrap',
}

const formatCurrency = (value: string | number | null, currency: string = 'PLN') => {
  if (value == null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + ' ' + currency
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pl-PL')
}

const paymentMethodLabel: Record<string, string> = {
  przelew: 'Bank transfer',
  gotowka: 'Cash',
  karta: 'Card',
  kompensata: 'Compensation',
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

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '13px', lineHeight: '1.6' }}>
      <span style={{ ...sectionLabelStyle, fontSize: '11px', minWidth: '40px', paddingTop: '2px' }}>{label}</span>
      <span style={{ color: value ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ── Main Component ──

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
      const { result } = await apiCall(`/api/fms_invoicing/invoices/${invoiceId}`)
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

  React.useEffect(() => { setSelectedPage(1) }, [invoiceId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={`p-0 overflow-hidden ${hasDocument ? 'w-full sm:max-w-6xl' : 'w-full sm:max-w-3xl'}`}
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedPage <= 1} onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">{selectedPage} / {totalPages}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedPage >= totalPages} onClick={() => setSelectedPage((p) => Math.min(totalPages, p + 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Right panel — Invoice details */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* ── Header ── */}
              <div className="flex-shrink-0 border-b bg-background px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h2 className="text-base font-semibold">{invoice.invoiceNumber || 'Invoice'}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        {invoice.direction && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            {invoice.direction === 'outgoing' ? <ArrowUpRight className="h-3 w-3 text-blue-500" /> : <ArrowDownLeft className="h-3 w-3 text-orange-500" />}
                            {invoice.direction}
                          </span>
                        )}
                        {getStatusBadge(invoice.status)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Export PDF
                    </Button>
                    <Button variant="outline" size="sm">
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Send
                    </Button>
                    <Button
                      size="sm"
                      variant={invoice.status === 'extracted' ? 'default' : 'default'}
                      onClick={() => {
                        onOpenChange(false)
                        if (invoice.status === 'extracted' && invoice.direction === 'incoming' && invoice.sourceDocumentInvoiceId) {
                          router.push(`/backend/fms-invoicing/${invoice.id}/verify`)
                        } else {
                          router.push(`/backend/fms-invoicing/${invoice.id}/edit`)
                        }
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      {invoice.status === 'extracted' && invoice.direction === 'incoming' && invoice.sourceDocumentInvoiceId
                        ? 'Verify & Allocate'
                        : 'Edit'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── Scrollable content ── */}
              <div className="flex-1 overflow-y-auto">
                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--border)' }}>
                  <DetailCell label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
                  <DetailCell label="Service Date" value={formatDate(invoice.serviceDate)} />
                  <DetailCell label="Due Date" value={formatDate(invoice.dueDate)} warn={!invoice.dueDate} />
                  <DetailCell label="Payment" value={paymentMethodLabel[invoice.paymentMethod ?? ''] || invoice.paymentMethod} />
                  <DetailCell label="Currency" value={invoice.currencyCode} />
                </div>

                {/* Seller / Buyer */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, padding: '16px 20px', borderRight: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Building2 style={{ width: 14, height: 14, opacity: 0.4 }} />
                      <span style={sectionLabelStyle}>Seller</span>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{invoice.sellerName || '—'}</div>
                    <InfoLine label="NIP" value={invoice.sellerTaxId} />
                    <InfoLine label="ADRES" value={[invoice.sellerAddress, invoice.sellerCountryCode].filter(Boolean).join(', ') || null} />
                    {invoice.sellerBankAccount && <InfoLine label="IBAN" value={invoice.sellerBankAccount} />}
                  </div>
                  <div style={{ flex: 1, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Building2 style={{ width: 14, height: 14, opacity: 0.4 }} />
                      <span style={sectionLabelStyle}>Buyer</span>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{invoice.buyerName || '—'}</div>
                    <InfoLine label="NIP" value={invoice.buyerTaxId} />
                    <InfoLine label="ADRES" value={[invoice.buyerAddress, invoice.buyerCountryCode].filter(Boolean).join(', ') || null} />
                  </div>
                </div>

                {/* Line Items */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ ...sectionLabelStyle, marginBottom: '12px' }}>Line Items ({invoice.lineItems.length})</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 30, textAlign: 'center' }}>#</th>
                        <th style={{ ...thStyle, textAlign: 'left', width: '30%' }}>Description</th>
                        <th style={{ ...thStyle, width: 55, textAlign: 'right' }}>Qty</th>
                        <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Unit Price</th>
                        <th style={{ ...thStyle, width: 50, textAlign: 'right' }}>VAT%</th>
                        <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Net</th>
                        <th style={{ ...thStyle, width: 90, textAlign: 'right', fontWeight: 700 }}>Gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lineItems.map((li) => (
                        <tr key={li.id}>
                          <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>{li.lineNumber}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'normal' }}>
                            {li.description}
                            {li.gtuCode && <Badge variant="secondary" className="ml-1.5 text-[9px] py-0">{li.gtuCode}</Badge>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{li.quantity} {li.unit || ''}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(li.unitPriceNet, invoice.currencyCode)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{li.vatRate}%</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{formatCurrency(li.netAmount, invoice.currencyCode)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatCurrency(li.grossAmount, invoice.currencyCode)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>Total</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: 'none' }}>{formatCurrency(invoice.netAmount, invoice.currencyCode)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, borderBottom: 'none' }}>{formatCurrency(invoice.grossAmount, invoice.currencyCode)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Totals */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '32px', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>Razem netto</span>
                        <span>{formatCurrency(invoice.netAmount, invoice.currencyCode)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '32px', fontSize: '13px', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>Razem VAT</span>
                        <span>{formatCurrency(invoice.vatAmount, invoice.currencyCode)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '32px', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Razem brutto</span>
                        <span style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(invoice.grossAmount, invoice.currencyCode)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer bar */}
                <div style={{
                  padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '24px',
                  fontSize: '12px', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)',
                }}>
                  {invoice.paymentMethod && (
                    <div>
                      <span style={sectionLabelStyle}>Sposób płatności</span>{' '}
                      <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{paymentMethodLabel[invoice.paymentMethod] || invoice.paymentMethod}</span>
                    </div>
                  )}
                  {invoice.sellerBankAccount && (
                    <div>
                      <span style={sectionLabelStyle}>Konto</span>{' '}
                      <span style={{ color: 'var(--foreground)', fontWeight: 500, fontFamily: 'monospace', fontSize: '11px' }}>{invoice.sellerBankAccount}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {invoice.notes && (
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: '6px' }}>Notes</div>
                    <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>{invoice.notes}</p>
                  </div>
                )}

                {/* Review Notes */}
                {invoice.reviewNotes && (
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(245, 158, 11, 0.05)' }}>
                    <div style={{ ...sectionLabelStyle, marginBottom: '6px', color: 'rgb(180, 83, 9)' }}>Review Notes</div>
                    <p style={{ fontSize: '13px', color: 'rgb(180, 83, 9)', margin: 0 }}>{invoice.reviewNotes}</p>
                  </div>
                )}

                {/* Metadata */}
                <div style={{ padding: '16px 20px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  Created: {formatDate(invoice.createdAt)}
                  {invoice.sourceType && invoice.sourceType !== 'manual' && (
                    <span style={{ marginLeft: '16px' }}>Source: {invoice.sourceType.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailCell({ label, value, warn }: { label: string; value: string | null | undefined; warn?: boolean }) {
  return (
    <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
      <div style={{
        ...sectionLabelStyle,
        marginBottom: '4px',
        color: warn ? 'var(--destructive)' : undefined,
      }}>
        {label} {warn && '⚠'}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 500, color: warn ? 'var(--destructive)' : undefined }}>
        {value || (warn ? 'Not set' : '—')}
      </div>
    </div>
  )
}
