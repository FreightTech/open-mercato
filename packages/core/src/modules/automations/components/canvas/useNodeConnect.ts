'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { CanvasNode, CanvasEdge, ConnectDragState } from './types'

const CARD_SIZE = 76

export function useNodeConnect(
  nodesRef: React.RefObject<CanvasNode[]>,
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number },
  onConnect: (edge: CanvasEdge) => void,
) {
  const [dragState, setDragState] = useState<ConnectDragState | null>(null)
  const dragRef = useRef<ConnectDragState | null>(null)

  const startConnect = useCallback((sourceNodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    // Start from center of the + button itself (it will disappear, line starts from its position)
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const startX = rect.left + rect.width / 2
    const startY = rect.top + rect.height / 2

    const state: ConnectDragState = {
      sourceNodeId,
      startScreen: { x: startX, y: startY },
      currentScreen: { x: e.clientX, y: e.clientY },
    }
    dragRef.current = state
    setDragState(state)
  }, [])

  useEffect(() => {
    if (!dragState) return

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const updated = { ...dragRef.current, currentScreen: { x: e.clientX, y: e.clientY } }
      dragRef.current = updated
      setDragState(updated)
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!dragRef.current) return
      const source = dragRef.current.sourceNodeId
      const canvasPos = screenToCanvas(e.clientX, e.clientY)
      const nodes = nodesRef.current ?? []

      // Find target node under cursor (generous hit area: full card)
      const targetNode = nodes.find(n => {
        if (n.id === source) return false
        return (
          canvasPos.x >= n.position.x - 10 &&
          canvasPos.x <= n.position.x + CARD_SIZE + 10 &&
          canvasPos.y >= n.position.y - 10 &&
          canvasPos.y <= n.position.y + CARD_SIZE + 10
        )
      })

      if (targetNode) {
        onConnect({
          id: `e_${source}_${targetNode.id}_${Date.now()}`,
          source,
          sourceHandle: 'main',
          target: targetNode.id,
          targetHandle: 'main',
          type: 'automationEdge',
          data: { sourceOutput: 'main' },
        })
      }

      dragRef.current = null
      setDragState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragState, screenToCanvas, nodesRef, onConnect])

  return { dragState, startConnect }
}
