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

  const handleDetailSheetClose = useCallback((open: boolean) => {
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

  const handleRfqCreated = useCallback((rfq: Record<string, unknown>) => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    setCreateDialogOpen(false)

    const card: RfqBoardCard = {
      id: rfq.id as string,
      title: (rfq.title as string) || '',
      description: (rfq.description as string) || '',
      referenceNumber: (rfq.referenceNumber as string) || '',
      status: ((rfq.status as string) || 'incoming') as FmsRfqStatus,
      direction: (rfq.direction as string) || null,
      transportMode: (rfq.transportMode as string) || null,
      cargoType: (rfq.cargoType as string) || null,
      containerTypes: (rfq.containerTypes as string[]) || null,
      origin: (rfq.origin as string) || null,
      destination: (rfq.destination as string) || null,
      originLocationId: (rfq.originLocationId as string) || null,
      destinationLocationId: (rfq.destinationLocationId as string) || null,
      placeOfLoading: (rfq.placeOfLoading as string) || null,
      placeOfLoadingId: (rfq.placeOfLoadingId as string) || null,
      placeOfDelivery: (rfq.placeOfDelivery as string) || null,
      placeOfDeliveryId: (rfq.placeOfDeliveryId as string) || null,
      companyName: (rfq.companyName as string) || null,
      contactPerson: (rfq.contactPerson as string) || null,
      context: (rfq.context as string) || null,
      contractorId: (rfq.contractorId as string) || null,
      contactPersonId: (rfq.contactPersonId as string) || null,
      assignee: null,
      updatedAt: (rfq.updatedAt as string) || new Date().toISOString(),
      createdAt: (rfq.createdAt as string) || new Date().toISOString(),
      offerCount: 0,
      latestOfferStatus: null,
      latestOfferId: null,
      latestOfferNumber: null,
      latestOfferVersion: null,
      latestOfferCreatedAt: null,
      chip: { label: 'New', variant: 'high' },
    }
    setSelectedTask(card)
    setSheetOpen(true)
  }, [queryClient])

  const handleOfferCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
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
          onOpenChange={handleDetailSheetClose}
          onOfferCreated={handleOfferCreated}
        />

        <RfqCreateDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreated={handleRfqCreated}
        />
      </div>
    </TooltipProvider>
  )
}
