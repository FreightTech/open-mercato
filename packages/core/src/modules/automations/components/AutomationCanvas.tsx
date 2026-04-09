'use client'

import { useCallback, useRef, useEffect, useState, createContext, useContext } from 'react'
import type { CanvasNode, CanvasEdge, ConnectDragState } from './canvas/types'
import { useCanvasTransform } from './canvas/useCanvasTransform'
import { useNodeDrag } from './canvas/useNodeDrag'
import { useNodeConnect } from './canvas/useNodeConnect'
import { CanvasEdges } from './canvas/CanvasEdges'
import { ConnectionLineOverlay } from './ConnectionLine'
import { TriggerNode } from './nodes/TriggerNode'
import { ActionNode } from './nodes/ActionNode'
import { LogicNode } from './nodes/LogicNode'
import { UtilityNode } from './nodes/UtilityNode'
import { Plus, Minus, Maximize2 } from 'lucide-react'

// ── Context for connect drag (used by node + buttons) ──
interface ConnectCtxValue {
  startConnect: (sourceNodeId: string, e: React.MouseEvent) => void
  draggingSourceId: string | null
}
const ConnectCtx = createContext<ConnectCtxValue | null>(null)
export const useConnectCtx = () => useContext(ConnectCtx)

// ── Props (same interface as before) ──
export interface AutomationCanvasProps {
  initialNodes?: CanvasNode[]
  initialEdges?: CanvasEdge[]
  onNodesChange?: (nodes: CanvasNode[]) => void
  onEdgesChange?: (edges: CanvasEdge[]) => void
  onNodeClick?: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onDrop?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  editable?: boolean
  className?: string
}

// ── Node type map ──
const NODE_COMPONENTS: Record<string, React.ComponentType<any>> = {
  triggerNode: TriggerNode,
  actionNode: ActionNode,
  logicNode: LogicNode,
  utilityNode: UtilityNode,
}

function mapNodeCategory(type: string): string {
  if (type.startsWith('trigger.')) return 'triggerNode'
  if (type.startsWith('action.')) return 'actionNode'
  if (type.startsWith('logic.')) return 'logicNode'
  return 'utilityNode'
}

// ── Canvas ──
export function AutomationCanvas({
  initialNodes = [],
  initialEdges = [],
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onNodeDoubleClick,
  onDrop,
  onDragOver,
  editable = true,
  className,
}: AutomationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes)
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const { cssTransform, screenToCanvas, startPan, fitView, zoomIn, zoomOut } = useCanvasTransform(containerRef)

  // Fit view on initial load
  useEffect(() => {
    if (initialNodes.length > 0) {
      setTimeout(() => fitView(initialNodes), 100)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync initial data
  useEffect(() => { setNodes(initialNodes) }, [initialNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges])

  // Node drag
  const handleNodeMove = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setNodes(prev => {
      const updated = prev.map(n => n.id === nodeId ? { ...n, position } : n)
      onNodesChange?.(updated)
      return updated
    })
  }, [onNodesChange])

  const { startDrag } = useNodeDrag(screenToCanvas, handleNodeMove)

  // Connect
  const handleConnect = useCallback((edge: CanvasEdge) => {
    setEdges(prev => {
      const updated = [...prev, edge]
      onEdgesChange?.(updated)
      return updated
    })
  }, [onEdgesChange])

  const { dragState, startConnect } = useNodeConnect(nodesRef, screenToCanvas, handleConnect)

  // Node interactions
  const handleNodeMouseDown = useCallback((nodeId: string, nodePos: { x: number; y: number }, e: React.MouseEvent) => {
    if (!editable) return
    setSelectedNodeId(nodeId)
    onNodeClick?.(nodeId)
    startDrag(nodeId, nodePos, e)
  }, [editable, onNodeClick, startDrag])

  const handleNodeDblClick = useCallback((nodeId: string) => {
    onNodeDoubleClick?.(nodeId)
  }, [onNodeDoubleClick])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // Keyboard: delete selected node
  useEffect(() => {
    if (!editable) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedNodeId) {
        setNodes(prev => {
          const updated = prev.filter(n => n.id !== selectedNodeId)
          onNodesChange?.(updated)
          return updated
        })
        setEdges(prev => {
          const updated = prev.filter(edge => edge.source !== selectedNodeId && edge.target !== selectedNodeId)
          onEdgesChange?.(updated)
          return updated
        })
        setSelectedNodeId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editable, selectedNodeId, onNodesChange, onEdgesChange])

  // Drag-over for palette drops
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver?.(e)
  }, [onDragOver])

  // Nodes by ID for edge rendering
  const nodesById = new Map(nodes.map(n => [n.id, n]))

  return (
    <ConnectCtx.Provider value={editable ? { startConnect, draggingSourceId: dragState?.sourceNodeId ?? null } : null}>
      <div
        ref={containerRef}
        className={`h-full w-full relative overflow-hidden select-none ${className ?? ''}`}
        style={{ cursor: 'grab' }}
        tabIndex={0}
        onMouseDown={e => { handleBackgroundClick(); startPan(e) }}
        onDrop={onDrop}
        onDragOver={handleDragOver}
      >
        {/* Dot pattern background */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: `${0}px ${0}px`,
        }} />

        {/* Edge SVG layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          <g style={{ transform: cssTransform, transformOrigin: '0 0' }}>
            <CanvasEdges edges={edges} nodesById={nodesById} />
          </g>
        </svg>

        {/* Node HTML layer */}
        <div className="absolute inset-0" style={{ transform: cssTransform, transformOrigin: '0 0' }}>
          {nodes.map(node => {
            const category = mapNodeCategory(node.data.nodeType as string ?? node.type)
            const NodeComponent = NODE_COMPONENTS[category] ?? ActionNode
            return (
              <div
                key={node.id}
                className="absolute"
                style={{ left: node.position.x, top: node.position.y, cursor: editable ? 'grab' : 'default' }}
                onMouseDown={e => {
                  // Don't start drag if clicking toolbar or + button (they have stopPropagation)
                  handleNodeMouseDown(node.id, node.position, e)
                }}
                onDoubleClick={() => handleNodeDblClick(node.id)}
              >
                <NodeComponent
                  id={node.id}
                  data={node.data}
                  selected={selectedNodeId === node.id}
                />
              </div>
            )
          })}
        </div>

        {/* Connection line overlay (screen space) — start from source node's right edge */}
        {dragState && (() => {
          const sourceNode = nodesById.get(dragState.sourceNodeId)
          if (!sourceNode) return null
          const cardRight = canvasToScreen(sourceNode.position.x + 76, sourceNode.position.y + 38)
          return <ConnectionLineOverlay from={cardRight} to={dragState.currentScreen} />
        })()}

        {/* Zoom controls */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 z-10">
          <button type="button" onClick={zoomIn} className="flex items-center justify-center w-8 h-8 bg-card border rounded-md shadow-sm hover:bg-muted">
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={zoomOut} className="flex items-center justify-center w-8 h-8 bg-card border rounded-md shadow-sm hover:bg-muted">
            <Minus className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => fitView(nodes)} className="flex items-center justify-center w-8 h-8 bg-card border rounded-md shadow-sm hover:bg-muted">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </ConnectCtx.Provider>
  )
}
