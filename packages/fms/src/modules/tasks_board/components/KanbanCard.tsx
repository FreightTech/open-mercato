import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@open-mercato/shared/lib/utils'
import type { RfqBoardCard } from '../lib/types'
import { getTimeAgo } from '../lib/board-config'
import { UserAvatar } from './UserAvatar'

type KanbanCardProps = {
  task: RfqBoardCard
  onClick: (task: RfqBoardCard) => void
  overlay?: boolean
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
        'rounded-md border bg-background p-4 shadow-xs cursor-grab active:cursor-grabbing',
        'hover:shadow-sm transition-shadow select-none',
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-lg rotate-2',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-medium text-sm truncate">{task.title}</div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
          {getTimeAgo(task.updatedAt)}
        </span>
      </div>

      <div className="text-xs text-muted-foreground mb-2 truncate">{task.description}</div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-muted-foreground">{task.referenceNumber}</span>
        <div className="flex items-center gap-1.5">
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
