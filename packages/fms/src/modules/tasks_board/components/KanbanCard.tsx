import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@open-mercato/shared/lib/utils'
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { RfqBoardCard, ChipVariant } from '../lib/types'
import { getTimeAgo } from '../lib/board-config'
import { UserAvatar } from './UserAvatar'

type KanbanCardProps = {
  task: RfqBoardCard
  onClick: (task: RfqBoardCard) => void
  overlay?: boolean
}

const chipStyles: Record<ChipVariant, string> = {
  high: 'bg-red-500 text-white border-red-500',
  medium: 'bg-amber-500 text-white border-amber-500',
  low: 'bg-emerald-500 text-white border-emerald-500',
  'chance-high': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'chance-medium': 'bg-amber-100 text-amber-700 border-amber-200',
  'chance-low': 'bg-red-100 text-red-700 border-red-200',
}

export function KanbanCard({ task, onClick, overlay }: KanbanCardProps) {
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
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <Badge className={cn('text-[10px] px-1.5 py-0', chipStyles[task.chip.variant])}>
          {task.chip.label}
        </Badge>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {getTimeAgo(task.updatedAt)}
        </span>
      </div>

      <div className="font-medium text-sm mb-0.5 truncate">{task.title}</div>

      <div className="text-xs text-muted-foreground mb-2 truncate">{task.description}</div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-muted-foreground">{task.referenceNumber}</span>
        <div className="flex items-center gap-1.5">
          {task.offerCount > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {task.offerCount} offer{task.offerCount > 1 ? 's' : ''}
            </span>
          )}
          {task.assignee && (
            <UserAvatar
              name={task.assignee.name}
              initials={task.assignee.initials}
              color={task.assignee.color}
              size="sm"
            />
          )}
        </div>
      </div>
    </div>
  )
}
