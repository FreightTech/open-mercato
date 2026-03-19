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
import type { RfqBoardCard, BoardColumn } from '../lib/types'
import type { FmsRfqStatus } from '../../fms_offers/data/types'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'

type KanbanBoardProps = {
  columns: BoardColumn[]
  tasks: RfqBoardCard[]
  onTasksChange: (tasks: RfqBoardCard[]) => void
  onCardClick: (task: RfqBoardCard) => void
  onStatusChange?: (taskId: string, newStatus: FmsRfqStatus) => void
}

export function KanbanBoard({ columns, tasks, onTasksChange, onCardClick, onStatusChange }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<RfqBoardCard | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, RfqBoardCard[]> = {}
    for (const column of columns) {
      grouped[column.id] = []
    }
    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    }
    return grouped
  }, [columns, tasks])

  const findColumnForTask = useCallback(
    (taskId: string): string | null => {
      const task = tasks.find((item) => item.id === taskId)
      return task?.status ?? null
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
          task.id === activeId ? { ...task, status: overColumn as FmsRfqStatus } : task,
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
        const newStatus = overId as FmsRfqStatus
        onTasksChange(
          tasks.map((task) =>
            task.id === activeId ? { ...task, status: newStatus } : task,
          ),
        )
        onStatusChange?.(activeId, newStatus)
        return
      }

      const overColumn = findColumnForTask(overId)
      if (!activeColumn || !overColumn) return

      if (activeColumn !== overColumn) {
        onStatusChange?.(activeId, overColumn as FmsRfqStatus)
      }

      if (activeColumn === overColumn) {
        const columnTasks = tasksByColumn[activeColumn]
        const oldIndex = columnTasks.findIndex((task) => task.id === activeId)
        const newIndex = columnTasks.findIndex((task) => task.id === overId)

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(columnTasks, oldIndex, newIndex)
          const otherTasks = tasks.filter((task) => task.status !== activeColumn)
          onTasksChange([...otherTasks, ...reordered])
        }
      } else {
        onStatusChange?.(activeId, overColumn as FmsRfqStatus)
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
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn[column.id] ?? []}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-[256px]">
            <KanbanCard task={activeTask} onClick={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
