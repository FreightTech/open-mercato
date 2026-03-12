'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { ProjectWizardDrawer } from '../../components/ProjectWizard'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'
import Link from 'next/link'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { FRC_PROJECT_STATUSES } from '../../../../lib/types'
import { loadInitialUsers, loadInitialRfqs, loadInitialOffers } from '../../../../lib/initialSuggestions'

interface FrcProjectRow {
  id: string
  projectNumber: string
  rfqId?: string | null
  rfqName?: string | null
  offerId?: string | null
  offerName?: string | null
  assignedToId?: string | null
  assignedToName?: string | null
  status: string
  totalValue?: string | null
  currencyCode: string
  createdAt: string
  updatedAt: string
}

// Dropdown options derived from types
const PROJECT_STATUS_OPTIONS = FRC_PROJECT_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#dcfce7', text: '#166534' },
  completed: { bg: '#dbeafe', text: '#1e40af' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.charAt(0).toUpperCase() + value.slice(1)
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{new Date(value).toLocaleDateString()}</span>
}

// Renderer for project number with link to detail page
const ProjectNumberLinkRenderer = ({ value, row }: { value: string; row: FrcProjectRow }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  if (!row?.id) return <span>{value}</span>
  return (
    <Link
      href={`/backend/frc-projects/${row.id}`}
      className="text-primary hover:underline font-mono"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </Link>
  )
}

// Renderer for RFQ/Opportunity name with link
const RfqNameRenderer = ({ value, row }: { value: string; row: FrcProjectRow }) => {
  // Value might be JSON from EntitySearchEditor
  let displayName = value
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      displayName = parsed.name || value
    } catch {
      // Use value as-is
    }
  }

  if (!displayName) return <span className="text-muted-foreground">-</span>

  // If we have rfqId, make it a link
  if (row?.rfqId) {
    return (
      <Link
        href={`/backend/frc-rfqs/${row.rfqId}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
      </Link>
    )
  }

  return <span className="text-foreground">{displayName}</span>
}

// Renderer for Offer name with link
const OfferNameRenderer = ({ value, row }: { value: string; row: FrcProjectRow }) => {
  // Value might be JSON from EntitySearchEditor
  let displayName = value
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      displayName = parsed.name || value
    } catch {
      // Use value as-is
    }
  }

  if (!displayName) return <span className="text-muted-foreground">-</span>

  // If we have offerId, make it a link
  if (row?.offerId) {
    return (
      <Link
        href={`/backend/frc-offers/${row.offerId}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
      </Link>
    )
  }

  return <span className="text-foreground">{displayName}</span>
}

// Renderer for assigned user name
const UserNameRenderer = ({ value, row }: { value: string; row: FrcProjectRow }) => {
  // Value might be JSON from EntitySearchEditor
  let displayName = row?.assignedToName || value
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      displayName = parsed.name || value
    } catch {
      // Use value as-is
    }
  }

  if (!displayName) return <span className="text-muted-foreground">-</span>

  return <span className="text-foreground">{displayName}</span>
}

const RENDERERS: Record<string, (value: any, row?: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  ProjectNumberLinkRenderer: (value, row) => <ProjectNumberLinkRenderer value={value} row={row} />,
  RfqNameRenderer: (value, row) => <RfqNameRenderer value={value} row={row} />,
  OfferNameRenderer: (value, row) => <OfferNameRenderer value={value} row={row} />,
  UserNameRenderer: (value, row) => <UserNameRenderer value={value} row={row} />,
}

export default function FrcProjectsPage() {
  const router = useRouter()

  // Wizard state
  const [showWizard, setShowWizard] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<FrcProjectRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Entity search editor configs
  const rfqEditorConfig = useMemo(() => ({
    entityType: 'frc_rfqs:frc_rfq',
    extractValue: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
        currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
        amount: r.fields?.amount ?? null,
      }),
    additionalFields: (r: { fields?: Record<string, unknown> }) => ({
      currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
      totalValue: r.fields?.amount ?? null,
    }),
    placeholder: 'Search opportunities...',
    minQueryLength: 2,
    initialSuggestions: {
      loadItems: loadInitialRfqs,
      limit: 4,
    },
  }), [])

  const offerEditorConfig = useMemo(() => ({
    entityType: 'frc_offers:frc_offer',
    extractValue: (r: { recordId: string; presenter?: { title?: string }; fields?: Record<string, unknown> }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
        rfqId: r.fields?.rfq_id ?? r.fields?.rfqId ?? null,
        currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
        totalAmount: r.fields?.total_amount ?? r.fields?.totalAmount ?? null,
      }),
    additionalFields: (r: { fields?: Record<string, unknown> }) => ({
      currencyCode: r.fields?.currency_code ?? r.fields?.currencyCode ?? null,
      totalValue: r.fields?.total_amount ?? r.fields?.totalAmount ?? null,
    }),
    placeholder: 'Search offers...',
    minQueryLength: 2,
    initialSuggestions: {
      loadItems: loadInitialOffers,
      limit: 4,
    },
  }), [])

  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
      }),
    placeholder: 'Search users...',
    minQueryLength: 2,
    initialSuggestions: {
      loadItems: loadInitialUsers,
      limit: 4,
    },
  }), [])

  // Column definitions
  const columns = useMemo((): ColumnDef[] => [
    { data: 'projectNumber', title: 'Project #', width: 150, type: 'text', renderer: RENDERERS.ProjectNumberLinkRenderer },
    {
      data: 'rfqName',
      title: 'Opportunity',
      width: 200,
      type: 'text',
      renderer: RENDERERS.RfqNameRenderer,
      editor: createEntitySearchEditor(rfqEditorConfig),
    },
    {
      data: 'offerName',
      title: 'Offer',
      width: 200,
      type: 'text',
      renderer: RENDERERS.OfferNameRenderer,
      editor: createEntitySearchEditor(offerEditorConfig),
    },
    {
      data: 'assignedToName',
      title: 'Assigned To',
      width: 150,
      type: 'text',
      renderer: RENDERERS.UserNameRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'status',
      title: 'Status',
      width: 120,
      type: 'dropdown',
      source: PROJECT_STATUS_OPTIONS,
      renderer: RENDERERS.StatusRenderer,
    },
    { data: 'totalValue', title: 'Total Value', width: 120, type: 'numeric' },
    { data: 'currencyCode', title: 'Currency', width: 80, type: 'dropdown', source: CURRENCY_OPTIONS },
    { data: 'createdAt', title: 'Created', width: 120, type: 'date', readOnly: true, renderer: RENDERERS.DateRenderer },
  ], [rfqEditorConfig, offerEditorConfig, userEditorConfig])

  // Hook-based table
  const table = useDynamicTablePage<FrcProjectRow>({
    source: '/api/frc_projects/projects',
    columns,
    tableName: 'Projects',
    perspectives: 'frc_projects',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'frc_projects',
    hooks: {
      beforeCellEdit: (payload) => {
        if (payload.prop === 'rfqName') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return {
              payload: {
                rfqId: parsed.id || null,
                ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
                ...(parsed.amount && { totalValue: String(parsed.amount) }),
              },
            }
          } catch {
            return { payload: { rfqId: payload.newValue || null } }
          }
        }
        if (payload.prop === 'offerName') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return {
              payload: {
                offerId: parsed.id || null,
                ...(parsed.rfqId && { rfqId: parsed.rfqId }),
                ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
                ...(parsed.totalAmount && { totalValue: String(parsed.totalAmount) }),
              },
            }
          } catch {
            return { payload: { offerId: payload.newValue || null } }
          }
        }
        if (payload.prop === 'assignedToName') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { assignedToId: parsed.id || null } }
          } catch {
            return { payload: { assignedToId: payload.newValue || null } }
          }
        }
      },
    },
    tableProps: {
      height: 'calc(100vh - 110px)',
      uiConfig: { hideAddRowButton: true },
    },
  })

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View project', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete project', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  // Actions renderer
  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FrcProjectRow
    if (!row.id) return null
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/backend/frc-projects/${row.id}`)
          }}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title="View Project"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setProjectToDelete(row)
            setDeleteDialogOpen(true)
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete Project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [router])

  // Row action handler for keyboard shortcuts
  const handleRowAction = useCallback((actionId: string, rowData: FrcProjectRow) => {
    if (actionId === 'view' && rowData.id) {
      router.push(`/backend/frc-projects/${rowData.id}`)
    } else if (actionId === 'delete' && rowData.id) {
      setProjectToDelete(rowData)
      setDeleteDialogOpen(true)
    }
  }, [router])

  // Handle Ctrl+D to prevent browser bookmark dialog
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  // Delete confirm handler
  const handleDeleteConfirm = useCallback(async () => {
    if (!projectToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_projects/projects/${projectToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Project deleted', 'success')
        setDeleteDialogOpen(false)
        setProjectToDelete(null)
        table.refresh()
      } else {
        const error = (response.result as { error?: string })?.error ?? 'Delete failed'
        flash(error, 'error')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [projectToDelete, table])

  // Wizard created handler
  const handleWizardCreated = useCallback(async () => {
    table.refresh()
    setShowWizard(false)
  }, [table])

  if (table.isLoading) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={7} />
      </div>
    )
  }

  return (
    <div onKeyDown={handleTableKeyDown}>
      {/* Header with New Project button */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      <DynamicTable
        {...table.props}
        actionsRenderer={actionsRenderer}
        keyboardShortcuts={keyboardShortcuts}
        onRowAction={handleRowAction}
      />

      {/* Project Wizard Drawer */}
      <ProjectWizardDrawer
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={handleWizardCreated}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={projectToDelete?.projectNumber}
        itemType="project"
        isDeleting={isDeleting}
      />
    </div>
  )
}
