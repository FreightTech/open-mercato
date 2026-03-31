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

export default function KsefInvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = React.useState<KsefInvoiceRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [direction, setDirection] = React.useState<string>('')
  const [search, setSearch] = React.useState('')
  const limit = 20

  const loadInvoices = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (direction) params.set('direction', direction)
    if (search) params.set('search', search)

    const result = await apiCall<{ items: KsefInvoiceRow[]; total: number }>(`/api/ksef/invoices?${params}`)
    if (result.ok) {
      setInvoices(result.data.items)
      setTotal(result.data.total)
    }
    setLoading(false)
  }, [page, direction, search])

  React.useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">KSeF Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} invoices</p>
        </div>
        <div className="flex gap-2">
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
        <LoadingMessage />
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
                    {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}
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
