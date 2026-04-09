'use client'

import { memo, useState, useCallback } from 'react'
import { Zap, Play, Webhook, Clock, Power, Trash2, MoreHorizontal, CheckCircle2, Plus } from 'lucide-react'
import { useConnectCtx } from '../AutomationCanvas'

const CARD_SIZE = 76
const TRIGGER_ICONS: Record<string, typeof Zap> = {
  'trigger.event': Zap, 'trigger.manual': Play, 'trigger.webhook': Webhook, 'trigger.schedule': Clock,
}

interface NodeProps { id: string; data: Record<string, unknown>; selected?: boolean }

function TriggerNodeComponent({ data, selected, id }: NodeProps) {
  const [hovered, setHovered] = useState(false)
  const connectCtx = useConnectCtx()
  const isDraggingFromThis = connectCtx?.draggingSourceId === id
  const Icon = TRIGGER_ICONS[data.nodeType as string] ?? Zap
  const status = data.status as string | undefined
  const isCompleted = status === 'COMPLETED'
  const isFailed = status === 'FAILED'
  const isRunning = status === 'RUNNING'
  const executionTimeMs = data.executionTimeMs as number | undefined
  const onAddNode = data.onAddNode as ((sourceNodeId: string) => void) | undefined
  const borderClass = isFailed ? 'border-red-500' : isCompleted ? 'border-green-500' : isRunning ? 'border-blue-500 animate-pulse' : selected ? 'border-primary' : 'border-border'
  const lineColor = isCompleted ? '#22c55e' : 'hsl(var(--border))'

  return (
    <div className="relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>

      {/* Toolbar */}
      <div className={`absolute flex items-center gap-0.5 bg-popover border rounded-lg shadow-lg px-1 py-0.5 z-20 transition-opacity duration-150 ${hovered && !isDraggingFromThis ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ top: -32, left: '50%', transform: 'translateX(-50%)' }}
        onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="p-1 hover:bg-muted rounded" onMouseDown={e => e.stopPropagation()}><Play className="h-3 w-3 text-muted-foreground" /></button>
        <button type="button" className="p-1 hover:bg-muted rounded" onMouseDown={e => e.stopPropagation()}><Power className="h-3 w-3 text-muted-foreground" /></button>
        <button type="button" className="p-1 hover:bg-muted rounded" onMouseDown={e => e.stopPropagation()}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
        <button type="button" className="p-1 hover:bg-muted rounded" onMouseDown={e => e.stopPropagation()}><MoreHorizontal className="h-3 w-3 text-muted-foreground" /></button>
      </div>

      <div className="flex items-center">
        {/* Card */}
        <div className={`flex items-center justify-center rounded-2xl bg-card border-2 shadow-lg ${borderClass} ${data.disabled ? 'opacity-40' : ''}`}
          style={{ width: CARD_SIZE, height: CARD_SIZE }}>
          <Icon className="h-8 w-8 text-green-500" />
          {isCompleted && <CheckCircle2 className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-4 w-4 text-green-500 fill-background" />}
        </div>

        {/* Default: line → + button. Dragging: just line from card edge */}
        {isDraggingFromThis ? (
          <div className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: 'hsl(var(--border))', marginLeft: -5 }} />
        ) : (
          <>
            <div style={{ width: 50, height: 2, background: lineColor, flexShrink: 0 }} />
            <div className="flex items-center justify-center rounded-md border shadow-sm select-none"
              style={{ width: 24, height: 24, background: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))', cursor: 'crosshair' }}
              onMouseDown={e => { e.stopPropagation(); connectCtx?.startConnect(id, e) }}
              onClick={e => { e.stopPropagation(); onAddNode?.(id) }}>
              <Plus className="h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
          </>
        )}
      </div>

      {/* Label */}
      <div className="mt-2 text-center" style={{ maxWidth: CARD_SIZE + 30 }}>
        <div className="text-[11px] font-medium leading-tight truncate">{data.label as string}</div>
        {executionTimeMs != null && <div className="text-[10px] text-muted-foreground">{executionTimeMs}ms</div>}
      </div>
    </div>
  )
}

export const TriggerNode = memo(TriggerNodeComponent)
