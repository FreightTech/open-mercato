"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'

interface KsefInvoiceRow {
  id: string
  invoiceNumber: string
  direction: string
  invoiceDate: string | null
  sellerName: string | null
  sellerTaxId: string | null
  buyerName: string | null
  buyerTaxId: string | null
  grossAmount: string
  currencyCode: string
  createdAt: string
}

const directionStyles: Record<string, string> = {
  outgoing: 'bg-blue-100 text-blue-800',
  incoming: 'bg-green-100 text-green-800',
}

function getDefaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function getDefaultDateTo(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateDMY(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${d}/${m}/${date.getFullYear()}`
}

export default function KsefInvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = React.useState<KsefInvoiceRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [direction, setDirection] = React.useState<string>('')
  const [search, setSearch] = React.useState('')
  const limit = 20

  // Fetch from KSeF modal state
  const [fetchModalOpen, setFetchModalOpen] = React.useState(false)
  const [fetchDateFrom, setFetchDateFrom] = React.useState(getDefaultDateFrom)
  const [fetchDateTo, setFetchDateTo] = React.useState(getDefaultDateTo)
  const [fetchSubjectType, setFetchSubjectType] = React.useState<string>('subject2')
  const [fetchLoading, setFetchLoading] = React.useState(false)
  const [fetchResult, setFetchResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  const loadInvoices = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (direction) params.set('direction', direction)
    if (search) params.set('search', search)

    const result = await apiCall<{ items: KsefInvoiceRow[]; total: number }>(`/api/ksef/invoices?${params}`)
    if (result.ok) {
      setInvoices(result.result!.items)
      setTotal(result.result!.total)
    }
    setLoading(false)
  }, [page, direction, search])

  React.useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const totalPages = Math.ceil(total / limit)

  const handleFetchFromKsef = async () => {
    setFetchLoading(true)
    setFetchResult(null)
    const result = await apiCall<{ message: string; nip: string }>('/api/ksef/sync-received', {
      method: 'POST',
      body: JSON.stringify({
        dateFrom: fetchDateFrom || undefined,
        dateTo: fetchDateTo || undefined,
        subjectType: fetchSubjectType,
      }),
    })
    setFetchLoading(false)
    if (result.ok) {
      setFetchResult({ ok: true, message: `Sync job started for NIP ${result.result!.nip}. Invoices will appear shortly.` })
      setTimeout(() => {
        setFetchModalOpen(false)
        setFetchResult(null)
        loadInvoices()
      }, 3000)
    } else {
      setFetchResult({ ok: false, message: 'Failed to start sync' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">KSeF Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} invoices</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setFetchResult(null); setFetchModalOpen(true) }}
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Fetch from KSeF
          </button>
          <Link
            href="/backend/ksef/invoices/import"
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Import XML
          </Link>
          <Link
            href="/backend/ksef/invoices/create"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New Invoice
          </Link>
        </div>
      </div>

      {/* Fetch from KSeF Modal */}
      {fetchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !fetchLoading && setFetchModalOpen(false)}>
          <div
            className="bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !fetchLoading) setFetchModalOpen(false)
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !fetchLoading) handleFetchFromKsef()
            }}
          >
            <div>
              <h2 className="text-lg font-semibold">Fetch invoices from KSeF</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Download received invoices from KSeF for the selected date range.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Invoice type</label>
                <select
                  value={fetchSubjectType}
                  onChange={(e) => setFetchSubjectType(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                >
                  <option value="subject2">Incoming (received)</option>
                  <option value="subject1">Outgoing (issued)</option>
                  <option value="subject3">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date from</label>
                <input
                  type="date"
                  value={fetchDateFrom}
                  onChange={(e) => setFetchDateFrom(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date to</label>
                <input
                  type="date"
                  value={fetchDateTo}
                  onChange={(e) => setFetchDateTo(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                />
              </div>
            </div>

            {fetchResult && (
              <div className={`rounded-md px-3 py-2 text-sm ${fetchResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {fetchResult.message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={fetchLoading}
                onClick={() => setFetchModalOpen(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={fetchLoading}
                onClick={handleFetchFromKsef}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {fetchLoading ? 'Starting...' : 'Fetch invoices'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search invoices..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background w-64"
        />
        <select
          value={direction}
          onChange={(e) => { setDirection(e.target.value); setPage(1) }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        >
          <option value="">All directions</option>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </select>
      </div>

      {loading ? (
        <LoadingMessage label="Loading invoices…" />
      ) : invoices.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          No invoices found. Create a new invoice or import from XML.
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Invoice Number</th>
                <th className="px-4 py-2 text-left font-medium">Direction</th>
                <th className="px-4 py-2 text-left font-medium">Counterparty</th>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => router.push(`/backend/ksef/invoices/${inv.id}`)}
                >
                  <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${directionStyles[inv.direction] ?? 'bg-gray-100'}`}>
                      {inv.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {inv.direction === 'outgoing'
                      ? (inv.buyerName ?? inv.buyerTaxId ?? '-')
                      : (inv.sellerName ?? inv.sellerTaxId ?? '-')}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {inv.invoiceDate ? formatDateDMY(new Date(inv.invoiceDate)) : '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {Number(inv.grossAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {inv.currencyCode}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/backend/ksef/invoices/${inv.id}`)
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
