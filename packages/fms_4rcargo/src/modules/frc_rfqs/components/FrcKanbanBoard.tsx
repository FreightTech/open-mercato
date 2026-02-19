import React, { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { FrcRfqBoardCard, BoardColumn } from '../lib/board-types'
import type { FrcSalesStage } from '../../../lib/types'
import { FrcKanbanColumn } from './FrcKanbanColumn'
import { FrcKanbanCard } from './FrcKanbanCard'

type FrcKanbanBoardProps = {
  columns: BoardColumn[]
  tasks: FrcRfqBoardCard[]
  onTasksChange: (tasks: FrcRfqBoardCard[]) => void
  onCardClick: (task: FrcRfqBoardCard) => void
  onStatusChange?: (taskId: string, newStatus: FrcSalesStage) => void
  onAddClick?: () => void
}

export function FrcKanbanBoard({
  columns,
  tasks,
  onTasksChange,
  onCardClick,
  onStatusChange,
  onAddClick,
}: FrcKanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<FrcRfqBoardCard | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, FrcRfqBoardCard[]> = {}
    for (const column of columns) {
      grouped[column.id] = []
    }
    for (const task of tasks) {
      if (grouped[task.salesStage]) {
        grouped[task.salesStage].push(task)
      }
    }
    return grouped
  }, [columns, tasks])

  const findColumnForTask = useCallback(
    (taskId: string): string | null => {
      const task = tasks.find((item) => item.id === taskId)
      return task?.salesStage ?? null
    },
    [tasks],
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((item) => item.id === event.active.id)
      if (task) setActiveTask(task)
    },
    [tasks],
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)

      const activeColumn = findColumnForTask(activeId)
      const overColumn = columns.find((col) => col.id === overId)
        ? overId
        : findColumnForTask(overId)

      if (!activeColumn || !overColumn || activeColumn === overColumn) return

      onTasksChange(
        tasks.map((task) =>
          task.id === activeId ? { ...task, salesStage: overColumn as FrcSalesStage } : task,
        ),
      )
    },
    [tasks, columns, findColumnForTask, onTasksChange],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null)

      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)

      if (activeId === overId) return

      const activeColumn = findColumnForTask(activeId)
      const overIsColumn = columns.some((col) => col.id === overId)

      if (overIsColumn) {
        const newStatus = overId as FrcSalesStage
        onTasksChange(
          tasks.map((task) =>
            task.id === activeId ? { ...task, salesStage: newStatus } : task,
          ),
        )
        onStatusChange?.(activeId, newStatus)
        return
      }

      const overColumn = findColumnForTask(overId)
      if (!activeColumn || !overColumn) return

      if (activeColumn !== overColumn) {
        onStatusChange?.(activeId, overColumn as FrcSalesStage)
      }

      if (activeColumn === overColumn) {
        const columnTasks = tasksByColumn[activeColumn]
        const oldIndex = columnTasks.findIndex((task) => task.id === activeId)
        const newIndex = columnTasks.findIndex((task) => task.id === overId)

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(columnTasks, oldIndex, newIndex)
          const otherTasks = tasks.filter((task) => task.salesStage !== activeColumn)
          onTasksChange([...otherTasks, ...reordered])
        }
      } else {
        onStatusChange?.(activeId, overColumn as FrcSalesStage)
      }
    },
    [tasks, columns, tasksByColumn, findColumnForTask, onTasksChange, onStatusChange],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 px-4 h-full">
        {columns.map((column) => (
          <FrcKanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn[column.id] ?? []}
            onCardClick={onCardClick}
            onAddClick={onAddClick}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-[256px]">
            <FrcKanbanCard task={activeTask} onClick={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
