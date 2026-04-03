import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RfqBoardCard, ViewMode, RfqTableRow } from '../lib/types'
import type { FmsRfqStatus } from '../../fms_offers/data/types'
import { BOARD_COLUMNS, deriveChip } from '../lib/board-config'
import { KanbanBoard } from './KanbanBoard'
import { TaskBoardToolbar } from './TaskBoardToolbar'
import { RfqTableView } from './RfqTableView'
import { RfqWizardSheet } from './RfqWizardSheet'

type BoardApiItem = Omit<RfqBoardCard, 'chip'>
type BoardApiResponse = { items: BoardApiItem[] }

function enrichCards(items: BoardApiItem[]): RfqBoardCard[] {
  return items.map((item) => ({
    ...item,
    chip: deriveChip(item),
  }))
}

function getInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'board'
  return (localStorage.getItem('tasks-board-view-mode') as ViewMode) || 'board'
}

type WizardState = {
  open: boolean
  mode: 'new' | 'existing'
  rfqId: string | null
}

export function TaskBoardPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [wizardState, setWizardState] = useState<WizardState>({ open: false, mode: 'new', rfqId: null })
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode)
  const [searchQuery, setSearchQuery] = useState('')
  const searchParams = useSearchParams()

  // Auto-open RFQ wizard from URL ?rfqId=<uuid>
  useEffect(() => {
    const rfqIdParam = searchParams.get('rfqId')
    if (rfqIdParam && !wizardState.open) {
      setWizardState({ open: true, mode: 'existing', rfqId: rfqIdParam })
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('tasks-board-view-mode', mode)
  }, [])

  const { data, isLoading, error } = useQuery({
    queryKey: ['rfq-board'],
    queryFn: async () => {
      const res = await apiCall<BoardApiResponse>('/api/fms_offers/rfq/board')
      return res.result?.items ?? []
    },
    select: enrichCards,
  })

  const tasks = data ?? []

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter((task) => {
      return (
        task.title?.toLowerCase().includes(q) ||
        task.companyName?.toLowerCase().includes(q) ||
        task.origin?.toLowerCase().includes(q) ||
        task.destination?.toLowerCase().includes(q) ||
        task.contactPerson?.toLowerCase().includes(q) ||
        task.referenceNumber?.toLowerCase().includes(q)
      )
    })
  }, [tasks, searchQuery])

  const handleTasksChange = useCallback(
    (newTasks: RfqBoardCard[]) => {
      queryClient.setQueryData<BoardApiItem[]>(['rfq-board'], () =>
        newTasks.map(({ chip, ...rest }) => rest),
      )
    },
    [queryClient],
  )

  const handleCardClick = useCallback((task: RfqBoardCard) => {
    setWizardState({ open: true, mode: 'existing', rfqId: task.id })
  }, [])

  const handleWizardOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setWizardState({ open: false, mode: 'new', rfqId: null })
    } else {
      setWizardState((prev) => ({ ...prev, open }))
    }
  }, [])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: FmsRfqStatus) => {
    try {
      await apiCall(`/api/fms_offers/rfq/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    }
  }, [queryClient])

  const handleWizardCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
  }, [queryClient])

  const handleOfferCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
  }, [queryClient])

  const handleDeleteRequest = useCallback(async (rfqId: string) => {
    setWizardState({ open: false, mode: 'new', rfqId: null })
    const confirmed = await confirm({
      title: t('tasks_board.detail.deleteTitle', 'Delete RFQ'),
      text: t('tasks_board.detail.deleteText', 'Are you sure you want to delete this RFQ? This action cannot be undone.'),
      confirmText: t('tasks_board.detail.delete', 'Delete'),
      variant: 'destructive',
    })
    if (!confirmed) return
    await apiCall(`/api/fms_offers/rfq/${rfqId}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
  }, [confirm, t, queryClient])

  const handleTableRowClick = useCallback((row: RfqTableRow) => {
    setWizardState({ open: true, mode: 'existing', rfqId: row.id })
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] text-destructive">
        <p>{t('tasks_board.board.error', 'Failed to load board data')}</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-64px)] -mt-4 lg:-mt-6 -mx-4 lg:-mx-6">
        <TaskBoardToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onCreateClick={() => setWizardState({ open: true, mode: 'new', rfqId: null })}
        />

        <div className="flex-1 overflow-hidden">
          {viewMode === 'board' ? (
            isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <KanbanBoard
                columns={BOARD_COLUMNS}
                tasks={filteredTasks}
                onTasksChange={handleTasksChange}
                onCardClick={handleCardClick}
                onStatusChange={handleStatusChange}
              />
            )
          ) : (
            <RfqTableView
              searchQuery={searchQuery}
              onRowClick={handleTableRowClick}
            />
          )}
        </div>

        <RfqWizardSheet
          mode={wizardState.mode}
          rfqId={wizardState.rfqId}
          open={wizardState.open}
          onOpenChange={handleWizardOpenChange}
          onCreated={handleWizardCreated}
          onOfferCreated={handleOfferCreated}
          onDeleteRequest={handleDeleteRequest}
        />
        {ConfirmDialogElement}
      </div>
    </TooltipProvider>
  )
}
