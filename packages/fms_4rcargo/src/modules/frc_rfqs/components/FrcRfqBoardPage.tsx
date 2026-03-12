import React, { useCallback, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FrcRfqBoardCard } from '../lib/board-types'
import type { FrcSalesStage } from '../../../lib/types'
import { FRC_BOARD_COLUMNS, deriveChip } from '../lib/board-config'
import { FrcKanbanBoard } from './FrcKanbanBoard'
import { FrcRfqDetailSheet } from './FrcRfqDetailSheet'
import { OpportunityWizardDrawer } from './OpportunityWizard'

type BoardApiItem = Omit<FrcRfqBoardCard, 'chip'>
type BoardApiResponse = { items: BoardApiItem[] }

function enrichCards(items: BoardApiItem[]): FrcRfqBoardCard[] {
  return items.map((item) => ({
    ...item,
    chip: deriveChip(item),
  }))
}

export function FrcRfqBoardPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [selectedTask, setSelectedTask] = useState<FrcRfqBoardCard | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['frc-rfq-board'],
    queryFn: async () => {
      const res = await apiCall<BoardApiResponse>('/api/frc_rfqs/rfqs/board')
      return res.result?.items ?? []
    },
    select: enrichCards,
  })

  const tasks = data ?? []

  const handleTasksChange = useCallback(
    (newTasks: FrcRfqBoardCard[]) => {
      queryClient.setQueryData<BoardApiItem[]>(['frc-rfq-board'], () =>
        newTasks.map(({ chip, ...rest }) => rest),
      )
    },
    [queryClient],
  )

  const handleCardClick = useCallback((task: FrcRfqBoardCard) => {
    setSelectedTask(task)
    setSheetOpen(true)
  }, [])

  const handleDetailSheetClose = useCallback((open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      setSelectedTask(null)
    }
  }, [])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: FrcSalesStage) => {
    try {
      await apiCall(`/api/frc_rfqs/rfqs/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ salesStage: newStatus }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['frc-rfq-board'] })
    }
  }, [queryClient])

  const handleWizardCreated = useCallback((_opportunityId: string) => {
    queryClient.invalidateQueries({ queryKey: ['frc-rfq-board'] })
  }, [queryClient])

  const handleOfferCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['frc-rfq-board'] })
  }, [queryClient])

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] text-destructive">
        <p>{t('frc_rfqs.board.error', 'Failed to load board data')}</p>
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
            <FrcKanbanBoard
              columns={FRC_BOARD_COLUMNS}
              tasks={tasks}
              onTasksChange={handleTasksChange}
              onCardClick={handleCardClick}
              onStatusChange={handleStatusChange}
              onAddClick={() => setWizardOpen(true)}
            />
          )}
        </div>

        <FrcRfqDetailSheet
          task={selectedTask}
          columns={FRC_BOARD_COLUMNS}
          open={sheetOpen}
          onOpenChange={handleDetailSheetClose}
          onOfferCreated={handleOfferCreated}
        />

        <OpportunityWizardDrawer
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreated={handleWizardCreated}
        />
      </div>
    </TooltipProvider>
  )
}
