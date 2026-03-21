import React, { useCallback, useRef } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Search, Kanban, List, Plus } from 'lucide-react'
import type { ViewMode } from '../lib/types'

interface TaskBoardToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onCreateClick: () => void
}

export function TaskBoardToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onCreateClick,
}: TaskBoardToolbarProps) {
  const t = useT()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onSearchChange(value)
      }, 300)
    },
    [onSearchChange],
  )

  return (
    <div className="flex items-center justify-between gap-4 px-4 pt-2 pb-4">
      <div className="flex items-center rounded-md border p-0.5">
        <Button
          variant={viewMode === 'board' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => onViewModeChange('board')}
        >
          <Kanban className="h-4 w-4" />
          <span className="text-xs">{t('tasks_board.toolbar.viewBoard', 'Board')}</span>
        </Button>
        <Button
          variant={viewMode === 'table' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => onViewModeChange('table')}
        >
          <List className="h-4 w-4" />
          <span className="text-xs">{t('tasks_board.toolbar.viewTable', 'Table')}</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('tasks_board.toolbar.search', 'Search RFQs...')}
            defaultValue={searchQuery}
            onChange={handleSearchInput}
            className="w-64 py-2 pl-9 pr-3 text-sm rounded-lg border border-border bg-[rgb(243,243,245)] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_10%,transparent)]"
          />
        </div>

        <Button size="sm" className="h-9 gap-1.5" onClick={onCreateClick}>
          <Plus className="h-4 w-4" />
          {t('tasks_board.actions.createRfq', 'Create RFQ')}
        </Button>
      </div>
    </div>
  )
}
