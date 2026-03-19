'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Eye, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog'
import { OpportunityWizardDrawer } from '../../components/OpportunityWizard'
import { FRC_SALES_STAGES, FRC_DELIVERY_STATUSES } from '../../../../lib/types'
import { loadInitialUsers } from '../../../../lib/loadInitialUsers'

interface FrcRfqRow {
  id: string
  name: string
  salesStage: string
  deliveryStatus: string
  probability: number
  amount?: string | null
  currencyCode: string
  totalPieces: number
  totalChargeableWeight: string
  requestDate: string
  createdAt: string
  updatedAt: string
  assignedToId?: string | null
  assignedToName?: string | null
}

// Dropdown options derived from types
const SALES_STAGE_OPTIONS = FRC_SALES_STAGES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
}))

const DELIVERY_STATUS_OPTIONS = FRC_DELIVERY_STATUSES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
}))

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'PLN', label: 'PLN' },
]

// Sales Stage badge colors
const SALES_STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  received: { bg: '#dbeafe', text: '#1e40af' },
  offer_sent: { bg: '#fef3c7', text: '#92400e' },
  offer_accepted: { bg: '#dcfce7', text: '#166534' },
  closed_lost: { bg: '#fee2e2', text: '#991b1b' },
}

// Delivery Status badge colors
const DELIVERY_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  awaiting: { bg: '#f3f4f6', text: '#374151' },
  in_transit: { bg: '#dbeafe', text: '#1e40af' },
  in_transit_delayed: { bg: '#fef3c7', text: '#92400e' },
  delivered: { bg: '#dcfce7', text: '#166534' },
  paid: { bg: '#d1fae5', text: '#065f46' },
}

const SalesStageRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = SALES_STAGE_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const DeliveryStatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = DELIVERY_STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const NameLinkRenderer = ({ value, row }: { value: string; row: FrcRfqRow }) => {
  if (!row?.id) return <span>{value}</span>
  return (
    <Link
      href={`/backend/frc-rfqs/${row.id}`}
      className="text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </Link>
  )
}

const UserNameRenderer = ({ value, row }: { value: string; row: FrcRfqRow }) => {
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
  SalesStageRenderer: (value) => <SalesStageRenderer value={value} />,
  DeliveryStatusRenderer: (value) => <DeliveryStatusRenderer value={value} />,
  NameLinkRenderer: (value, row) => <NameLinkRenderer value={value} row={row} />,
  UserNameRenderer: (value, row) => <UserNameRenderer value={value} row={row} />,
}

export default function FrcRfqsPage() {
  const t = useT()
  const router = useRouter()

  // Delete dialog state (custom ConfirmDeleteDialog with rfqName prop)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [rfqToDelete, setRfqToDelete] = useState<FrcRfqRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false)

  // User editor config for assigned to field
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

  // Define columns with entity search editors
  const columns = useMemo((): ColumnDef[] => [
    { data: 'name', title: 'Name', width: 250, type: 'text', renderer: RENDERERS.NameLinkRenderer },
    { data: 'requestDate', title: 'Request Date', width: 120, type: 'date' },
    {
      data: 'salesStage',
      title: 'Sales Stage',
      width: 130,
      type: 'dropdown',
      source: SALES_STAGE_OPTIONS,
      renderer: RENDERERS.SalesStageRenderer,
    },
    {
      data: 'deliveryStatus',
      title: 'Delivery',
      width: 130,
      type: 'dropdown',
      source: DELIVERY_STATUS_OPTIONS,
      renderer: RENDERERS.DeliveryStatusRenderer,
    },
    { data: 'probability', title: 'Probability %', width: 100, type: 'numeric' },
    { data: 'totalPieces', title: 'Pieces', width: 80, type: 'numeric', readOnly: true },
    { data: 'totalChargeableWeight', title: 'Chg. Weight', width: 100, type: 'numeric', readOnly: true },
    { data: 'amount', title: 'Amount', width: 100, type: 'numeric' },
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 90,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
    {
      data: 'assignedToName',
      title: 'Assigned To',
      width: 150,
      type: 'text',
      renderer: RENDERERS.UserNameRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
  ], [userEditorConfig])

  const table = useDynamicTablePage<FrcRfqRow>({
    source: '/api/frc_rfqs/rfqs',
    columns,
    tableName: 'Opportunities',
    perspectives: 'frc_rfqs',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'frc_rfqs',
    hooks: {
      beforeCellEdit: (payload, _rowData) => {
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
      height: 'fill',
      uiConfig: { hideAddRowButton: true },
    },
  })

  const handleDeleteConfirm = useCallback(async () => {
    if (!rfqToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_rfqs/rfqs/${rfqToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash(t('frc_rfqs.list.actions.deleted', 'RFQ deleted'), 'success')
        setDeleteDialogOpen(false)
        setRfqToDelete(null)
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
  }, [rfqToDelete, t, table.refresh])

  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FrcRfqRow
    if (!row.id) return null
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/backend/frc-rfqs/${row.id}`}
          className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
          title="View Details"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="w-4 h-4" />
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setRfqToDelete(row)
            setDeleteDialogOpen(true)
          }}
          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete RFQ"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )
  }, [])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FrcRfqRow
    if (actionId === 'view' && row.id) {
      router.push(`/backend/frc-rfqs/${row.id}`)
    } else if (actionId === 'delete' && row.id) {
      setRfqToDelete(row)
      setDeleteDialogOpen(true)
    }
  }, [router])

  // Prevent browser from intercepting Cmd/Ctrl+D (bookmark shortcut) during table interaction
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  const handleWizardCreated = useCallback(async () => {
    table.refresh()
  }, [table.refresh])

  if (table.isLoading) {
    return (
      <div style={{ height: 'calc(100vh - 160px)' }}>
        <TableSkeleton rows={10} columns={9} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <h1 className="text-lg font-semibold">Opportunities</h1>
        <Button size="sm" onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          New Opportunity
        </Button>
      </div>
      <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          {...table.props}
          actionsRenderer={actionsRenderer}
          onRowAction={handleRowAction}
          keyboardShortcuts={{
            rowActions: [
              { id: 'view', label: 'View RFQ details', key: 'Enter', shift: true },
              { id: 'delete', label: 'Delete RFQ', key: 'd', ctrlOrCmd: true },
            ],
          }}
        />
      </div>
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        rfqName={rfqToDelete?.name}
        isDeleting={isDeleting}
      />
      <OpportunityWizardDrawer
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleWizardCreated}
      />
    </div>
  )
}
