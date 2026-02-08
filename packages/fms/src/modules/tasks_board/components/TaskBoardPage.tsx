import React, { useCallback, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RfqBoardCard } from '../lib/types'
import type { FmsRfqStatus } from '../../fms_offers/data/types'
import { BOARD_COLUMNS, deriveChip } from '../lib/board-config'
import { KanbanBoard } from './KanbanBoard'
import { TaskDetailSheet } from './TaskDetailSheet'
import { RfqCreateDialog } from './RfqCreateDialog'
import { OfferCreationForm } from './OfferCreationForm'

type BoardApiItem = Omit<RfqBoardCard, 'chip'>
type BoardApiResponse = { items: BoardApiItem[] }

function enrichCards(items: BoardApiItem[]): RfqBoardCard[] {
  return items.map((item) => ({
    ...item,
    chip: deriveChip(item),
  }))
}

export function TaskBoardPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [selectedTask, setSelectedTask] = useState<RfqBoardCard | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [offerFormOpen, setOfferFormOpen] = useState(false)
  const [offerFormRfq, setOfferFormRfq] = useState<RfqBoardCard | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['rfq-board'],
    queryFn: async () => {
      const res = await apiCall<BoardApiResponse>('/api/fms_offers/rfq/board')
      return res.result?.items ?? []
    },
    select: enrichCards,
  })

  const tasks = data ?? []

  const handleTasksChange = useCallback(
    (newTasks: RfqBoardCard[]) => {
      queryClient.setQueryData<BoardApiItem[]>(['rfq-board'], () =>
        newTasks.map(({ chip, ...rest }) => rest),
      )
    },
    [queryClient],
  )

  const handleCardClick = useCallback((task: RfqBoardCard) => {
    setSelectedTask(task)
    setSheetOpen(true)
  }, [])

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      setSelectedTask(null)
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

  const handleRfqCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    setCreateDialogOpen(false)
  }, [queryClient])

  const handleCreateOffer = useCallback((rfq: RfqBoardCard) => {
    setOfferFormRfq(rfq)
    setOfferFormOpen(true)
    setSheetOpen(false)
  }, [])

  const handleOfferCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    setOfferFormOpen(false)
    setOfferFormRfq(null)
  }, [queryClient])

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] text-destructive">
        <p>{t('tasks_board.board.error', 'Failed to load board data')}</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="flex-1 overflow-hidden pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <KanbanBoard
              columns={BOARD_COLUMNS}
              tasks={tasks}
              onTasksChange={handleTasksChange}
              onCardClick={handleCardClick}
              onStatusChange={handleStatusChange}
              onAddClick={() => setCreateDialogOpen(true)}
            />
          )}
        </div>

        <TaskDetailSheet
          task={selectedTask}
          columns={BOARD_COLUMNS}
          open={sheetOpen}
          onOpenChange={handleSheetOpenChange}
          onCreateOffer={handleCreateOffer}
        />

        <RfqCreateDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreated={handleRfqCreated}
        />

        {offerFormRfq && (
          <OfferCreationForm
            open={offerFormOpen}
            onOpenChange={setOfferFormOpen}
            rfq={offerFormRfq}
            onCreated={handleOfferCreated}
          />
        )}
      </div>
    </TooltipProvider>
  )
}
