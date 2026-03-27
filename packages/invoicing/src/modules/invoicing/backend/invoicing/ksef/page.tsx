'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import {
  Radio,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Activity,
} from 'lucide-react'

// ========================================
// Types
// ========================================

interface KsefSession {
  id: string
  sessionType: string
  sessionStatus: string
  ksefReferenceNumber: string | null
  nip: string
  invoiceCount: number
  startedAt: string | null
  closedAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

interface SessionsResponse {
  items: KsefSession[]
  total: number
  page: number
  totalPages: number
}

interface InvoiceRow {
  id: string
  invoiceNumber: string | null
  invoiceDate: string | null
  sellerName: string | null
  buyerName: string | null
  grossAmount: string | null
  currencyCode: string | null
  ksefStatus: string | null
  ksefNumber: string | null
}

interface InvoicesResponse {
  items: InvoiceRow[]
  total: number
  page: number
  totalPages: number
}

// ========================================
// Styles
// ========================================

const sessionStatusStyles: Record<string, string> = {
  initializing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closing: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const ksefStatusStyles: Record<string, string> = {
  none: 'bg-gray-50 text-gray-600 border-gray-200',
  queued: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-green-50 text-green-700 border-green-200',
  upo_downloaded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
}

const selectClassName = 'flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

// ========================================
// Helpers
// ========================================

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

// ========================================
// Active Sessions Card
// ========================================

function ActiveSessionsCard({ sessions }: { sessions: KsefSession[] }) {
  const t = useT()
  const activeSessions = sessions.filter((s) => s.sessionStatus === 'active' || s.sessionStatus === 'initializing')

  if (activeSessions.length === 0) {
    return (
      <div className="border rounded-lg p-6 flex flex-col items-center justify-center text-center bg-muted/30">
        <Radio className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-muted-foreground">{t('invoicing.ksef.noActiveSessions', 'No active sessions')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('invoicing.ksef.noActiveSessionsDescription', 'Start a session by submitting invoices to KSeF')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activeSessions.map((session) => (
        <div key={session.id} className="border rounded-lg p-4 bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-600" />
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sessionStatusStyles[session.sessionStatus] ?? ''}`}>
                {t(`invoicing.sessions.status.${session.sessionStatus}`, session.sessionStatus)}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{session.sessionType}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTime(session.startedAt)}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">{t('invoicing.ksef.nip', 'NIP')}</span>
              <span className="font-mono">{session.nip}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">{t('invoicing.ksef.reference', 'Reference')}</span>
              <span className="font-mono text-xs">{session.ksefReferenceNumber ? `${session.ksefReferenceNumber.slice(0, 24)}...` : '-'}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">{t('invoicing.ksef.invoicesSubmitted', 'Invoices Submitted')}</span>
              <span className="font-semibold tabular-nums">{session.invoiceCount}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ========================================
// Sessions History
// ========================================

function SessionsHistory() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SessionsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const loadSessions = useCallback(async (p: number, status: string) => {
    setLoading(true)
    setError(null)
    const statusParam = status ? `&status=${status}` : ''
    const result = await apiCall<SessionsResponse>(`/api/invoicing/ksef/sessions?page=${p}&limit=10${statusParam}`)
    if (result.ok && result.result) {
      setData(result.result)
    } else {
      setError('Failed to load sessions')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSessions(page, statusFilter)
  }, [loadSessions, page, statusFilter])

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <select
          className={selectClassName}
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="">{t('invoicing.ksef.allStatuses', 'All statuses')}</option>
          <option value="initializing">{t('invoicing.sessions.status.initializing', 'Initializing')}</option>
          <option value="active">{t('invoicing.sessions.status.active', 'Active')}</option>
          <option value="closing">{t('invoicing.sessions.status.closing', 'Closing')}</option>
          <option value="closed">{t('invoicing.sessions.status.closed', 'Closed')}</option>
          <option value="error">{t('invoicing.sessions.status.error', 'Error')}</option>
        </select>
        <Button variant="ghost" size="sm" onClick={() => loadSessions(page, statusFilter)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('invoicing.ksef.refresh', 'Refresh')}
        </Button>
      </div>

      {loading && <LoadingMessage label="Loading sessions..." />}
      {error && <ErrorMessage label={error} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Radio className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">{t('invoicing.sessions.empty', 'No sessions yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('invoicing.sessions.emptyDescription', 'Sessions will appear here when invoices are submitted to KSeF')}</p>
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoicing.sessions.status', 'Status')}</TableHead>
                  <TableHead>{t('invoicing.sessions.type', 'Type')}</TableHead>
                  <TableHead>{t('invoicing.sessions.nip', 'NIP')}</TableHead>
                  <TableHead>{t('invoicing.sessions.referenceNumber', 'Reference')}</TableHead>
                  <TableHead className="text-right">{t('invoicing.sessions.invoiceCount', 'Invoices')}</TableHead>
                  <TableHead>{t('invoicing.sessions.startedAt', 'Started')}</TableHead>
                  <TableHead>{t('invoicing.sessions.closedAt', 'Closed')}</TableHead>
                  <TableHead>{t('invoicing.sessions.error', 'Error')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sessionStatusStyles[session.sessionStatus] ?? ''}`}>
                        {t(`invoicing.sessions.status.${session.sessionStatus}`, session.sessionStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{session.sessionType}</TableCell>
                    <TableCell className="font-mono text-sm">{session.nip}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {session.ksefReferenceNumber ? `${session.ksefReferenceNumber.slice(0, 16)}...` : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{session.invoiceCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(session.startedAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(session.closedAt)}</TableCell>
                    <TableCell className="text-xs text-red-600 max-w-[200px] truncate">{session.errorMessage ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} sessions)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ========================================
// Recent KSeF Submissions
// ========================================

function RecentSubmissions() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<InvoicesResponse | null>(null)

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await apiCall<InvoicesResponse>(
      '/api/invoicing/invoices?pageSize=10&sortField=updatedAt&sortDir=desc'
    )
    if (result.ok && result.result) {
      const filtered = {
        ...result.result,
        items: result.result.items.filter((i) => i.ksefStatus && i.ksefStatus !== 'none'),
      }
      setData(filtered)
    } else {
      setError('Failed to load submissions')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSubmissions()
  }, [loadSubmissions])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={loadSubmissions}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('invoicing.ksef.refresh', 'Refresh')}
        </Button>
      </div>

      {loading && <LoadingMessage label="Loading submissions..." />}
      {error && <ErrorMessage label={error} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">{t('invoicing.ksef.noSubmissions', 'No KSeF submissions yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('invoicing.ksef.noSubmissionsDescription', 'Invoices submitted to KSeF will appear here')}</p>
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('invoicing.ksef.invoiceNumber', 'Invoice Number')}</TableHead>
                <TableHead>{t('invoicing.ksef.date', 'Date')}</TableHead>
                <TableHead>{t('invoicing.ksef.seller', 'Seller')}</TableHead>
                <TableHead>{t('invoicing.ksef.buyer', 'Buyer')}</TableHead>
                <TableHead className="text-right">{t('invoicing.ksef.amount', 'Amount')}</TableHead>
                <TableHead>{t('invoicing.ksef.ksefStatus', 'KSeF Status')}</TableHead>
                <TableHead>{t('invoicing.ksef.ksefNumber', 'KSeF Number')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium text-sm">{invoice.invoiceNumber ?? '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invoice.invoiceDate ?? '-'}</TableCell>
                  <TableCell className="text-sm">{invoice.sellerName ?? '-'}</TableCell>
                  <TableCell className="text-sm">{invoice.buyerName ?? '-'}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {invoice.grossAmount ?? '-'} {invoice.currencyCode ?? ''}
                  </TableCell>
                  <TableCell>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border capitalize truncate ${ksefStatusStyles[invoice.ksefStatus ?? ''] ?? ksefStatusStyles.none}`}>
                      {(invoice.ksefStatus ?? 'none').replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {invoice.ksefNumber ? `${invoice.ksefNumber.slice(0, 20)}...` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ========================================
// Main Page
// ========================================

export default function KsefDashboardPage() {
  const t = useT()
  const [sessionsData, setSessionsData] = useState<SessionsResponse | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadActiveSessions = useCallback(async () => {
    const result = await apiCall<SessionsResponse>('/api/invoicing/ksef/sessions?limit=5&status=active')
    if (result.ok && result.result) {
      setSessionsData(result.result)
    }
  }, [])

  useEffect(() => {
    loadActiveSessions()
  }, [loadActiveSessions, refreshKey])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('invoicing.ksef.dashboard', 'KSeF Dashboard')}</h2>
          <p className="text-sm text-muted-foreground">{t('invoicing.ksef.dashboardDescription', 'Session management and invoice submission overview')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('invoicing.ksef.refreshAll', 'Refresh All')}
        </Button>
      </div>

      <section>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {t('invoicing.ksef.activeSessions', 'Active Sessions')}
        </h3>
        <ActiveSessionsCard sessions={sessionsData?.items ?? []} />
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {t('invoicing.ksef.recentSubmissions', 'Recent KSeF Submissions')}
        </h3>
        <RecentSubmissions key={refreshKey} />
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Radio className="h-4 w-4" />
          {t('invoicing.ksef.sessionHistory', 'Session History')}
        </h3>
        <SessionsHistory key={refreshKey} />
      </section>
    </div>
  )
}
