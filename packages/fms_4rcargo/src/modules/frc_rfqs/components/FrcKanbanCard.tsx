import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@open-mercato/shared/lib/utils'
import { Plane } from 'lucide-react'
import type { FrcRfqBoardCard } from '../lib/board-types'
import { getTimeAgo } from '../lib/board-config'
import { FrcUserAvatar } from './FrcUserAvatar'

type FrcKanbanCardProps = {
  task: FrcRfqBoardCard
  onClick: (task: FrcRfqBoardCard) => void
  overlay?: boolean
}

export function FrcKanbanCard({ task, onClick, overlay }: FrcKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const hasRoute = task.originAirportCode || task.destinationAirportCode

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className={cn(
        'rounded-md border bg-background p-3 shadow-xs cursor-grab active:cursor-grabbing',
        'hover:shadow-sm transition-shadow select-none',
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-lg rotate-2',
      )}
    >
      {/* Header: Name + time ago */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-medium text-sm truncate">{task.name}</div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
          {getTimeAgo(task.updatedAt)}
        </span>
      </div>

      {/* Route: Origin -> Destination */}
      {hasRoute && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Plane className="h-3 w-3 shrink-0" />
          <span className="font-mono">
            {task.originAirportCode || '???'}
          </span>
          <span className="text-muted-foreground/50">→</span>
          <span className="font-mono">
            {task.destinationAirportCode || '???'}
          </span>
        </div>
      )}

      {/* Product badge if present */}
      {task.product && (
        <div className="mb-2">
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
            {task.product}
          </span>
        </div>
      )}

      {/* Footer: probability, quote count, assignee */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {task.probability > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {task.probability}%
            </span>
          )}
          {task.offerCount > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {task.offerCount} offer{task.offerCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {task.assignee && (
          <FrcUserAvatar
            name={task.assignee.name}
            initials={task.assignee.initials}
            color={task.assignee.color}
            size="sm"
          />
        )}
      </div>
    </div>
  )
}
