'use client'

import { useCallback, useRef, useEffect } from 'react'
import type { CanvasNode } from './types'

const SNAP = 16

interface NodeDragState {
  nodeId: string
  offsetX: number
  offsetY: number
}

export function useNodeDrag(
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number },
  onNodeMove: (nodeId: string, position: { x: number; y: number }) => void,
) {
  const drag = useRef<NodeDragState | null>(null)

  const startDrag = useCallback((nodeId: string, nodePos: { x: number; y: number }, e: React.MouseEvent) => {
    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    drag.current = {
      nodeId,
      offsetX: canvasPos.x - nodePos.x,
      offsetY: canvasPos.y - nodePos.y,
    }
  }, [screenToCanvas])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current) return
      const canvasPos = screenToCanvas(e.clientX, e.clientY)
      const x = Math.round((canvasPos.x - drag.current.offsetX) / SNAP) * SNAP
      const y = Math.round((canvasPos.y - drag.current.offsetY) / SNAP) * SNAP
      onNodeMove(drag.current.nodeId, { x, y })
    }

    const onMouseUp = () => {
      drag.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [screenToCanvas, onNodeMove])

  return { startDrag, isDragging: () => drag.current !== null }
}
