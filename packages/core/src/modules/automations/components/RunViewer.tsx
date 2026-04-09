'use client'

import { useMemo } from 'react'
import type { CanvasNode, CanvasEdge } from './canvas/types'
import { AutomationCanvas } from './AutomationCanvas'
import type { AutomationDefinitionData } from '../data/entities'
import { definitionToGraph } from '../lib/automation-graph-utils'

interface NodeExecutionInfo {
  nodeId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
  inputData?: Record<string, unknown> | null
  outputData?: Record<string, unknown> | null
  errorData?: Record<string, unknown> | null
  executionTimeMs?: number | null
}

interface RunViewerProps {
  definition: AutomationDefinitionData
  nodeExecutions: NodeExecutionInfo[]
  onNodeClick?: (nodeId: string, execution?: NodeExecutionInfo) => void
  className?: string
}

export function RunViewer({ definition, nodeExecutions, onNodeClick, className }: RunViewerProps) {
  const executionMap = useMemo(
    () => new Map(nodeExecutions.map(ne => [ne.nodeId, ne])),
    [nodeExecutions]
  )

  const { nodes, edges } = useMemo(() => {
    const graph = definitionToGraph(definition)

    const coloredNodes = graph.nodes.map(node => {
      const exec = executionMap.get(node.id)
      return {
        ...node,
        data: {
          ...node.data,
          status: exec?.status,
          executionTimeMs: exec?.executionTimeMs,
        },
      }
    })

    return { nodes: coloredNodes, edges: graph.edges }
  }, [definition, executionMap])

  return (
    <AutomationCanvas
      initialNodes={nodes}
      initialEdges={edges}
      editable={false}
      onNodeClick={(nodeId) => {
        const exec = executionMap.get(nodeId)
        onNodeClick?.(nodeId, exec)
      }}
      className={className}
    />
  )
}
