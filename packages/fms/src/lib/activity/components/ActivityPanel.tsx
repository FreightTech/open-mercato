'use client'

import { useRef, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { ActivityEntry, ActivityFilter } from '../types'
import { ActivityItem } from './ActivityItem'
import { CommentComposer } from './CommentComposer'

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All',
  comments: 'Comments',
  documents: 'Notes',
  changes: 'Changes',
}

const FILTER_OPTIONS: ActivityFilter[] = ['all', 'comments', 'documents', 'changes']

type ActivityPanelProps = {
  entries: ActivityEntry[]
  isLoading: boolean
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  onPostComment: (body: string, file?: File, mentionedUserIds?: string[]) => Promise<void>
  isPostingComment: boolean
  currentUser?: { userId?: string | null; name: string }
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  onDocumentClick?: (documentId: string) => void
  borderless?: boolean
}

export function ActivityPanel({
  entries,
  isLoading,
  activeFilter,
  onFilterChange,
  onPostComment,
  isPostingComment,
  currentUser,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onDocumentClick,
  borderless,
}: ActivityPanelProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    const feed = feedRef.current
    if (!sentinel || !feed || !onLoadMore || !hasMore) return

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore()
        }
      },
      { root: feed, rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, onLoadMore])

  return (
    <div className={`flex flex-col h-full overflow-hidden ${borderless ? '' : 'bg-card rounded-xl shadow-sm border'}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-0">
        {!borderless && <h3 className="text-base font-semibold text-foreground mb-3">Activity</h3>}

        {/* Tabs */}
        <div className="flex gap-0 border-b">
          {FILTER_OPTIONS.map((filter) => (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              className={`
                px-3 pb-2 text-[13px] font-medium transition-colors relative
                ${activeFilter === filter
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70'
                }
              `}
            >
              {FILTER_LABELS[filter]}
              {activeFilter === filter && (
                <span className="absolute bottom-0 left-0.5 right-0.5 h-[2px] bg-foreground rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="px-5 py-4">
        <CommentComposer onSubmit={onPostComment} isSubmitting={isPostingComment} currentUser={currentUser} />
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-auto px-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No activity yet
          </div>
        ) : (
          <div className="space-y-0">
            {entries.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} onDocumentClick={onDocumentClick} />
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {isLoadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
