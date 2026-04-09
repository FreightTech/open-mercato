'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { CanvasTransform, CanvasNode } from './types'

const MIN_SCALE = 0.2
const MAX_SCALE = 3
const ZOOM_SENSITIVITY = 0.001

export function useCanvasTransform(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const transformRef = useRef(transform)
  transformRef.current = transform

  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: screenX, y: screenY }
    const t = transformRef.current
    return {
      x: (screenX - rect.left - t.x) / t.scale,
      y: (screenY - rect.top - t.y) / t.scale,
    }
  }, [containerRef])

  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: canvasX, y: canvasY }
    const t = transformRef.current
    return {
      x: canvasX * t.scale + t.x + rect.left,
      y: canvasY * t.scale + t.y + rect.top,
    }
  }, [containerRef])

  // Wheel zoom centered on cursor
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const t = transformRef.current
    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * (1 + delta)))
    const ratio = newScale / t.scale

    // Zoom toward cursor position
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    setTransform({
      x: cx - (cx - t.x) * ratio,
      y: cy - (cy - t.y) * ratio,
      scale: newScale,
    })
  }, [containerRef])

  // Pan via middle-click or space+drag (we use any background mousedown)
  const startPan = useCallback((e: React.MouseEvent) => {
    // Only pan from background clicks (not from nodes)
    if (e.target !== e.currentTarget) return
    isPanning.current = true
    panStart.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y }
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return
      setTransform(t => ({
        ...t,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }))
    }
    const onMouseUp = () => { isPanning.current = false }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Attach wheel listener (passive: false required for preventDefault)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [containerRef, handleWheel])

  const fitView = useCallback((nodes: CanvasNode[], padding = 60) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || nodes.length === 0) return

    const minX = Math.min(...nodes.map(n => n.position.x))
    const minY = Math.min(...nodes.map(n => n.position.y))
    const maxX = Math.max(...nodes.map(n => n.position.x + (n.measured?.width ?? 150)))
    const maxY = Math.max(...nodes.map(n => n.position.y + (n.measured?.height ?? 100)))

    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2
    const scale = Math.min(1, rect.width / contentW, rect.height / contentH)

    setTransform({
      scale,
      x: (rect.width - contentW * scale) / 2 - minX * scale + padding * scale,
      y: (rect.height - contentH * scale) / 2 - minY * scale + padding * scale,
    })
  }, [containerRef])

  const zoomIn = useCallback(() => {
    setTransform(t => ({ ...t, scale: Math.min(MAX_SCALE, t.scale * 1.2) }))
  }, [])

  const zoomOut = useCallback(() => {
    setTransform(t => ({ ...t, scale: Math.max(MIN_SCALE, t.scale / 1.2) }))
  }, [])

  const cssTransform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`

  return { transform, cssTransform, screenToCanvas, canvasToScreen, startPan, fitView, zoomIn, zoomOut }
}
