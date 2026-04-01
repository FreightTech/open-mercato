"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'

interface LineItem {
  id: string
  lineNumber: number
  description: string
  quantity: string
  unit: string | null
  unitPriceNet: string
  netAmount: string
  vatAmount: string
  vatRate: string
  vatRateCode: string | null
  gtuCode: string | null
}

interface KsefStatus {
  submissionId: string
  status: string
  ksefNumber: string | null
  referenceNumber: string | null
  submittedAt: string | null
  acceptedAt: string | null
  errorMessage: string | null
  errorCode: string | null
}

interface InvoiceDetail {
  id: string
  invoiceNumber: string
  direction: string
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
  invoiceType: string
  lineItems: LineItem[]
  _ksef: KsefStatus | null
  createdAt: string
  updatedAt: string
}

const submissionStatusStyles: Record<string, string> = {
  none: 'bg-gray-100 text-gray-800',
  queued: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-blue-100 text-blue-800',
  processing: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  upo_downloaded: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  error: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

export default function KsefInvoiceDetailPage({ params }: { params?: Record<string, string | string[]> }) {
  const router = useRouter()
  const id = params?.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : undefined
  const [invoice, setInvoice] = React.useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [xmlPreview, setXmlPreview] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function load() {
      const result = await apiCall<InvoiceDetail>(`/api/ksef/invoices/${id}`)
      if (result.ok) {
        setInvoice(result.result!)
      } else {
        setError('Invoice not found')
      }
      setLoading(false)
    }
    load()
  }, [id])

  const handleSubmitToKsef = async () => {
    setSubmitting(true)
    const result = await apiCall<{ submissionId: string; status: string }>(
      `/api/ksef/submit/${id}`,
      { method: 'POST' }
    )
    if (result.ok) {
      // Reload to show updated status
      const reloaded = await apiCall<InvoiceDetail>(`/api/ksef/invoices/${id}`)
      if (reloaded.ok) setInvoice(reloaded.result!)
    }
    setSubmitting(false)
  }

  const handlePreviewXml = async () => {
    const result = await apiCall<{ xml: string }>(`/api/ksef/generate-xml/${id}`, { method: 'POST' })
    if (result.ok) {
      setXmlPreview(result.result!.xml)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this invoice?')) return
    const result = await apiCall(`/api/ksef/invoices/${id}`, { method: 'DELETE' })
    if (result.ok) {
      router.push('/backend/ksef/invoices')
    }
  }

  if (loading) return <LoadingMessage />
  if (error || !invoice) return <ErrorMessage message={error ?? 'Invoice not found'} />

  const ksefStatus = invoice._ksef
  const canSubmit = invoice.direction === 'outgoing' && (!ksefStatus || ['none', 'error', 'cancelled'].includes(ksefStatus.status))
  const canEdit = !ksefStatus || ['none', 'error', 'cancelled'].includes(ksefStatus.status)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} invoice
            {invoice.invoiceDate ? ` — ${new Date(invoice.invoiceDate).toLocaleDateString()}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {canSubmit && (
            <button
              type="button"
              onClick={handleSubmitToKsef}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit to KSeF'}
            </button>
          )}
          <button
            type="button"
            onClick={handlePreviewXml}
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Preview XML
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => router.push(`/backend/ksef/invoices/create?edit=${id}`)}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Edit
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-background px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {ksefStatus && (
        <div className="rounded-lg border p-4">
          <h2 className="font-medium mb-3">KSeF Submission Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase">Status</div>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${submissionStatusStyles[ksefStatus.status] ?? 'bg-gray-100'}`}>
                {ksefStatus.status}
              </span>
            </div>
            {ksefStatus.ksefNumber && (
              <div>
                <div className="text-muted-foreground text-xs uppercase">KSeF Number</div>
                <div className="mt-1 font-mono text-xs">{ksefStatus.ksefNumber}</div>
              </div>
            )}
            {ksefStatus.submittedAt && (
              <div>
                <div className="text-muted-foreground text-xs uppercase">Submitted</div>
                <div className="mt-1">{new Date(ksefStatus.submittedAt).toLocaleString()}</div>
              </div>
            )}
            {ksefStatus.acceptedAt && (
              <div>
                <div className="text-muted-foreground text-xs uppercase">Accepted</div>
                <div className="mt-1">{new Date(ksefStatus.acceptedAt).toLocaleString()}</div>
              </div>
            )}
            {ksefStatus.errorMessage && (
              <div className="col-span-full">
                <div className="text-muted-foreground text-xs uppercase">Error</div>
                <div className="mt-1 text-red-600">{ksefStatus.errorMessage}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-4">
          <h2 className="font-medium mb-3">Seller</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{invoice.sellerName ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax ID (NIP)</dt>
              <dd className="font-mono">{invoice.sellerTaxId ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Address</dt>
              <dd>{invoice.sellerAddress ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Country</dt>
              <dd>{invoice.sellerCountryCode ?? '-'}</dd>
            </div>
            {invoice.sellerBankAccount && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Bank Account</dt>
                <dd className="font-mono text-xs">{invoice.sellerBankAccount}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-medium mb-3">Buyer</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{invoice.buyerName ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax ID (NIP)</dt>
              <dd className="font-mono">{invoice.buyerTaxId ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Address</dt>
              <dd>{invoice.buyerAddress ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Country</dt>
              <dd>{invoice.buyerCountryCode ?? '-'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-medium mb-3">Invoice Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs uppercase">Type</div>
            <div className="mt-1">{invoice.invoiceType}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">Due Date</div>
            <div className="mt-1">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">Payment Method</div>
            <div className="mt-1">{invoice.paymentMethod ?? '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">Currency</div>
            <div className="mt-1">{invoice.currencyCode}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t text-sm">
          <div>
            <div className="text-muted-foreground text-xs uppercase">Net Amount</div>
            <div className="mt-1 font-mono">{Number(invoice.netAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">VAT Amount</div>
            <div className="mt-1 font-mono">{Number(invoice.vatAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">Gross Amount</div>
            <div className="mt-1 font-mono font-bold">{Number(invoice.grossAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currencyCode}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-medium">Line Items ({invoice.lineItems.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium w-12">#</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-left font-medium">Unit</th>
              <th className="px-4 py-2 text-right font-medium">Unit Price</th>
              <th className="px-4 py-2 text-right font-medium">Net</th>
              <th className="px-4 py-2 text-right font-medium">VAT %</th>
              <th className="px-4 py-2 text-right font-medium">VAT</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{li.lineNumber}</td>
                <td className="px-4 py-2">{li.description}</td>
                <td className="px-4 py-2 text-right font-mono">{li.quantity}</td>
                <td className="px-4 py-2">{li.unit ?? '-'}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(li.unitPriceNet).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(li.netAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right">{li.vatRate}%</td>
                <td className="px-4 py-2 text-right font-mono">{Number(li.vatAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {xmlPreview && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">FA(3) XML Preview</h2>
            <button
              type="button"
              onClick={() => setXmlPreview(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <pre className="bg-muted p-4 rounded text-xs overflow-x-auto max-h-96 overflow-y-auto">
            {xmlPreview}
          </pre>
        </div>
      )}
    </div>
  )
}
