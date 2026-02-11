import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@open-mercato/shared/lib/utils'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Plus } from 'lucide-react'
import type { BoardColumn, FrcRfqBoardCard } from '../lib/board-types'
import { FrcKanbanCard } from './FrcKanbanCard'

type FrcKanbanColumnProps = {
  column: BoardColumn
  tasks: FrcRfqBoardCard[]
  onCardClick: (task: FrcRfqBoardCard) => void
  onAddClick?: () => void
}

export function FrcKanbanColumn({ column, tasks, onCardClick, onAddClick }: FrcKanbanColumnProps) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', column },
  })

  const taskIds = tasks.map((task) => task.id)

  return (
    <div className="flex flex-col w-[280px] min-w-[280px] shrink-0">
      <div className="flex items-center gap-2 px-2 pb-3">
        {column.color && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: column.color }}
          />
        )}
        <h3 className="font-medium text-sm truncate">{column.title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">({tasks.length})</span>
        {onAddClick && (
          <button
            onClick={onAddClick}
            className="ml-auto p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex-1 flex flex-col gap-2 p-2 rounded-lg min-h-[120px]',
            'bg-muted/40 transition-all',
            isOver && 'ring-2 ring-primary/30 bg-muted/60',
          )}
        >
          {tasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed rounded-md p-4">
              <span className="text-xs text-muted-foreground">
                {t('frc_rfqs.board.emptyColumn', 'No RFQs')}
              </span>
            </div>
          ) : (
            tasks.map((task) => (
              <FrcKanbanCard key={task.id} task={task} onClick={onCardClick} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
