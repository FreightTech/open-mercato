"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'

// ── Types ──

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
  ksefStatus: string | null
  ksefNumber: string | null
}

interface SyncSettings {
  syncEnabled: boolean
  syncIntervalMinutes: number
  lastSyncAt: string | null
}

// ── Constants ──

const directionStyles: Record<string, string> = {
  outgoing: 'bg-blue-100 text-blue-800',
  incoming: 'bg-green-100 text-green-800',
}

const ksefStatusStyles: Record<string, string> = {
  none: 'bg-gray-100 text-gray-600',
  queued: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-blue-100 text-blue-800',
  processing: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  upo_downloaded: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  error: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

const ksefStatusLabels: Record<string, string> = {
  none: 'Not sent',
  queued: 'Queued',
  submitted: 'Submitted',
  processing: 'Processing',
  accepted: 'Accepted',
  upo_downloaded: 'UPO Ready',
  rejected: 'Rejected',
  error: 'Error',
  cancelled: 'Cancelled',
}

const intervalOptions = [
  { label: 'Every 15 minutes', value: 15 },
  { label: 'Every 30 minutes', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 6 hours', value: 360 },
  { label: 'Every 12 hours', value: 720 },
  { label: 'Every 24 hours', value: 1440 },
]

function getDefaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function getDefaultDateTo(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── API helpers ──

async function fetchInvoices(params: { page: number; limit: number; direction: string; search: string }) {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
  if (params.direction) qs.set('direction', params.direction)
  if (params.search) qs.set('search', params.search)
  const result = await apiCall<{ items: KsefInvoiceRow[]; total: number }>(`/api/ksef/invoices?${qs}`)
  if (!result.ok) throw new Error('Failed to load invoices')
  return result.result!
}

async function fetchSettings() {
  const result = await apiCall<SyncSettings>('/api/ksef/settings')
  if (!result.ok) throw new Error('Failed to load settings')
  return result.result!
}

async function saveSettings(settings: SyncSettings) {
  const result = await apiCall('/api/ksef/settings', { method: 'PUT', body: JSON.stringify(settings) })
  if (!result.ok) throw new Error('Failed to save settings')
}

// ── Component ──

export default function KsefInvoicesWidget(_props: InjectionWidgetComponentProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [page, setPage] = React.useState(1)
  const [direction, setDirection] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [showSyncPanel, setShowSyncPanel] = React.useState(false)
  const [fetchDateFrom, setFetchDateFrom] = React.useState(getDefaultDateFrom)
  const [fetchDateTo, setFetchDateTo] = React.useState(getDefaultDateTo)
  const [fetchSubjectType, setFetchSubjectType] = React.useState('all')
  const [fetchResult, setFetchResult] = React.useState<{ ok: boolean; message: string } | null>(null)
  const limit = 20

  // ── Queries ──

  const invoicesQuery = useQuery({
    queryKey: ['ksef', 'invoices', page, direction, search],
    queryFn: () => fetchInvoices({ page, limit, direction, search }),
  })

  const settingsQuery = useQuery({
    queryKey: ['ksef', 'settings'],
    queryFn: fetchSettings,
  })

  const syncSettings = settingsQuery.data ?? { syncEnabled: false, syncIntervalMinutes: 60, lastSyncAt: null }
  const total = invoicesQuery.data?.total ?? 0
  const invoices = invoicesQuery.data?.items ?? []
  const totalPages = Math.ceil(total / limit)

  // ── Mutations ──

  const settingsMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ksef', 'settings'] }),
  })

  const fetchMutation = useMutation({
    mutationFn: async (params: { dateFrom: string; dateTo: string; subjectType: string }) => {
      const types = params.subjectType === 'all' ? ['subject1', 'subject2', 'subject3'] : [params.subjectType]
      const results = await Promise.all(
        types.map((subjectType) =>
          apiCall<{ message: string; nip: string }>('/api/ksef/sync-received', {
            method: 'POST',
            body: JSON.stringify({ dateFrom: params.dateFrom || undefined, dateTo: params.dateTo || undefined, subjectType }),
          })
        )
      )
      if (!results.some((r) => r.ok)) throw new Error('Failed to start sync')
      return types.length
    },
    onSuccess: (typeCount) => {
      setFetchResult({ ok: true, message: `Sync started for ${typeCount === 1 ? '1 type' : 'all types'}` })
      // Invalidate after worker has time to process
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['ksef', 'invoices'] })
        queryClient.invalidateQueries({ queryKey: ['ksef', 'settings'] })
        setFetchResult(null)
      }, 5000)
    },
    onError: () => {
      setFetchResult({ ok: false, message: 'Failed to start sync' })
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const result = await apiCall<{ deleted: number }>('/api/ksef/invoices/clear-synced', { method: 'DELETE' })
      if (!result.ok) throw new Error('Failed to clear invoices')
      return result.result!
    },
    onSuccess: () => {
      setPage(1)
      queryClient.invalidateQueries({ queryKey: ['ksef', 'invoices'] })
    },
  })

  // ── Sync settings auto-save ──

  const updateSyncSettings = React.useCallback((updater: (prev: SyncSettings) => SyncSettings) => {
    const next = updater(syncSettings)
    queryClient.setQueryData(['ksef', 'settings'], next)
    settingsMutation.mutate(next)
  }, [syncSettings, queryClient, settingsMutation])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} invoices</p>
        <div className="flex gap-2">
          <button type="button" disabled={clearMutation.isPending} onClick={() => {
            if (!confirm('Delete all synced invoices? This will remove all KSeF invoices and submissions from the database, allowing you to re-sync.')) return
            clearMutation.mutate()
          }}
            className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-background px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
            {clearMutation.isPending ? 'Clearing...' : 'Clear All'}
          </button>
          <button type="button" onClick={() => setShowSyncPanel(!showSyncPanel)}
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            {showSyncPanel ? 'Hide Sync' : 'Sync from KSeF'}
          </button>
          <Link href="/backend/ksef/invoices/import"
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            Import XML
          </Link>
          <Link href="/backend/ksef/invoices/create"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            New Invoice
          </Link>
        </div>
      </div>

      {/* Sync Panel — collapsible */}
      {showSyncPanel && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          {/* Auto sync */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Automatic sync</label>
              <p className="text-xs text-muted-foreground">Fetch received invoices on a schedule.</p>
            </div>
            <div className="flex items-center gap-3">
              {syncSettings.syncEnabled && (
                <select value={syncSettings.syncIntervalMinutes}
                  onChange={(e) => updateSyncSettings((s) => ({ ...s, syncIntervalMinutes: Number(e.target.value) }))}
                  className="rounded-md border px-2 py-1 text-xs bg-background">
                  {intervalOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              <button type="button" role="switch" aria-checked={syncSettings.syncEnabled}
                onClick={() => updateSyncSettings((s) => ({ ...s, syncEnabled: !s.syncEnabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${syncSettings.syncEnabled ? 'bg-primary' : 'bg-input'}`}>
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${syncSettings.syncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Last sync status */}
          {syncSettings.syncEnabled && (
            <div className="flex items-center gap-2 text-xs">
              {syncSettings.lastSyncAt ? (() => {
                const lastSync = new Date(syncSettings.lastSyncAt!)
                const minutesAgo = Math.floor((Date.now() - lastSync.getTime()) / 60000)
                const isOverdue = minutesAgo > syncSettings.syncIntervalMinutes * 1.5
                return (
                  <>
                    <span className={isOverdue ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                      {isOverdue ? 'Sync overdue — ' : ''}Last synced: {lastSync.toLocaleString()}
                      {' '}({minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`})
                    </span>
                    {isOverdue && (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                        Expected every {syncSettings.syncIntervalMinutes}m
                      </span>
                    )}
                  </>
                )
              })() : (
                <span className="text-muted-foreground">Never synced</span>
              )}
            </div>
          )}

          {/* Manual fetch */}
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-medium">Manual fetch</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Type</label>
                <select value={fetchSubjectType} onChange={(e) => setFetchSubjectType(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background">
                  <option value="all">All</option>
                  <option value="subject2">Incoming</option>
                  <option value="subject1">Outgoing</option>
                  <option value="subject3">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">From</label>
                <input type="date" value={fetchDateFrom} onChange={(e) => setFetchDateFrom(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">To</label>
                <input type="date" value={fetchDateTo} onChange={(e) => setFetchDateTo(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
              </div>
              <div className="flex items-end">
                <button type="button" disabled={fetchMutation.isPending} onClick={() => fetchMutation.mutate({ dateFrom: fetchDateFrom, dateTo: fetchDateTo, subjectType: fetchSubjectType })}
                  className="w-full rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {fetchMutation.isPending ? 'Starting…' : 'Fetch invoices'}
                </button>
              </div>
            </div>
            {fetchResult && (
              <span className={`text-sm ${fetchResult.ok ? 'text-green-700' : 'text-red-600'}`}>{fetchResult.message}</span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input type="text" placeholder="Search invoices..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background w-64" />
        <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1) }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background">
          <option value="">All directions</option>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </select>
      </div>

      {/* Table */}
      {invoicesQuery.isLoading ? (
        <LoadingMessage label="Loading invoices…" />
      ) : invoices.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          No invoices found. Create a new invoice or sync from KSeF.
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Invoice Number</th>
                <th className="px-4 py-2 text-left font-medium">Direction</th>
                <th className="px-4 py-2 text-left font-medium">KSeF Status</th>
                <th className="px-4 py-2 text-left font-medium">Counterparty</th>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => router.push(`/backend/ksef/invoices/${inv.id}`)}>
                  <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${directionStyles[inv.direction] ?? 'bg-gray-100'}`}>
                      {inv.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {inv.ksefStatus ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ksefStatusStyles[inv.ksefStatus] ?? 'bg-gray-100 text-gray-600'}`}
                        title={inv.ksefNumber ?? undefined}>
                        {ksefStatusLabels[inv.ksefStatus] ?? inv.ksefStatus}
                      </span>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${inv.direction === 'incoming' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {inv.direction === 'incoming' ? 'Received' : 'Not sent'}
                      </span>
                    )}
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
                    <button type="button" onClick={(e) => { e.stopPropagation(); router.push(`/backend/ksef/invoices/${inv.id}`) }}
                      className="text-xs text-blue-600 hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent">Previous</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
