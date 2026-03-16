import React, { useCallback, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@open-mercato/shared/lib/utils'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RfqBoardCard, RfqBoardItem } from '../lib/types'
import { UserAvatar } from './UserAvatar'

type KanbanCardProps = {
  task: RfqBoardCard
  onClick: (task: RfqBoardCard) => void
  overlay?: boolean
}

const HOVER_DELAY_MS = 400

const chipDotColors: Record<string, string> = {
  high: 'bg-indigo-500',
  medium: 'bg-amber-500',
  low: 'bg-gray-400',
  'chance-high': 'bg-emerald-500',
  'chance-medium': 'bg-amber-500',
  'chance-low': 'bg-red-500',
}

const chipBadgeColors: Record<string, string> = {
  high: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  'chance-high': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'chance-medium': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'chance-low': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function formatItemLabel(item: RfqBoardItem): string {
  const parts: string[] = []
  if (item.containerType) {
    const prefix = item.containerCount && item.containerCount > 1 ? `${item.containerCount}\u00d7` : ''
    parts.push(`${prefix}${item.containerType}`)
  }
  if (item.origin || item.destination) {
    const route = [item.origin, item.destination].filter(Boolean).join('\u2192')
    parts.push(route)
  }
  return parts.join(' \u00b7 ') || ''
}

function getEarliestReadiness(items: RfqBoardItem[]): string | null {
  for (const item of items) {
    if (item.readinessDate) return item.readinessDate
  }
  return null
}

function buildSubtitle(task: RfqBoardCard): string | null {
  const parts: string[] = []
  if (task.direction) {
    const dir = task.direction.charAt(0).toUpperCase() + task.direction.slice(1)
    if (task.origin || task.destination) {
      const route = [task.origin, task.destination].filter(Boolean).join(' - ')
      parts.push(`${dir}: ${route}`)
    } else {
      parts.push(dir)
    }
  } else if (task.origin || task.destination) {
    parts.push([task.origin, task.destination].filter(Boolean).join(' \u2192 '))
  }
  return parts.length > 0 ? parts.join(' \u00b7 ') : null
}

export function KanbanCard({ task, onClick, overlay }: KanbanCardProps) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(true), HOVER_DELAY_MS)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHovered(false)
  }, [])

  const handleClick = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHovered(false)
    onClick(task)
  }, [onClick, task])

  const itemCount = task.items?.length ?? 0
  const itemLabel = itemCount === 1
    ? `1 ${t('tasks_board.card.item', 'item')}`
    : `${itemCount} ${t('tasks_board.card.items', 'items')}`
  const readiness = getEarliestReadiness(task.items ?? [])
  const subtitle = buildSubtitle(task)
  const showHover = hovered && !isDragging && !overlay && itemCount > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative rounded-lg border bg-background cursor-grab active:cursor-grabbing select-none',
        'transition-all duration-200 ease-out',
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-lg rotate-2',
        !isDragging && !overlay && 'shadow-xs hover:shadow-md hover:-translate-y-0.5',
      )}
    >
      {/* Compact card */}
      <div className="p-3">
        {/* Row 1: Title + badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm truncate leading-tight">
            {task.title}
          </div>
          {task.chip.variant === 'high' && (
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0',
              chipBadgeColors[task.chip.variant],
            )}>
              {task.chip.label}
            </span>
          )}
        </div>

        {/* Row 2: Subtitle — company or route */}
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {subtitle}
          </div>
        )}

        {/* Row 3: Bottom — dot + assignee */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-[11px] text-muted-foreground truncate">
            {itemCount > 0 ? itemLabel : task.description}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={cn('h-2 w-2 rounded-full shrink-0', chipDotColors[task.chip.variant] ?? 'bg-gray-400')} />
            {task.assignee ? (
              <UserAvatar
                name={task.assignee.name}
                initials={task.assignee.initials}
                color={task.assignee.color}
                size="sm"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                <svg className="h-3.5 w-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hover preview overlay */}
      {showHover && (
        <div
          className={cn(
            'absolute left-0 top-0 z-50 min-w-full',
            'rounded-lg border bg-background shadow-xl p-3',
            'animate-in fade-in-0 zoom-in-[0.98] duration-150',
          )}
        >
          {/* Company / title */}
          <div className="font-semibold text-[13px] leading-snug mb-1.5">
            {task.companyName || task.title}
          </div>

          {/* Deadline */}
          {readiness && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
              <svg className="h-3.5 w-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>
                {t('tasks_board.card.deadline', 'Deadline')}:{' '}
                <span className="font-semibold text-foreground">{readiness}</span>
              </span>
            </div>
          )}

          {/* Item count */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
            <svg className="h-3.5 w-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span>{itemLabel}</span>
          </div>

          {/* Item list */}
          {task.items.length > 0 && (
            <div className="border-t pt-1.5 space-y-0.5">
              {task.items.slice(0, 5).map((item, index) => {
                const label = formatItemLabel(item)
                if (!label) return null
                return (
                  <div
                    key={index}
                    className="text-[11px] text-muted-foreground truncate rounded px-1.5 py-0.5 bg-muted/50"
                  >
                    {label}
                  </div>
                )
              })}
              {task.items.length > 5 && (
                <div className="text-[11px] text-muted-foreground/60 px-1.5">
                  +{task.items.length - 5} {t('tasks_board.card.more', 'more')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
