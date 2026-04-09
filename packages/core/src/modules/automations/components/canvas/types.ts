export interface CanvasNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  selected?: boolean
  measured?: { width: number; height: number }
}

export interface CanvasEdge {
  id: string
  source: string
  sourceHandle?: string
  target: string
  targetHandle?: string
  type?: string
  data?: Record<string, unknown>
}

export interface CanvasTransform {
  x: number
  y: number
  scale: number
}

export interface ConnectDragState {
  sourceNodeId: string
  startScreen: { x: number; y: number }
  currentScreen: { x: number; y: number }
}
