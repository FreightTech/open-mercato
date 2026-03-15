import React, { useCallback, useMemo, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RfqBoardCard, ViewMode, RfqTableRow } from '../lib/types'
import type { FmsRfqStatus } from '../../fms_offers/data/types'
import { BOARD_COLUMNS, deriveChip } from '../lib/board-config'
import { KanbanBoard } from './KanbanBoard'
import { TaskDetailSheet } from './TaskDetailSheet'
import { TaskBoardToolbar } from './TaskBoardToolbar'
import { RfqTableView } from './RfqTableView'
import { RfqCreationWizard } from './RfqCreationWizard'

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

export function TaskBoardPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [selectedTask, setSelectedTask] = useState<RfqBoardCard | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode)
  const [searchQuery, setSearchQuery] = useState('')

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

  const handleWizardCreated = useCallback((rfq: Record<string, unknown>) => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
    setWizardOpen(false)
  }, [queryClient])

  const handleOfferCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
  }, [queryClient])

  const handleTableRowClick = useCallback((row: RfqTableRow) => {
    const card: RfqBoardCard = {
      id: row.id,
      title: row.title || '',
      description: '',
      referenceNumber: '',
      status: row.status,
      direction: row.direction,
      transportMode: row.transportMode,
      cargoType: row.cargoType,
      containerTypes: null,
      origin: row.origin,
      destination: row.destination,
      originLocationId: null,
      destinationLocationId: null,
      placeOfLoading: null,
      placeOfLoadingId: null,
      placeOfDelivery: null,
      placeOfDeliveryId: null,
      companyName: row.companyName,
      contactPerson: row.contactPerson,
      context: null,
      contractorId: null,
      contactPersonId: null,
      assignee: null,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      offerCount: 0,
      latestOfferStatus: null,
      latestOfferId: null,
      latestOfferNumber: null,
      latestOfferVersion: null,
      latestOfferCreatedAt: null,
      chip: { label: '', variant: 'medium' },
    }
    setSelectedTask(card)
    setSheetOpen(true)
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
          onCreateClick={() => setWizardOpen(true)}
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
                onAddClick={() => setWizardOpen(true)}
              />
            )
          ) : (
            <RfqTableView
              searchQuery={searchQuery}
              onRowClick={handleTableRowClick}
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

        <RfqCreationWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onCreated={handleWizardCreated}
        />
      </div>
    </TooltipProvider>
  )
}
