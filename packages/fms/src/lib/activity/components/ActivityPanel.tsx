'use client'

import { Loader2 } from 'lucide-react'
import type { ActivityEntry, ActivityFilter } from '../types'
import { ActivityItem } from './ActivityItem'
import { CommentComposer } from './CommentComposer'

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All',
  comments: 'Comments',
  documents: 'Docs',
  changes: 'Changes',
}

const FILTER_OPTIONS: ActivityFilter[] = ['all', 'comments', 'documents', 'changes']

type ActivityPanelProps = {
  entries: ActivityEntry[]
  isLoading: boolean
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  onPostComment: (body: string, file?: File) => Promise<void>
  isPostingComment: boolean
}

export function ActivityPanel({
  entries,
  isLoading,
  activeFilter,
  onFilterChange,
  onPostComment,
  isPostingComment,
}: ActivityPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold mb-3">Activity</h3>
        <div className="flex gap-1">
          {FILTER_OPTIONS.map((filter) => (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              className={`
                px-2.5 py-1 text-xs rounded-full transition-colors
                ${
                  activeFilter === filter
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }
              `}
            >
              {FILTER_LABELS[filter]}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-auto px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No activity yet
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <CommentComposer onSubmit={onPostComment} isSubmitting={isPostingComment} />
    </div>
  )
}
