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

interface CompanyProfile {
  nip: string
  name: string
  regon: string | null
  krs: string | null
  residenceAddress: string | null
  workingAddress: string | null
  statusVat: string | null
  accountNumbers: string[]
  verifiedAt: string
}

interface IntegrationDetailContext {
  detail?: {
    state?: {
      isEnabled?: boolean
    } | null
    hasCredentials?: boolean
  } | null
  credentialValues?: Record<string, unknown> | null
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

const vatStatusStyles: Record<string, string> = {
  Czynny: 'bg-green-100 text-green-800',
  Zwolniony: 'bg-yellow-100 text-yellow-800',
  Niezarejestrowany: 'bg-red-100 text-red-800',
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

function formatDateDMY(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${d}/${m}/${date.getFullYear()}`
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

export default function KsefInvoicesWidget({ context }: InjectionWidgetComponentProps) {
  const ctx = context as IntegrationDetailContext
  const router = useRouter()
  const queryClient = useQueryClient()

  // Invoice list state
  const [page, setPage] = React.useState(1)
  const [direction, setDirection] = React.useState('')
  const [search, setSearch] = React.useState('')
  const limit = 20

  // Sync panel state
  const [showFetchForm, setShowFetchForm] = React.useState(false)
  const [fetchDateFrom, setFetchDateFrom] = React.useState(getDefaultDateFrom)
  const [fetchDateTo, setFetchDateTo] = React.useState(getDefaultDateTo)
  const [fetchSubjectType, setFetchSubjectType] = React.useState('all')
  const [fetchResult, setFetchResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  // Company profile state
  const [company, setCompany] = React.useState<CompanyProfile | null>(null)
  const [companyLoading, setCompanyLoading] = React.useState(true)
  const [showCompanySection, setShowCompanySection] = React.useState(true)
  const [editingCompany, setEditingCompany] = React.useState(false)
  const [companyForm, setCompanyForm] = React.useState({
    nip: '', name: '', regon: '', krs: '', workingAddress: '', statusVat: '', accountNumbers: '',
  })
  const [savingCompany, setSavingCompany] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)

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

  // Load company profile
  React.useEffect(() => {
    async function load() {
      const result = await apiCall<{ profile: CompanyProfile | null }>('/api/ksef/company-profile')
      if (result.ok && result.result?.profile) {
        setCompany(result.result.profile)
      }
      setCompanyLoading(false)
    }
    load()
  }, [])

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

  // ── Sync auto-save ──

  const updateSyncSettings = React.useCallback((updater: (prev: SyncSettings) => SyncSettings) => {
    const next = updater(syncSettings)
    queryClient.setQueryData(['ksef', 'settings'], next)
    settingsMutation.mutate(next)
  }, [syncSettings, queryClient, settingsMutation])

  // ── Company handlers ──

  const credentialNip = ctx.credentialValues?.nip as string | undefined

  const handleRefreshCompany = async () => {
    const nip = company?.nip ?? credentialNip
    if (!nip || !/^\d{10}$/.test(nip)) return
    setVerifying(true)
    const result = await apiCall<CompanyProfile>('/api/ksef/verify-nip', {
      method: 'POST',
      body: JSON.stringify({ nip }),
    })
    setVerifying(false)
    if (result.ok && result.result) setCompany(result.result)
  }

  const handleEditCompany = () => {
    setCompanyForm({
      nip: company?.nip ?? credentialNip ?? '',
      name: company?.name ?? '',
      regon: company?.regon ?? '',
      krs: company?.krs ?? '',
      workingAddress: company?.workingAddress ?? company?.residenceAddress ?? '',
      statusVat: company?.statusVat ?? '',
      accountNumbers: (company?.accountNumbers ?? []).join('\n'),
    })
    setEditingCompany(true)
  }

  const handleSaveCompany = async () => {
    setSavingCompany(true)
    const result = await apiCall<CompanyProfile>('/api/ksef/company-profile', {
      method: 'PUT',
      body: JSON.stringify({
        nip: companyForm.nip,
        name: companyForm.name,
        regon: companyForm.regon || null,
        krs: companyForm.krs || null,
        workingAddress: companyForm.workingAddress || null,
        statusVat: companyForm.statusVat || null,
        accountNumbers: companyForm.accountNumbers.split('\n').map((s) => s.trim()).filter(Boolean),
      }),
    })
    setSavingCompany(false)
    if (result.ok && result.result) {
      setCompany(result.result)
      setEditingCompany(false)
    }
  }

  // ── Last sync info ──

  const syncStatusLine = React.useMemo(() => {
    if (!syncSettings.syncEnabled) return null
    const interval = intervalOptions.find((o) => o.value === syncSettings.syncIntervalMinutes)
    const label = interval?.label ?? `Every ${syncSettings.syncIntervalMinutes}m`
    if (!syncSettings.lastSyncAt) return { label, timeAgo: 'Never synced', overdue: false }
    const lastSync = new Date(syncSettings.lastSyncAt)
    const minutesAgo = Math.floor((Date.now() - lastSync.getTime()) / 60000)
    const timeAgo = minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`
    const overdue = minutesAgo > syncSettings.syncIntervalMinutes * 1.5
    return { label, timeAgo, overdue }
  }, [syncSettings])

  return (
    <div className="space-y-4">
      {/* ── Company Profile ── */}
      {!companyLoading && (
        <section className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setShowCompanySection(!showCompanySection)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {company ? (
                <>
                  <span className="text-sm font-semibold truncate">{company.name}</span>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">NIP: {company.nip}</span>
                  {company.statusVat && (
                    <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${vatStatusStyles[company.statusVat] ?? 'bg-gray-100 text-gray-800'}`}>
                      VAT: {company.statusVat}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {credentialNip ? `NIP: ${credentialNip} — Company data not set` : 'Company profile not configured'}
                </span>
              )}
            </div>
            <svg className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showCompanySection ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </button>

          {showCompanySection && (
            <div className="border-t px-4 py-3 space-y-3">
              {editingCompany ? (
                /* Company edit form */
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Company name <span className="text-red-500">*</span></label>
                      <input type="text" value={companyForm.name}
                        onChange={(e) => setCompanyForm((s) => ({ ...s, name: e.target.value }))}
                        className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">NIP</label>
                      <input type="text" value={companyForm.nip} readOnly
                        className="w-full rounded-md border px-3 py-1.5 text-sm bg-muted font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">REGON</label>
                      <input type="text" value={companyForm.regon}
                        onChange={(e) => setCompanyForm((s) => ({ ...s, regon: e.target.value }))}
                        className="w-full rounded-md border px-3 py-1.5 text-sm bg-background font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">KRS</label>
                      <input type="text" value={companyForm.krs}
                        onChange={(e) => setCompanyForm((s) => ({ ...s, krs: e.target.value }))}
                        className="w-full rounded-md border px-3 py-1.5 text-sm bg-background font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Address</label>
                      <input type="text" value={companyForm.workingAddress}
                        onChange={(e) => setCompanyForm((s) => ({ ...s, workingAddress: e.target.value }))}
                        className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">VAT status</label>
                      <select value={companyForm.statusVat}
                        onChange={(e) => setCompanyForm((s) => ({ ...s, statusVat: e.target.value }))}
                        className="w-full rounded-md border px-3 py-1.5 text-sm bg-background">
                        <option value="">Unknown</option>
                        <option value="Czynny">Czynny (active)</option>
                        <option value="Zwolniony">Zwolniony (exempt)</option>
                        <option value="Niezarejestrowany">Niezarejestrowany (unregistered)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Bank accounts (one per line)</label>
                    <textarea value={companyForm.accountNumbers} rows={2}
                      onChange={(e) => setCompanyForm((s) => ({ ...s, accountNumbers: e.target.value }))}
                      className="w-full rounded-md border px-3 py-1.5 text-sm bg-background font-mono" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={savingCompany || !companyForm.name} onClick={handleSaveCompany}
                      className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {savingCompany ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingCompany(false)}
                      className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : company ? (
                /* Company info view */
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {company.regon && <span className="font-mono">REGON: {company.regon}</span>}
                      {company.krs && <span className="font-mono">KRS: {company.krs}</span>}
                    </div>
                    {(company.workingAddress ?? company.residenceAddress) && (
                      <p className="text-xs text-muted-foreground">{company.workingAddress ?? company.residenceAddress}</p>
                    )}
                    {company.accountNumbers.length > 0 && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {company.accountNumbers.length === 1 ? company.accountNumbers[0] : `${company.accountNumbers.length} bank accounts`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" disabled={verifying} onClick={handleRefreshCompany}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50">
                      {verifying ? 'Verifying…' : 'Refresh'}
                    </button>
                    <button type="button" onClick={handleEditCompany}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                /* No company data */
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Company data not set.
                  </p>
                  <div className="flex items-center gap-2">
                    {credentialNip && /^\d{10}$/.test(credentialNip) && (
                      <button type="button" disabled={verifying} onClick={handleRefreshCompany}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50">
                        {verifying ? 'Verifying…' : 'Fetch from White List'}
                      </button>
                    )}
                    <button type="button" onClick={handleEditCompany}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                      Enter manually
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Sync Status + Header ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{total} invoices</p>
            {/* Inline sync status */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/40">|</span>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${syncSettings.syncEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
              {syncSettings.syncEnabled && syncStatusLine ? (
                <>
                  <span>{syncStatusLine.label}</span>
                  <span className="text-muted-foreground/40">&middot;</span>
                  <span className={syncStatusLine.overdue ? 'text-amber-600 font-medium' : ''}>
                    {syncStatusLine.overdue ? 'Overdue — ' : ''}{syncStatusLine.timeAgo}
                  </span>
                </>
              ) : (
                <span>Auto-sync off</span>
              )}
              {/* Sync settings inline controls */}
              <button type="button" role="switch" aria-checked={syncSettings.syncEnabled}
                onClick={() => updateSyncSettings((s) => ({ ...s, syncEnabled: !s.syncEnabled }))}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${syncSettings.syncEnabled ? 'bg-primary' : 'bg-input'}`}>
                <span className={`pointer-events-none block h-3 w-3 rounded-full bg-background shadow transition-transform ${syncSettings.syncEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
              </button>
              {syncSettings.syncEnabled && (
                <select value={syncSettings.syncIntervalMinutes}
                  onChange={(e) => updateSyncSettings((s) => ({ ...s, syncIntervalMinutes: Number(e.target.value) }))}
                  className="rounded border px-1.5 py-0.5 text-xs bg-background">
                  {intervalOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={clearMutation.isPending} onClick={() => {
              if (!confirm('Delete all synced invoices? This will remove all KSeF invoices and submissions from the database, allowing you to re-sync.')) return
              clearMutation.mutate()
            }}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-background px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
              {clearMutation.isPending ? 'Clearing...' : 'Clear All'}
            </button>
            <button type="button" onClick={() => { setShowFetchForm(!showFetchForm); setFetchResult(null) }}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
              Fetch from KSeF
            </button>
            <Link href="/backend/ksef/invoices/import"
              className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
              Import XML
            </Link>
            <Link href="/backend/ksef/invoices/create"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              New Invoice
            </Link>
          </div>
        </div>

        {/* Manual fetch form — collapsible */}
        {showFetchForm && (
          <div className="rounded-lg border bg-card p-4">
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
                <button type="button" disabled={fetchMutation.isPending}
                  onClick={() => fetchMutation.mutate({ dateFrom: fetchDateFrom, dateTo: fetchDateTo, subjectType: fetchSubjectType })}
                  className="w-full rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {fetchMutation.isPending ? 'Starting…' : 'Fetch invoices'}
                </button>
              </div>
            </div>
            {fetchResult && (
              <span className={`block mt-2 text-sm ${fetchResult.ok ? 'text-green-700' : 'text-red-600'}`}>{fetchResult.message}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Filters ── */}
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

      {/* ── Table ── */}
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
                    {inv.invoiceDate ? formatDateDMY(new Date(inv.invoiceDate)) : '-'}
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

      {/* ── Pagination ── */}
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
