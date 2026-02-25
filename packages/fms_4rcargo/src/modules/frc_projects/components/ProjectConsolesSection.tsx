'use client'

import * as React from 'react'
import { useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Truck, Plus, Eye, Trash2, RefreshCw } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

// Import ConsoleWizardDrawer from frc_console module
import { ConsoleWizardDrawer } from '../../frc_console/components/ConsoleWizard'
import type { DefaultProjectData } from '../../frc_console/components/ConsoleWizard/types'

export interface ConsoleRow {
  id: string
  name: string
  date: string
  status: string
  truckPresetId: string | null
  truckId: string | null
  truckName: string | null
  originAirportId: string | null
  originAirportCode: string | null
  destinationAirportId: string | null
  destinationAirportCode: string | null
}

interface ProjectConsolesSectionProps {
  projectId: string
  /** Full project data for read-only linking in console wizard */
  project?: DefaultProjectData
  onCreateConsole?: () => void
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

export function ProjectConsolesSection({ projectId, project, onCreateConsole }: ProjectConsolesSectionProps) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const tableRef = useRef<HTMLDivElement>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; consoleId: string; consoleName: string }>({
    open: false,
    consoleId: '',
    consoleName: '',
  })
  const [isDeleting, setIsDeleting] = useState(false)
  const [syncingConsoleId, setSyncingConsoleId] = useState<string | null>(null)

  // Fetch consoles for this project
  const { data: consolesData, isLoading } = useQuery({
    queryKey: ['frc_console', 'project', projectId],
    queryFn: async () => {
      const call = await apiCall<{ items: ConsoleRow[]; total: number }>(
        `/api/frc_console/console?projectId=${projectId}&limit=100`
      )
      if (!call.ok) return { items: [], total: 0 }
      return call.result ?? { items: [], total: 0 }
    },
    enabled: !!projectId,
  })

  const consoles = consolesData?.items ?? []

  const handleViewConsole = useCallback((consoleId: string) => {
    router.push(`/backend/frc-console/${consoleId}`)
  }, [router])

  const handleWizardCreated = useCallback(async () => {
    // Refresh consoles list and close wizard
    await queryClient.invalidateQueries({ queryKey: ['frc_console', 'project', projectId] })
    await queryClient.invalidateQueries({ queryKey: ['frc_console'] })
    setShowWizard(false)
    onCreateConsole?.()
  }, [projectId, queryClient, onCreateConsole])

  const handleCreateConsole = useCallback(() => {
    setShowWizard(true)
  }, [])

  const handleDeleteClick = useCallback((consoleId: string, consoleName: string) => {
    setDeleteDialog({ open: true, consoleId, consoleName })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog.consoleId) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_console/console/${deleteDialog.consoleId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        flash(t('frc_projects.detail.consoles.deleteError', 'Failed to delete console'), 'error')
        return
      }
      flash(t('frc_projects.detail.consoles.deleteSuccess', 'Console deleted successfully'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['frc_console', 'project', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['frc_console'] })
    } catch {
      flash(t('frc_projects.detail.consoles.deleteError', 'Failed to delete console'), 'error')
    } finally {
      setIsDeleting(false)
      setDeleteDialog({ open: false, consoleId: '', consoleName: '' })
    }
  }, [deleteDialog.consoleId, projectId, queryClient, t])

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialog({ open: false, consoleId: '', consoleName: '' })
  }, [])

  // Sync cargo from project to console
  const handleSyncCargo = useCallback(
    async (consoleId: string) => {
      setSyncingConsoleId(consoleId)
      try {
        const response = await apiCall(`/api/frc_console/console/${consoleId}/sync-cargo`, {
          method: 'POST',
        })
        if (!response.ok) {
          const errorResult = response.result as { error?: string } | undefined
          flash(errorResult?.error || t('frc_projects.detail.consoles.syncError', 'Failed to sync cargo'), 'error')
          return
        }
        flash(t('frc_projects.detail.consoles.syncSuccess', 'Cargo synced successfully'), 'success')
        // Invalidate console cargo queries to refresh console table and visualization
        await queryClient.invalidateQueries({ queryKey: ['frc_console_cargo', consoleId] })
        // Broad invalidation for visualization
        await queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'frc_console_cargo',
        })
      } catch {
        flash(t('frc_projects.detail.consoles.syncError', 'Failed to sync cargo'), 'error')
      } finally {
        setSyncingConsoleId(null)
      }
    },
    [queryClient, t]
  )

  // Actions renderer for the built-in actions column
  const actionsRenderer = useCallback(
    (rowData: Record<string, unknown>) => {
      const id = rowData.id as string
      const name = rowData.name as string
      const isSyncing = syncingConsoleId === id
      return (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleSyncCargo(id)
            }}
            disabled={isSyncing}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            title={t('frc_projects.detail.consoles.syncCargo', 'Sync Cargo')}
          >
            {isSyncing ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleViewConsole(id)
            }}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title={t('common.view', 'View')}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteClick(id, name)
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title={t('common.delete', 'Delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    },
    [handleViewConsole, handleDeleteClick, handleSyncCargo, syncingConsoleId, t]
  )

  // Build table data
  const tableData = useMemo(() => {
    return consoles.map((console_) => ({
      id: console_.id,
      name: console_.name,
      date: formatDate(console_.date),
      truckName: console_.truckName ?? '-',
      route: `${console_.originAirportCode ?? '?'} → ${console_.destinationAirportCode ?? '?'}`,
      status: console_.status,
    }))
  }, [consoles])

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'name',
        title: t('frc_projects.detail.consoles.columns.name', 'Name'),
        width: 200,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const id = row.id as string
          return (
            <Link
              href={`/backend/frc-console/${id}`}
              className="text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              {value as string}
            </Link>
          )
        },
      },
      {
        data: 'date',
        title: t('frc_projects.detail.consoles.columns.date', 'Date'),
        width: 100,
        type: 'text',
        readOnly: true,
      },
      {
        data: 'truckName',
        title: t('frc_projects.detail.consoles.columns.truck', 'Truck'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          if (!value || value === '-') return <span className="text-muted-foreground">-</span>
          return value as string
        },
      },
      {
        data: 'route',
        title: t('frc_projects.detail.consoles.columns.route', 'Route'),
        width: 150,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-mono text-sm">{value as string}</span>
        ),
      },
      {
        data: 'status',
        title: t('frc_projects.detail.consoles.columns.status', 'Status'),
        width: 100,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          const status = value as string
          const colors = STATUS_COLORS[status] ?? { bg: '#f3f4f6', text: '#374151' }
          return (
            <span
              className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
              }}
            >
              {t(`frc_console.status.${status}`, status)}
            </span>
          )
        },
      },

    ],
    [t, handleViewConsole, handleDeleteClick]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  // Empty state
  if (consoles.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-4">
            {t('frc_projects.detail.consoles.empty', 'No consoles yet')}
          </p>
          <Button onClick={handleCreateConsole}>
            <Plus className="h-4 w-4 mr-1" />
            {t('frc_projects.detail.consoles.create', 'Create Console')}
          </Button>
        </div>

        {/* Console Wizard Drawer */}
        <ConsoleWizardDrawer
          open={showWizard}
          onClose={() => setShowWizard(false)}
          onCreated={handleWizardCreated}
          defaultProject={project}
          defaultProjectId={project ? undefined : projectId}
        />
      </>
    )
  }

  // Consoles list
  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName=""
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          actionsRenderer={actionsRenderer}
          actionsColumnWidth={100}
          onRowClick={(rowIndex: number, rowData: Record<string, unknown>) => handleViewConsole(rowData.id as string)}
          uiConfig={{
            hideToolbar: true,
            hideSearch: true,
            hideAddRowButton: true,
            hideBottomBar: true,
            hideFilterButton: true,
          }}
        />
      </div>

      {/* Console Wizard Drawer */}
      <ConsoleWizardDrawer
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={handleWizardCreated}
        defaultProject={project}
        defaultProjectId={project ? undefined : projectId}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open: boolean) => !open && handleDeleteCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('frc_projects.detail.consoles.deleteTitle', 'Delete Console')}</DialogTitle>
            <DialogDescription>
              {t(
                'frc_projects.detail.consoles.deleteConfirmation',
                'Are you sure you want to delete console "{name}"? This action cannot be undone.',
                { name: deleteDialog.consoleName }
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDeleteCancel} disabled={isDeleting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Export section header actions component for use in CollapsibleSection
export function ProjectConsolesHeaderActions({
  onCreateConsole,
}: {
  onCreateConsole: () => void
}) {
  const t = useT()
  return (
    <Button variant="outline" size="sm" onClick={onCreateConsole} className="gap-1">
      <Plus className="h-4 w-4" />
      {t('frc_projects.detail.consoles.create', 'Create Console')}
    </Button>
  )
}
