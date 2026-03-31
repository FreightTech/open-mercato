"use client"

import * as React from 'react'
import Link from 'next/link'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'

interface IntegrationState {
  isEnabled: boolean
  lastHealthStatus: string | null
  lastHealthCheckedAt: string | null
}

interface KsefSession {
  id: string
  sessionStatus: string
  nip: string
  ksefReferenceNumber: string | null
  invoiceCount: number
  startedAt: string | null
  closedAt: string | null
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  initializing: 'bg-blue-100 text-blue-800',
  closing: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800',
}

export default function KsefDashboardPage() {
  const [sessions, setSessions] = React.useState<KsefSession[]>([])
  const [integration, setIntegration] = React.useState<{ state: IntegrationState; hasCredentials: boolean } | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      const [sessionsResult, integrationResult] = await Promise.all([
        apiCall<{ items: KsefSession[] }>('/api/ksef/sessions?limit=10'),
        apiCall<{ state: IntegrationState; hasCredentials: boolean }>('/api/integrations/ksef'),
      ])
      if (sessionsResult.ok) {
        setSessions(sessionsResult.data.items)
      }
      if (integrationResult.ok) {
        setIntegration(integrationResult.data)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <LoadingMessage />
  }

  const isEnabled = integration?.state?.isEnabled ?? false
  const hasCreds = integration?.hasCredentials ?? false
  const healthStatus = integration?.state?.lastHealthStatus
  const healthCheckedAt = integration?.state?.lastHealthCheckedAt

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">KSeF Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Polish National e-Invoice System — session overview and submission status
          </p>
        </div>
        <Link
          href="/backend/integrations/ksef"
          className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Configure Integration
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${isEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm font-medium">{isEnabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Credentials</div>
          <div className="mt-1 text-sm font-medium">
            {hasCreds ? (
              <span className="text-green-700">Configured</span>
            ) : (
              <Link href="/backend/integrations/ksef" className="text-blue-600 hover:underline">
                Set up credentials
              </Link>
            )}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Health</div>
          <div className="mt-1 text-sm font-medium">
            {healthStatus === 'healthy' ? (
              <span className="text-green-700">Healthy</span>
            ) : healthStatus === 'unhealthy' ? (
              <span className="text-red-600">Unhealthy</span>
            ) : (
              <span className="text-muted-foreground">Not checked</span>
            )}
            {healthCheckedAt && (
              <span className="text-xs text-muted-foreground ml-2">
                {new Date(healthCheckedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-medium">Recent Sessions</h2>
        </div>
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No KSeF sessions found. Sessions are created when invoices are submitted to KSeF.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">NIP</th>
                <th className="px-4 py-2 text-left font-medium">Reference</th>
                <th className="px-4 py-2 text-right font-medium">Invoices</th>
                <th className="px-4 py-2 text-left font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyles[session.sessionStatus] ?? 'bg-gray-100 text-gray-800'}`}>
                      {session.sessionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{session.nip}</td>
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]">
                    {session.ksefReferenceNumber ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-right">{session.invoiceCount}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {session.startedAt ? new Date(session.startedAt).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
