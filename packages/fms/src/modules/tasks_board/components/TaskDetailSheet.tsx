import React, { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, FileText, ExternalLink, ChevronDown, ChevronUp, FolderKanban, Ship, Plane, Truck, TrainFront, ArrowDownToLine, ArrowUpFromLine, Package, User, Clock } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { cn } from '@open-mercato/shared/lib/utils'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useQueryClient } from '@tanstack/react-query'
import type { RfqBoardCard, BoardColumn, ChipVariant } from '../lib/types'
import { getTimeAgo } from '../lib/board-config'
import { UserAvatar } from './UserAvatar'

type TaskDetailSheetProps = {
  task: RfqBoardCard | null
  columns: BoardColumn[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateOffer?: (rfq: RfqBoardCard) => void
}

const chipStyles: Record<ChipVariant, string> = {
  high: 'bg-red-500 text-white border-red-500',
  medium: 'bg-amber-500 text-white border-amber-500',
  low: 'bg-emerald-500 text-white border-emerald-500',
  'chance-high': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'chance-medium': 'bg-amber-100 text-amber-700 border-amber-200',
  'chance-low': 'bg-red-100 text-red-700 border-red-200',
}

const offerStatusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  declined: 'bg-red-100 text-red-700 border-red-200',
}

const transportModeIcons: Record<string, React.ReactNode> = {
  sea: <Ship className="h-3 w-3" />,
  air: <Plane className="h-3 w-3" />,
  road: <Truck className="h-3 w-3" />,
  rail: <TrainFront className="h-3 w-3" />,
}

const directionIcons: Record<string, React.ReactNode> = {
  import: <ArrowDownToLine className="h-3 w-3" />,
  export: <ArrowUpFromLine className="h-3 w-3" />,
}

function InfoChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground bg-muted/50">
      {icon}
      {children}
    </span>
  )
}

function deriveShipmentType(direction: string | null, transportMode: string | null): string {
  if (transportMode === 'air') return 'AIR'
  if (transportMode === 'rail') return 'RAIL'
  if (transportMode === 'road') return 'FTL'
  if (direction === 'export') return 'EXP'
  if (direction === 'import') return 'IMP'
  return 'EXP'
}

function deriveCargoType(_cargoType: string | null): 'fcl' | 'lcl' {
  return 'fcl'
}

function deriveDirection(direction: string | null): 'export' | 'import' | 'domestic' {
  if (direction === 'export') return 'export'
  if (direction === 'import') return 'import'
  return 'export'
}

// -- Left Column: RFQ Details --
function RfqDetailsPanel({ task, column, t }: { task: RfqBoardCard; column: BoardColumn | undefined; t: (key: string, fallback?: string) => string }) {
  const [contextExpanded, setContextExpanded] = useState(false)

  const route = [task.origin, task.destination].filter(Boolean).join(' → ')
  const routeLabel = task.direction
    ? `${task.direction.charAt(0).toUpperCase() + task.direction.slice(1)}: ${route}`
    : route

  return (
    <div className="flex flex-col gap-4">
      {/* Top row: chip + status + time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className={cn('text-[10px] px-1.5 py-0', chipStyles[task.chip.variant])}>
            {task.chip.label}
          </Badge>
          {column?.color && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column.color }} />
              <span className="text-[10px] text-muted-foreground">{column.title}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {getTimeAgo(task.updatedAt)}
        </span>
      </div>

      {/* Route (prominent) */}
      {route && (
        <div className="text-sm text-muted-foreground">{routeLabel}</div>
      )}

      {/* Reference */}
      <span className="text-xs font-mono text-muted-foreground">{task.referenceNumber}</span>

      {/* Property chips */}
      <div className="flex flex-wrap gap-1.5">
        {task.direction && (
          <InfoChip icon={directionIcons[task.direction]}>
            <span className="capitalize">{task.direction}</span>
          </InfoChip>
        )}
        {task.transportMode && (
          <InfoChip icon={transportModeIcons[task.transportMode]}>
            <span className="capitalize">{task.transportMode}</span>
          </InfoChip>
        )}
        {task.cargoType && (
          <InfoChip icon={<Package className="h-3 w-3" />}>
            <span className="capitalize">{task.cargoType}</span>
          </InfoChip>
        )}
        {task.containerCount && (
          <InfoChip>{task.containerCount}x</InfoChip>
        )}
      </div>

      {/* People row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {task.contactPerson && (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3" />
            <span>{task.contactPerson}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {task.assignee ? (
            <>
              <UserAvatar
                name={task.assignee.name}
                initials={task.assignee.initials}
                color={task.assignee.color}
                size="sm"
              />
              <span>{task.assignee.name}</span>
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              <span>{t('tasks_board.detail.unassigned', 'Unassigned')}</span>
            </>
          )}
        </div>
      </div>

      {/* Expandable context */}
      {task.context && (
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setContextExpanded(!contextExpanded)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {contextExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {contextExpanded
              ? t('tasks_board.detail.hideContext', 'Hide context')
              : t('tasks_board.detail.showContext', 'Show context')}
          </button>
          <div
            className={cn(
              'mt-2 text-xs text-muted-foreground whitespace-pre-wrap overflow-hidden transition-all',
              contextExpanded ? 'max-h-[500px]' : 'max-h-[2.8em]',
            )}
          >
            {task.context}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Right Column: Lifecycle Actions --
function LifecyclePanel({
  task,
  onCreateOffer,
  t,
}: {
  task: RfqBoardCard
  onCreateOffer?: (rfq: RfqBoardCard) => void
  t: (key: string, fallback?: string) => string
}) {
  const queryClient = useQueryClient()
  const [creatingProject, setCreatingProject] = useState(false)

  const hasOffers = task.offerCount > 0
  const isAccepted = task.latestOfferStatus === 'accepted'

  async function handleCreateProject() {
    if (!task.latestOfferId) return
    setCreatingProject(true)

    try {
      // 1. Create the project
      const projectRes = await apiCall<{ id: string; projectNumber: string }>('/api/fms_projects/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: task.id,
          offerId: task.latestOfferId,
          direction: deriveDirection(task.direction),
          cargoType: deriveCargoType(task.cargoType),
          shipmentType: deriveShipmentType(task.direction, task.transportMode),
          containerCount: task.containerCount ?? undefined,
        }),
      })

      if (!projectRes.ok || !projectRes.result?.id) {
        flash('Failed to create project', 'error')
        return
      }

      const projectId = projectRes.result.id

      // 2. Link the offer to import lines
      await apiCall(`/api/fms_projects/projects/${projectId}/link-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: task.latestOfferId }),
      })

      // 3. Update RFQ status to approved if not already
      if (task.status !== 'approved') {
        await apiCall(`/api/fms_offers/rfq/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        })
      }

      flash(t('tasks_board.detail.projectCreated', 'Project created successfully'), 'success')
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })

      // Navigate to the project
      window.location.href = `/backend/fms-projects/${projectId}`
    } catch {
      flash('Failed to create project', 'error')
    } finally {
      setCreatingProject(false)
    }
  }

  // State A: No offers
  if (!hasOffers) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-8">
        <div className="rounded-full bg-muted p-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium mb-1">{t('tasks_board.detail.noOffers', 'No offers created yet')}</p>
          <p className="text-xs text-muted-foreground">{t('tasks_board.detail.createOfferPrompt', 'Create an offer for this RFQ')}</p>
        </div>
        <Button size="sm" onClick={() => onCreateOffer?.(task)} className="w-full">
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {t('tasks_board.detail.createOffer', 'Create Offer')}
        </Button>
      </div>
    )
  }

  // State B & C: Offers exist
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Offer summary card */}
      <div className="rounded-md border bg-muted/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('tasks_board.detail.offerNumber', 'Offer')}
          </span>
          {task.latestOfferStatus && (
            <Badge className={cn('text-[10px] px-1.5 py-0', offerStatusStyles[task.latestOfferStatus] ?? 'bg-gray-100 text-gray-700')}>
              {task.latestOfferStatus}
            </Badge>
          )}
        </div>
        <div className="text-sm font-medium mb-1">
          {task.latestOfferNumber ?? 'Offer'}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {task.latestOfferVersion && (
            <div>
              <span className="font-medium">{t('tasks_board.detail.offerVersion', 'Version')}: </span>
              {task.latestOfferVersion}
            </div>
          )}
          {task.latestOfferCreatedAt && (
            <div>
              <span className="font-medium">{t('tasks_board.detail.offerCreated', 'Created')}: </span>
              {getTimeAgo(task.latestOfferCreatedAt)}
            </div>
          )}
        </div>
        {task.offerCount > 1 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            +{task.offerCount - 1} more offer{task.offerCount > 2 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        {/* State C: Accepted → Create Project */}
        {isAccepted && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 mb-2">
            <p className="text-xs text-emerald-700 mb-3">
              {t('tasks_board.detail.createProjectPrompt', 'Offer accepted — create a project to begin execution')}
            </p>
            <Button
              size="sm"
              onClick={handleCreateProject}
              disabled={creatingProject}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <FolderKanban className="h-3.5 w-3.5 mr-1.5" />
              {creatingProject
                ? t('tasks_board.detail.creatingProject', 'Creating...')
                : t('tasks_board.detail.createProject', 'Create Project')}
            </Button>
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.href = `/backend/fms-offers?rfqId=${task.id}`
          }}
          className="w-full"
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          {t('tasks_board.detail.viewInOffers', 'View in Offers')}
        </Button>

        <Button
          size="sm"
          variant={isAccepted ? 'outline' : 'default'}
          onClick={() => onCreateOffer?.(task)}
          className="w-full"
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {t('tasks_board.detail.createOffer', 'Create Offer')}
        </Button>
      </div>
    </div>
  )
}

export function TaskDetailSheet({ task, columns, open, onOpenChange, onCreateOffer }: TaskDetailSheetProps) {
  const t = useT()

  if (!task) return null

  const column = columns.find((col) => col.id === task.status)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col bg-card shadow-lg border rounded-xl',
            'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-2xl max-h-[85vh]',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <DialogPrimitive.Title className="text-base font-semibold">
              {task.companyName || task.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label={t('ui.dialog.close.ariaLabel', 'Close')}
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Two-column body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: RFQ Details */}
            <div className="flex-1 overflow-y-auto p-5 border-r">
              <RfqDetailsPanel task={task} column={column} t={t} />
            </div>

            {/* Right: Lifecycle Actions */}
            <div className="w-[280px] flex-shrink-0 overflow-y-auto p-5">
              <LifecyclePanel
                task={task}
                onCreateOffer={onCreateOffer}
                t={t}
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
