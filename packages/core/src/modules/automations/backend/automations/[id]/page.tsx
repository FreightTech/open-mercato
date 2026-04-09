'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Save, ArrowLeft, Plus, PlayCircle, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AutomationCanvas } from '../../../components/AutomationCanvas'
import { NodePalette } from '../../../components/NodePalette'
import { NodeDetailDialog } from '../../../components/NodeDetailDialog'
import { definitionToGraph, graphToDefinition } from '../../../lib/automation-graph-utils'
import type { AutomationNode, AutomationDefinitionData, AutomationRunStatus } from '../../../data/entities'
import type { CanvasNode, CanvasEdge } from '../../../components/canvas/types'

// ============================================================================
// Types
// ============================================================================

interface AutomationDetail {
  id: string
  automationId: string
  name: string
  definition: AutomationDefinitionData
  enabled: boolean
  version: number
}

interface RunItem {
  id: string
  status: AutomationRunStatus
  executionTimeMs?: number | null
  errorMessage?: string | null
  errorNodeId?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
}

interface NodeExecutionItem {
  nodeId: string
  nodeType: string
  status: string
  inputData?: Record<string, unknown> | null
  outputData?: Record<string, unknown> | null
  errorData?: Record<string, unknown> | null
  executionTimeMs?: number | null
}

type ActiveTab = 'editor' | 'executions'

// ============================================================================
// Main Page
// ============================================================================

export default function AutomationEditorPage() {
  const params = useParams()
  const router = useRouter()

  let definitionId: string | undefined
  if (params?.slug && Array.isArray(params.slug)) {
    definitionId = params.slug[1]
  } else if (params?.id) {
    definitionId = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  }

  const [activeTab, setActiveTab] = useState<ActiveTab>('editor')
  const [automation, setAutomation] = useState<AutomationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [selectedNode, setSelectedNode] = useState<AutomationNode | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [addNodeSourceId, setAddNodeSourceId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])

  // Executions tab state
  const [runs, setRuns] = useState<RunItem[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRunExecs, setSelectedRunExecs] = useState<NodeExecutionItem[]>([])

  const nodesRef = useRef<CanvasNode[]>([])
  const edgesRef = useRef<CanvasEdge[]>([])

  const handleNodeAddClick = useCallback((sourceNodeId: string) => {
    setAddNodeSourceId(sourceNodeId)
    setPaletteOpen(true)
  }, [])

  const injectCallbacks = useCallback((graphNodes: CanvasNode[]) => {
    return graphNodes.map(n => ({
      ...n,
      data: { ...n.data, onAddNode: handleNodeAddClick },
    }))
  }, [handleNodeAddClick])

  useEffect(() => {
    apiCall<AutomationDetail>(`/api/automations/definitions/${definitionId}`).then(({ ok, result }) => {
      if (ok && result) {
        setAutomation(result)
        const graph = definitionToGraph(result.definition)
        const withCallbacks = injectCallbacks(graph.nodes)
        setNodes(withCallbacks)
        setEdges(graph.edges)
        nodesRef.current = withCallbacks
        edgesRef.current = graph.edges
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [definitionId, injectCallbacks])

  // Load runs when switching to executions tab
  useEffect(() => {
    if (activeTab !== 'executions' || !definitionId) return
    setRunsLoading(true)
    apiCall<{ items: RunItem[] }>(`/api/automations/definitions/${definitionId}/runs?pageSize=50&sortDir=desc`).then(({ ok, result }) => {
      if (ok && result) setRuns(result.items)
      setRunsLoading(false)
    })
  }, [activeTab, definitionId])

  // Load node executions when a run is selected
  useEffect(() => {
    if (!selectedRunId) { setSelectedRunExecs([]); return }
    apiCall<{ nodeExecutions?: NodeExecutionItem[] }>(`/api/automations/runs/${selectedRunId}`).then(({ ok, result }) => {
      if (ok && result?.nodeExecutions) setSelectedRunExecs(result.nodeExecutions)
    })
  }, [selectedRunId])

  // Build execution-preview graph nodes
  const executionPreviewNodes = useMemo(() => {
    if (!automation || selectedRunExecs.length === 0) return null
    const graph = definitionToGraph(automation.definition)
    const execMap = new Map(selectedRunExecs.map(e => [e.nodeId, e]))
    return graph.nodes.map(n => {
      const exec = execMap.get(n.id)
      return {
        ...n,
        data: {
          ...n.data,
          status: exec?.status,
          executionTimeMs: exec?.executionTimeMs,
        },
      }
    })
  }, [automation, selectedRunExecs])

  const handleSave = useCallback(async () => {
    if (!automation) return
    setSaving(true)
    const existingNodes = new Map(automation.definition.nodes.map(n => [n.id, n]))
    const newDefinition = graphToDefinition(nodesRef.current, edgesRef.current, existingNodes)
    const { ok, result } = await apiCall<AutomationDetail>(`/api/automations/definitions/${definitionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: automation.name, definition: newDefinition }),
    })
    if (ok && result) setAutomation(result)
    setSaving(false)
  }, [automation, definitionId])

  const handleExecute = useCallback(async () => {
    if (!automation) return
    setExecuting(true)
    await apiCall(`/api/automations/definitions/${definitionId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setExecuting(false)
  }, [automation, definitionId])

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (!automation) return
    const automationNode = automation.definition.nodes.find(n => n.id === nodeId)
    if (automationNode) setSelectedNode(automationNode)
  }, [automation])

  const handleAddNode = useCallback((nodeType: { type: string; name: string; icon: string; color: string }) => {
    if (!automation) return
    const sourceNode = addNodeSourceId ? nodesRef.current.find(n => n.id === addNodeSourceId) : null
    const position = sourceNode
      ? { x: sourceNode.position.x + 200, y: sourceNode.position.y }
      : {
          x: nodesRef.current.reduce((max, n) => Math.max(max, n.position.x), 0) + 200,
          y: nodesRef.current.length > 0
            ? nodesRef.current.reduce((sum, n) => sum + n.position.y, 0) / nodesRef.current.length
            : 200,
        }

    const newNodeId = `${nodeType.type.replace('.', '_')}_${Date.now()}`
    const category = nodeType.type.startsWith('trigger.') ? 'triggerNode'
      : nodeType.type.startsWith('action.') ? 'actionNode'
      : nodeType.type.startsWith('logic.') ? 'logicNode'
      : 'utilityNode'

    const newNode: CanvasNode = {
      id: newNodeId, type: category, position,
      data: { label: nodeType.name, nodeType: nodeType.type, config: {}, icon: nodeType.icon, color: nodeType.color, onAddNode: handleNodeAddClick },
    }

    setNodes(prev => { const updated = [...prev, newNode]; nodesRef.current = updated; return updated })

    if (addNodeSourceId) {
      const newEdge: CanvasEdge = {
        id: `e_${addNodeSourceId}_${newNodeId}`, source: addNodeSourceId, sourceHandle: 'main',
        target: newNodeId, targetHandle: 'main', type: 'automationEdge', data: { sourceOutput: 'main' },
      }
      setEdges(prev => { const updated = [...prev, newEdge]; edgesRef.current = updated; return updated })
      automation.definition.connections.push({ id: newEdge.id, sourceNodeId: addNodeSourceId, sourceOutput: 'main', targetNodeId: newNodeId, targetInput: 'main' })
    }

    automation.definition.nodes.push({ id: newNodeId, type: nodeType.type, name: nodeType.name, position, config: {} })
    setPaletteOpen(false)
    setAddNodeSourceId(null)
  }, [automation, addNodeSourceId, handleNodeAddClick])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const nodeTypeData = event.dataTransfer.getData('application/automation-node-type')
    if (!nodeTypeData) return
    const nodeType = JSON.parse(nodeTypeData)
    const reactFlowBounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
    if (!reactFlowBounds) return
    const position = { x: event.clientX - reactFlowBounds.left, y: event.clientY - reactFlowBounds.top }
    const newNodeId = `${nodeType.type.replace('.', '_')}_${Date.now()}`
    const category = nodeType.type.startsWith('trigger.') ? 'triggerNode' : nodeType.type.startsWith('action.') ? 'actionNode' : nodeType.type.startsWith('logic.') ? 'logicNode' : 'utilityNode'
    const newNode: CanvasNode = { id: newNodeId, type: category, position, data: { label: nodeType.name, nodeType: nodeType.type, config: {}, icon: nodeType.icon, color: nodeType.color } }
    setNodes(prev => { const updated = [...prev, newNode]; nodesRef.current = updated; return updated })
    if (automation) { automation.definition.nodes.push({ id: newNodeId, type: nodeType.type, name: nodeType.name, position, config: {} }) }
  }, [automation])

  const handleConfigChange = useCallback((config: Record<string, unknown>) => {
    if (!selectedNode || !automation) return
    const node = automation.definition.nodes.find(n => n.id === selectedNode.id)
    if (node) { node.config = config; setSelectedNode({ ...selectedNode, config }) }
  }, [selectedNode, automation])

  const handleSettingsChange = useCallback((updates: Partial<AutomationNode>) => {
    if (!selectedNode || !automation) return
    const node = automation.definition.nodes.find(n => n.id === selectedNode.id)
    if (node) { Object.assign(node, updates); setSelectedNode({ ...selectedNode, ...updates }) }
  }, [selectedNode, automation])

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>
  if (!automation) return <div className="flex items-center justify-center h-screen text-red-500">Automation not found</div>

  const selectedNodeInputData = selectedNode ? resolveNodeInputPreview(automation.definition, selectedNode.id) : null

  return (
    <div className="-m-4 lg:-m-6 -mb-4 lg:-mb-6 relative" style={{ width: 'calc(100% + 2rem)', height: 'calc(100vh - 120px)' }}>

      {/* ── Floating toolbar — top left ── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => router.push('/backend/automations')} className="shadow-md">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm border rounded-lg shadow-md px-3 py-1.5">
          <input
            value={automation.name}
            onChange={e => setAutomation({ ...automation, name: e.target.value })}
            className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-primary/30 rounded px-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{automation.automationId} v{automation.version}</span>
        </div>
      </div>

      {/* ── Tab bar — top center (n8n-style) ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center bg-card/90 backdrop-blur-sm border rounded-lg shadow-md overflow-hidden">
          {(['editor', 'executions'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Floating actions — top right ── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {activeTab === 'editor' && (
          <>
            <Button size="sm" variant="secondary" onClick={() => { setAddNodeSourceId(null); setPaletteOpen(true) }} className="gap-1.5 shadow-md">
              <Plus className="h-3.5 w-3.5" />
              Add node
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 shadow-md">
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* EDITOR TAB                                           */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 'editor' && (
        <>
          <AutomationCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onNodesChange={updated => { nodesRef.current = updated }}
            onEdgesChange={updated => { edgesRef.current = updated }}
            onNodeDoubleClick={handleNodeDoubleClick}
            onDrop={handleDrop}
            editable
          />

          {/* Execute workflow button — bottom center */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
            <Button
              size="lg"
              onClick={handleExecute}
              disabled={executing}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white shadow-xl rounded-lg px-6"
            >
              <PlayCircle className="h-4 w-4" />
              {executing ? 'Executing...' : 'Execute workflow'}
            </Button>
          </div>

          <NodePalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelectNodeType={handleAddNode} />
        </>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* EXECUTIONS TAB                                       */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 'executions' && (
        <div className="flex h-full pt-12">
          {/* Left: execution list */}
          <div className="w-[280px] border-r bg-card/60 backdrop-blur-sm flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Executions</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {runsLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!runsLoading && runs.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">No executions yet</div>
              )}
              {runs.map(run => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full text-left px-3 py-2.5 border-b transition-colors hover:bg-muted/50 ${
                    selectedRunId === run.id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RunStatusIcon status={run.status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">
                        {run.startedAt ? formatDateTime(run.startedAt) : formatDateTime(run.createdAt)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {run.status === 'COMPLETED' && run.executionTimeMs != null
                          ? `Succeeded in ${formatDuration(run.executionTimeMs)}`
                          : run.status === 'FAILED'
                          ? `Failed${run.executionTimeMs != null ? ` in ${formatDuration(run.executionTimeMs)}` : ''}`
                          : run.status === 'RUNNING'
                          ? 'Running...'
                          : run.status}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: execution preview canvas */}
          <div className="flex-1 relative">
            {selectedRunId && executionPreviewNodes ? (
              <AutomationCanvas
                key={selectedRunId}
                initialNodes={executionPreviewNodes}
                initialEdges={definitionToGraph(automation.definition).edges}
                editable={false}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                {runs.length > 0 ? 'Select an execution to preview' : 'No executions yet. Run the workflow first.'}
              </div>
            )}

            {/* Selected run info bar */}
            {selectedRunId && (
              <div className="absolute top-3 right-3 z-10">
                <Button
                  size="sm"
                  variant="secondary"
                  className="shadow-md gap-1.5"
                  onClick={() => { setActiveTab('editor') }}
                >
                  Copy to editor
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node detail dialog */}
      {selectedNode && activeTab === 'editor' && (
        <NodeDetailDialog
          node={selectedNode}
          definitionId={definitionId!}
          inputData={selectedNodeInputData}
          onClose={() => setSelectedNode(null)}
          onChange={handleConfigChange}
          onSettingsChange={handleSettingsChange}
        />
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function resolveNodeInputPreview(definition: AutomationDefinitionData, nodeId: string): Record<string, unknown> | null {
  const incoming = definition.connections.filter(c => c.targetNodeId === nodeId)
  if (incoming.length === 0) return null
  const sourceNode = definition.nodes.find(n => n.id === incoming[0].sourceNodeId)
  if (!sourceNode) return null
  return { _from: sourceNode.name, _nodeType: sourceNode.type, _note: 'Run "Execute step" on the source node to see actual output data' }
}

function RunStatusIcon({ status }: { status: AutomationRunStatus }) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
    case 'FAILED':
      return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
    case 'RUNNING':
      return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
    case 'CANCELLED':
      return <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  }
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = (ms / 1000).toFixed(1)
  return `${seconds}s`
}
