'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { ActivityEntry, ActivityFilter } from '../types'
import { FILTER_TO_KINDS } from '../types'
import { ActivityItem } from './ActivityItem'
import { CommentComposer } from './CommentComposer'

type ActivityPanelProps = {
  entries: ActivityEntry[]
  isLoading?: boolean
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  onCommentSubmit: (body: string, file?: File | null) => void
  isSubmitting?: boolean
}

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All',
  comments: 'Comments',
  documents: 'Docs',
  changes: 'Changes',
}

const FILTER_KEYS: ActivityFilter[] = ['all', 'comments', 'documents', 'changes']

export function ActivityPanel({
  entries,
  isLoading = false,
  activeFilter,
  onFilterChange,
  onCommentSubmit,
  isSubmitting = false,
}: ActivityPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const filteredEntries = useMemo(() => {
    const kinds = FILTER_TO_KINDS[activeFilter]
    if (!kinds) return entries
    return entries.filter((entry) => kinds.includes(entry.kind))
  }, [entries, activeFilter])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [activeFilter])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold text-muted-foreground mr-2">Activity</span>
        {FILTER_KEYS.map((filter) => (
          <button
            key={filter}
            onClick={() => onFilterChange(filter)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              activeFilter === filter
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            No activity yet
          </div>
        ) : (
          <div className="divide-y">
            {filteredEntries.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      <CommentComposer
        onSubmit={onCommentSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
