/**
 * FMS Projects Module - List View
 * Projects list with DynamicTable (useDynamicTablePage)
 */

'use client'

import * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type { ColumnDef, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'

interface FmsProjectRow {
  id: string
  projectNumber: string
  currentStep: string
  clientId?: string | null
  clientName?: string | null
  cargoType: string
  shipmentType?: string | null
  originAddress?: string | null
  destinationAddress?: string | null
  requestedPickupDate?: string | null
  clientReference?: string | null
  createdAt: string
  updatedAt: string
}

// Status options for dropdown with labels
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'plan_route', label: 'Planning' },
  { value: 'add_cargo', label: 'Adding Cargo' },
  { value: 'validated', label: 'Validated' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

// Cargo type options with labels
const CARGO_TYPE_OPTIONS = [
  { value: 'fcl', label: 'FCL' },
  { value: 'lcl', label: 'LCL' },
]

// Shipment type options with labels
const SHIPMENT_TYPE_OPTIONS = [
  { value: 'EXP', label: 'Export' },
  { value: 'IMP', label: 'Import' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'FTL', label: 'Full Truck' },
  { value: 'LTL', label: 'Less Than Truck' },
  { value: 'AIR', label: 'Air' },
  { value: 'DEPOT', label: 'Depot' },
]

const StatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    plan_route: { label: 'Planning', color: 'bg-blue-100 text-blue-800' },
    add_cargo: { label: 'Adding Cargo', color: 'bg-yellow-100 text-yellow-800' },
    validated: { label: 'Validated', color: 'bg-green-100 text-green-800' },
    confirmed: { label: 'Confirmed', color: 'bg-purple-100 text-purple-800' },
    in_transit: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-800' },
    delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800' },
    completed: { label: 'Completed', color: 'bg-green-200 text-green-900' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

const CargoTypeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{value.toUpperCase()}</span>
}

const ProjectNumberRenderer = ({ value, rowData }: { value: string; rowData: { id: string } }) => {
  const displayValue = value || `#${rowData.id?.slice(0, 8) || '...'}`
  return (
    <a
      href={`/backend/fms-projects/${rowData.id}`}
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left font-mono"
    >
      {displayValue}
    </a>
  )
}

const ClientRenderer = ({ value }: { value: string }) => {
  if (!value) return <span className="text-gray-400">-</span>
  // Value might be JSON from entity search editor
  try {
    const parsed = JSON.parse(value)
    if (parsed?.name) return <span>{parsed.name}</span>
  } catch {
    // Not JSON, display as-is
  }
  return <span>{value}</span>
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  CargoTypeRenderer: (value) => <CargoTypeRenderer value={value} />,
  ProjectNumberRenderer: (value, rowData) => <ProjectNumberRenderer value={value} rowData={rowData} />,
  ClientRenderer: (value) => <ClientRenderer value={value} />,
}

export default function ProjectsListPage() {
  const router = useRouter()
  const t = useT()

  const [projectToDelete, setProjectToDelete] = useState<FmsProjectRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Client editor config for entity search
  const clientEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
    minQueryLength: 1,
  }), [])

  const actionsRenderer = useCallback((rowData: any, _rowIndex: number) => {
    const row = rowData as FmsProjectRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setProjectToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'projectNumber',
        title: 'Project #',
        width: 180,
        readOnly: true,
        renderer: RENDERERS.ProjectNumberRenderer,
      },
      {
        data: 'currentStep',
        title: 'Status',
        width: 120,
        type: 'dropdown',
        source: STATUS_OPTIONS,
        renderer: RENDERERS.StatusRenderer,
      },
      {
        data: 'clientName',
        title: 'Client',
        width: 180,
        renderer: RENDERERS.ClientRenderer,
        editor: createEntitySearchEditor(clientEditorConfig),
      },
      {
        data: 'cargoType',
        title: 'Type',
        width: 80,
        type: 'dropdown',
        source: CARGO_TYPE_OPTIONS,
        renderer: RENDERERS.CargoTypeRenderer,
      },
      {
        data: 'shipmentType',
        title: 'Shipment',
        width: 100,
        type: 'dropdown',
        source: SHIPMENT_TYPE_OPTIONS,
      },
      {
        data: 'originAddress',
        title: 'Origin',
        width: 180,
        className: 'text-sm',
      },
      {
        data: 'destinationAddress',
        title: 'Destination',
        width: 180,
        className: 'text-sm',
      },
      {
        data: 'requestedPickupDate',
        title: 'Pickup Date',
        width: 120,
        type: 'date',
      },
      {
        data: 'clientReference',
        title: 'Client Ref',
        width: 140,
      },
      {
        data: 'createdAt',
        title: 'Created',
        width: 140,
        type: 'date',
        readOnly: true,
      },
    ] as ColumnDef[]
  }, [clientEditorConfig])

  const table = useDynamicTablePage<FmsProjectRow>({
    source: '/api/fms_projects/projects',
    columns,
    tableName: 'FMS Projects',
    perspectives: 'fms_projects',
    filterSuggestions: 'fms_projects:fms_project',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'fms_projects',
    mapApiItem: (project: any) => {
      const row: Record<string, any> = { id: project.id }
      Object.keys(project).forEach((key) => {
        if (key === 'id') return
        const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
        row[camelKey] = project[key]
      })
      // Format client as JSON for entity search editor display
      if (project.client_id && project.client_name) {
        row.clientName = JSON.stringify({ id: project.client_id, name: project.client_name })
      }
      return row as FmsProjectRow
    },
    hooks: {
      beforeCellEdit: (payload) => {
        if (payload.prop === 'clientName') {
          const strValue = String(payload.newValue || '')
          let clientId = null
          if (strValue) {
            try {
              const parsed = JSON.parse(strValue)
              clientId = parsed?.id || null
            } catch {
              // Not JSON, keep null
            }
          }
          return { payload: { clientId } }
        }
      },
    },
    tableProps: {
      height: 'calc(100vh - 110px)',
      uiConfig: { hideAddRowButton: true, enableFullscreen: true },
    },
  })

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open project', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete project', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    if (actionId === 'view' && rowData.id) {
      router.push(`/backend/fms-projects/${rowData.id}`)
    } else if (actionId === 'delete' && rowData.id) {
      setProjectToDelete(rowData as FmsProjectRow)
    }
  }, [router])

  const handleConfirmDelete = useCallback(async () => {
    if (!projectToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall<{ error?: string }>(
        `/api/fms_projects/projects/${projectToDelete.id}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        flash(t('fms_projects.list.deleted', 'Project deleted'), 'success')
        table.refresh()
        setProjectToDelete(null)
      } else {
        flash(response.result?.error || t('fms_projects.list.delete_failed', 'Failed to delete project'), 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : t('fms_projects.list.delete_failed', 'Failed to delete project'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [projectToDelete, table, t])

  if (table.isLoading) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={8} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <DynamicTable
          {...table.props}
          actionsRenderer={actionsRenderer}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
        />

        <Dialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('fms_projects.list.delete_dialog_title', 'Delete Project')}</DialogTitle>
              <DialogDescription>
                {t('fms_projects.list.delete_dialog_description', 'Are you sure you want to delete project "{projectNumber}"? This action cannot be undone.', { projectNumber: projectToDelete?.projectNumber ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProjectToDelete(null)} disabled={isDeleting}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                {isDeleting ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
