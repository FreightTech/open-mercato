'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Eye } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

interface RunItem {
  id: string
  automationId: string
  status: string
  executionTimeMs?: number | null
  errorMessage?: string | null
  errorNodeId?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'bg-blue-500/10 text-blue-600',
  COMPLETED: 'bg-green-500/10 text-green-600',
  FAILED: 'bg-red-500/10 text-red-600',
  CANCELLED: 'bg-gray-500/10 text-gray-500',
}

export default function AutomationRunsPage() {
  const params = useParams()
  const router = useRouter()
  const definitionId = (params?.slug && Array.isArray(params.slug) ? params.slug[1] : params?.id) as string
  const [runs, setRuns] = useState<RunItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiCall<{ items: RunItem[] }>(`/api/automations/runs?definitionId=${definitionId}&pageSize=50`).then(({ ok, result }) => {
      if (ok && result) setRuns(result.items)
      setLoading(false)
    })
  }, [definitionId])

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => router.push(`/backend/automations/${definitionId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Run History</h1>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Started</th>
              <th className="px-4 py-3 text-left font-medium">Duration</th>
              <th className="px-4 py-3 text-left font-medium">Error</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[run.status] ?? ''}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {run.executionTimeMs != null ? `${run.executionTimeMs}ms` : '-'}
                </td>
                <td className="px-4 py-3 text-xs text-red-500 max-w-[300px] truncate">
                  {run.errorMessage ?? '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(`/backend/automations/${definitionId}/runs/${run.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No runs yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
