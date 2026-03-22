'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { Button } from '@open-mercato/ui/primitives/button'
import { Radio, ChevronLeft, ChevronRight } from 'lucide-react'

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
}

interface SessionsResponse {
  items: KsefSession[]
  total: number
  page: number
  totalPages: number
}

const statusStyles: Record<string, string> = {
  initializing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closing: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function SessionsSettingsPage() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SessionsResponse | null>(null)
  const [page, setPage] = useState(1)

  const loadSessions = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    const result = await apiCall<SessionsResponse>(`/api/invoicing/ksef/sessions?page=${p}&limit=20`)
    if (result.ok && result.result) {
      setData(result.result)
    } else {
      setError('Failed to load sessions')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSessions(page)
  }, [loadSessions, page])

  return (
    <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">{t('invoicing.sessions.title', 'KSeF Sessions')}</h3>
          <p className="text-sm text-muted-foreground">{t('invoicing.sessions.description', 'View active and past KSeF communication sessions')}</p>
        </div>

        {loading && <LoadingMessage label="Loading sessions..." />}
        {error && <ErrorMessage label={error} />}

        {!loading && !error && data && data.items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Radio className="h-10 w-10 text-muted-foreground/40 mb-3" />
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[session.sessionStatus] ?? ''}`}>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
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
