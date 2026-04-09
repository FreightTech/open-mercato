'use client'

import { useState, useCallback } from 'react'
import { X, Play } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { DataViewer } from './DataViewer'
import { NodeDetailConfig } from './NodeDetailConfig'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { AutomationNode } from '../data/entities'

interface NodeDetailDialogProps {
  node: AutomationNode
  definitionId: string
  inputData: Record<string, unknown> | null
  onClose: () => void
  onChange: (config: Record<string, unknown>) => void
  onSettingsChange: (updates: Partial<AutomationNode>) => void
}

export function NodeDetailDialog({
  node,
  definitionId,
  inputData,
  onClose,
  onChange,
  onSettingsChange,
}: NodeDetailDialogProps) {
  const [outputData, setOutputData] = useState<Record<string, unknown> | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null)

  const handleExecuteStep = useCallback(async () => {
    setIsExecuting(true)
    setExecuteError(null)
    setOutputData(null)

    try {
      const { ok, result } = await apiCall<{
        output: Record<string, unknown>
        executionTimeMs: number
        error?: string
      }>(`/api/automations/definitions/${definitionId}/test-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          inputData: inputData ?? {},
        }),
      })

      if (!ok || !result) {
        setExecuteError((result as any)?.error ?? 'Execution failed')
        return
      }

      setOutputData(result.output)
      setExecutionTimeMs(result.executionTimeMs)
    } catch (error) {
      setExecuteError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsExecuting(false)
    }
  }, [definitionId, node.id, inputData])

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-4 z-50 flex flex-col rounded-xl border bg-card shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">{node.name}</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{node.type}</span>
            {executionTimeMs !== null && (
              <span className="text-xs text-muted-foreground">{executionTimeMs}ms</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleExecuteStep}
              disabled={isExecuting}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              {isExecuting ? 'Executing...' : 'Execute step'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Three-panel body */}
        <div className="flex flex-1 overflow-hidden">
          {/* INPUT panel */}
          <div className="w-1/4 border-r flex flex-col">
            <DataViewer data={inputData} title="INPUT" />
          </div>

          {/* CONFIG panel */}
          <div className="flex-1 border-r overflow-y-auto">
            <NodeDetailConfig
              node={node}
              onChange={onChange}
              onSettingsChange={onSettingsChange}
            />
          </div>

          {/* OUTPUT panel */}
          <div className="w-1/4 flex flex-col">
            {executeError ? (
              <div className="p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">OUTPUT</div>
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500">
                  {executeError}
                </div>
              </div>
            ) : (
              <DataViewer data={outputData} title="OUTPUT" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
