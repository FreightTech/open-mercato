import React, { useCallback, useRef, useState, useEffect } from 'react'
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

const HOVER_DELAY_MS = 300

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

const offerStatusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
}

function formatItemLabel(item: RfqBoardItem): string {
  const parts: string[] = []
  if (item.containerType) {
    const prefix = item.containerCount && item.containerCount > 1 ? `${item.containerCount}\u00d7` : ''
    parts.push(`${prefix}${item.containerType}`)
  }
  if (item.origin || item.destination) {
    const route = [item.origin, item.destination].filter(Boolean).join(' \u2192 ')
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

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function KanbanCard({ task, onClick, overlay }: KanbanCardProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const [detailHeight, setDetailHeight] = useState(0)

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

  useEffect(() => {
    if (detailRef.current) {
      setDetailHeight(detailRef.current.scrollHeight)
    }
  }, [task])

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setExpanded(true), HOVER_DELAY_MS)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setExpanded(false)
  }, [])

  const handleClick = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setExpanded(false)
    onClick(task)
  }, [onClick, task])

  const itemCount = task.items?.length ?? 0
  const itemLabel = itemCount === 1
    ? `1 ${t('tasks_board.card.item', 'item')}`
    : `${itemCount} ${t('tasks_board.card.items', 'items')}`
  const readiness = getEarliestReadiness(task.items ?? [])
  const subtitle = buildSubtitle(task)
  const showExpanded = expanded && !isDragging && !overlay

  // Determine what extra info the detail section has
  const hasItems = itemCount > 0 && task.items.some((item) => formatItemLabel(item))
  const hasOffers = task.offerCount > 0
  const hasExtraInfo = hasItems || hasOffers || readiness || task.contactPerson

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, zIndex: showExpanded ? 50 : undefined }}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative bg-background cursor-grab active:cursor-grabbing select-none rounded-lg border',
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-lg rotate-2',
        !isDragging && !overlay && 'shadow-xs',
      )}
    >
      {/* Compact card — always visible */}
      <div className="p-3">
        {/* Row 1: Company/title */}
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm truncate leading-tight">
            {task.companyName || task.title}
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

        {/* Row 2: Subtitle — route */}
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {subtitle}
          </div>
        )}

        {/* Row 3: Bottom — items + dot + assignee */}
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

      {/* Detail dropdown — absolutely positioned, animated */}
      {hasExtraInfo && (
        <div
          style={{
            position: 'absolute',
            left: -1,
            right: -1,
            top: 'calc(100% - 8px)',
            paddingTop: 8,
            maxHeight: showExpanded ? detailHeight + 8 : 0,
            opacity: showExpanded ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease',
            background: 'var(--background, #fff)',
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            pointerEvents: showExpanded ? 'auto' : 'none',
          }}
        >
          <div ref={detailRef}>
            {/* Contact + badges + time — only new info not in compact card */}
            <div className="px-3 pt-2 pb-1.5 space-y-1.5">
              {/* Badges: direction, transport, cargo, chip */}
              <div className="flex items-center gap-1 flex-wrap">
                {task.direction && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                    {task.direction}
                  </span>
                )}
                {task.transportMode && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">
                    {task.transportMode}
                  </span>
                )}
                {task.cargoType && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {task.cargoType}
                  </span>
                )}
                {task.chip.variant !== 'high' && (
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                    chipBadgeColors[task.chip.variant],
                  )}>
                    {task.chip.label}
                  </span>
                )}
              </div>

              {/* Contact person */}
              {task.contactPerson && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {task.contactPerson}
                </div>
              )}

              {/* Readiness + created */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {readiness && (
                  <span>
                    {t('tasks_board.card.readiness', 'Ready')}: <span className="font-semibold text-foreground">{readiness}</span>
                  </span>
                )}
                <span>{formatTimeAgo(task.createdAt)}</span>
              </div>
            </div>

            {/* Item breakdown */}
            {hasItems && (
              <>
                <div className="border-t mx-3" />
                <div className="px-3 py-1.5 space-y-0.5">
                  {task.items.slice(0, 4).map((item, index) => {
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
                  {task.items.length > 4 && (
                    <div className="text-[10px] text-muted-foreground/60 px-1.5">
                      +{task.items.length - 4} {t('tasks_board.card.more', 'more')}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Offer info */}
            {hasOffers && (
              <>
                <div className="border-t mx-3" />
                <div className="px-3 py-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <svg className="h-3 w-3 shrink-0 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-muted-foreground">
                      {task.offerCount === 1 ? '1 offer' : `${task.offerCount} offers`}
                    </span>
                    {task.latestOfferNumber && (
                      <>
                        <span className="text-muted-foreground/40">{'\u00b7'}</span>
                        <span className="font-medium text-foreground">{task.latestOfferNumber}</span>
                      </>
                    )}
                    {task.latestOfferStatus && (
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                        offerStatusColors[task.latestOfferStatus] || 'bg-gray-100 text-gray-600',
                      )}>
                        {task.latestOfferStatus}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
