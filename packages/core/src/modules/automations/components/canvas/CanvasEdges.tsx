'use client'

import type { CanvasEdge, CanvasNode } from './types'

const CARD_SIZE = 76
const LINE_GAP = 50
const BTN_SIZE = 24
const NODE_WIDTH = CARD_SIZE + LINE_GAP + BTN_SIZE + 2

interface CanvasEdgesProps {
  edges: CanvasEdge[]
  nodesById: Map<string, CanvasNode>
}

export function CanvasEdges({ edges, nodesById }: CanvasEdgesProps) {
  return (
    <>
      <defs>
        <marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--border))" />
        </marker>
        <marker id="edge-arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
        </marker>
      </defs>
      {edges.map(edge => {
        const sourceNode = nodesById.get(edge.source)
        const targetNode = nodesById.get(edge.target)
        if (!sourceNode || !targetNode) return null

        const executed = edge.data?.executed as boolean | undefined
        const color = executed ? '#22c55e' : 'hsl(var(--border))'
        const marker = executed ? 'url(#edge-arrow-green)' : 'url(#edge-arrow)'

        // Source point: right edge of source card center
        const sx = sourceNode.position.x + CARD_SIZE
        const sy = sourceNode.position.y + CARD_SIZE / 2

        // Target point: left edge of target card center
        const tx = targetNode.position.x
        const ty = targetNode.position.y + CARD_SIZE / 2

        // Bezier control points
        const dx = Math.abs(tx - sx)
        const cp = Math.min(dx * 0.4, 100)

        const path = `M ${sx} ${sy} C ${sx + cp} ${sy}, ${tx - cp} ${ty}, ${tx} ${ty}`

        // Item count label
        const itemCount = edge.data?.itemCount as number | undefined
        const labelX = (sx + tx) / 2
        const labelY = (sy + ty) / 2 - 10

        return (
          <g key={edge.id}>
            <path d={path} stroke={color} strokeWidth={2.5} fill="none" markerEnd={marker} />
            {itemCount != null && (
              <text x={labelX} y={labelY} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))" fontFamily="inherit">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}
