'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DataViewer } from '../../../../../components/DataViewer'

interface NodeExecutionItem {
  id: string
  nodeId: string
  nodeType: string
  status: string
  inputData?: Record<string, unknown> | null
  outputData?: Record<string, unknown> | null
  errorData?: Record<string, unknown> | null
  executionTimeMs?: number | null
  startedAt?: string | null
  completedAt?: string | null
}

interface RunDetail {
  id: string
  automationId: string
  status: string
  triggerData?: Record<string, unknown> | null
  context?: Record<string, unknown> | null
  errorMessage?: string | null
  errorNodeId?: string | null
  executionTimeMs?: number | null
  startedAt?: string | null
  completedAt?: string | null
  nodeExecutions: NodeExecutionItem[]
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-green-600',
  FAILED: 'text-red-600',
  RUNNING: 'text-blue-600',
  SKIPPED: 'text-gray-400',
  PENDING: 'text-gray-300',
}

export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  // slug = ['automations', definitionId, 'runs', runId]
  const slug = params?.slug as string[] | undefined
  const definitionId = (slug ? slug[1] : params?.id) as string
  const runId = (slug ? slug[3] : params?.runId) as string

  const [run, setRun] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedExecution, setSelectedExecution] = useState<NodeExecutionItem | null>(null)

  useEffect(() => {
    apiCall<RunDetail>(`/api/automations/runs/${runId}`).then(({ ok, result }) => {
      if (ok && result) setRun(result)
      setLoading(false)
    })
  }, [runId])

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!run) return <div className="p-6 text-red-500">Run not found</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => router.push(`/backend/automations/${definitionId}/runs`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Run Detail</h1>
          <span className="text-xs text-muted-foreground">
            {run.status} {run.executionTimeMs != null ? `(${run.executionTimeMs}ms)` : ''}
          </span>
        </div>
      </div>

      {run.errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          {run.errorMessage} {run.errorNodeId ? `(at node: ${run.errorNodeId})` : ''}
        </div>
      )}

      <div className="flex gap-4">
        {/* Node execution list */}
        <div className="flex-1 rounded-lg border">
          <div className="border-b px-4 py-2 bg-muted/50">
            <h2 className="text-sm font-medium">Node Executions ({run.nodeExecutions.length})</h2>
          </div>
          <div className="divide-y">
            {run.nodeExecutions.map(exec => (
              <button
                key={exec.id}
                onClick={() => setSelectedExecution(exec)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${
                  selectedExecution?.id === exec.id ? 'bg-muted/50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{exec.nodeId}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{exec.nodeType}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {exec.executionTimeMs != null && (
                      <span className="text-xs text-muted-foreground">{exec.executionTimeMs}ms</span>
                    )}
                    <span className={`text-xs font-medium ${STATUS_COLORS[exec.status] ?? ''}`}>
                      {exec.status}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected node detail */}
        {selectedExecution && (
          <div className="w-[400px] rounded-lg border">
            <div className="border-b px-4 py-2 bg-muted/50">
              <h2 className="text-sm font-medium">{selectedExecution.nodeId}</h2>
              <span className="text-xs text-muted-foreground">{selectedExecution.nodeType}</span>
            </div>
            <div className="divide-y">
              <div className="h-[200px]">
                <DataViewer data={selectedExecution.inputData} title="Input" />
              </div>
              {selectedExecution.outputData && (
                <div className="h-[200px]">
                  <DataViewer data={selectedExecution.outputData} title="Output" />
                </div>
              )}
              {selectedExecution.errorData && (
                <div className="h-[200px]">
                  <DataViewer data={selectedExecution.errorData} title="Error" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
