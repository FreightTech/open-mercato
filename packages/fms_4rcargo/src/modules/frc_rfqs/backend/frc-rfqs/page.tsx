'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Eye, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
  KeyboardShortcutsConfig,
  PerspectiveConfig,
  PerspectiveSaveEvent,
  PerspectiveSelectEvent,
  PerspectiveRenameEvent,
  PerspectiveDeleteEvent,
  PerspectiveChangeEvent,
  SortRule,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  PerspectivesIndexResponse,
  PerspectiveDto,
  PerspectiveSettings,
} from '@open-mercato/shared/modules/perspectives/types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'


import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog'
import { OpportunityWizardDrawer } from '../../components/OpportunityWizard'
import { FRC_SALES_STAGES, FRC_DELIVERY_STATUSES } from '../../../../lib/types'

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

const RENDERERS: Record<string, (value: any, row?: any) => React.ReactNode> = {
  SalesStageRenderer: (value) => <SalesStageRenderer value={value} />,
  DeliveryStatusRenderer: (value) => <DeliveryStatusRenderer value={value} />,
  NameLinkRenderer: (value, row) => <NameLinkRenderer value={value} row={row} />,
}

const COLUMNS: ColumnDef[] = [
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
]

// Transform API perspective format to DynamicTable format
function apiToDynamicTable(dto: PerspectiveDto, allColumns: string[]): PerspectiveConfig {
  const { columnOrder = [], columnVisibility = {} } = dto.settings

  const visible =
    columnOrder.length > 0
      ? columnOrder.filter((col) => columnVisibility[col] !== false)
      : allColumns
  const hidden = allColumns.filter((col) => !visible.includes(col))

  const apiFilters = dto.settings.filters as Record<string, unknown> | undefined
  const filters: FilterRow[] = Array.isArray(apiFilters)
    ? (apiFilters as FilterRow[])
    : ((apiFilters?.rows as FilterRow[]) ?? [])
  const color = apiFilters?._color as PerspectiveConfig['color']

  const sorting: SortRule[] = (dto.settings.sorting ?? []).map((s) => ({
    id: s.id,
    field: s.id,
    direction: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc',
  }))

  return { id: dto.id, name: dto.name, color, columns: { visible, hidden }, filters, sorting }
}

// Transform DynamicTable perspective format to API format
function dynamicTableToApi(config: PerspectiveConfig): PerspectiveSettings {
  const columnVisibility: Record<string, boolean> = {}
  config.columns.visible.forEach((col) => (columnVisibility[col] = true))
  config.columns.hidden.forEach((col) => (columnVisibility[col] = false))

  return {
    columnOrder: config.columns.visible,
    columnVisibility,
    filters: { rows: config.filters, _color: config.color },
    sorting: config.sorting.map((s) => ({
      id: s.field,
      desc: s.direction === 'desc',
    })),
  }
}

// Global ref for delete handler (used by action renderer)
let onRfqDeleteHandler: ((rfq: FrcRfqRow) => void) | null = null

function setRfqDeleteHandler(handler: ((rfq: FrcRfqRow) => void) | null) {
  onRfqDeleteHandler = handler
}

const DeleteButton = ({ row }: { row: FrcRfqRow }) => {
  if (!row.id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onRfqDeleteHandler) {
          onRfqDeleteHandler(row)
        }
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete RFQ"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

export default function FrcRfqsPage() {
  const t = useT()
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [rfqToDelete, setRfqToDelete] = useState<FrcRfqRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Perspective state
  const [savedPerspectives, setSavedPerspectives] = useState<PerspectiveConfig[]>([])
  const [activePerspectiveId, setActivePerspectiveId] = useState<string | null>(null)

  // Register delete handler for action renderer
  const openDeleteDialog = useCallback((rfq: FrcRfqRow) => {
    setRfqToDelete(rfq)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setRfqDeleteHandler(openDeleteDialog)
    return () => setRfqDeleteHandler(null)
  }, [openDeleteDialog])

  // Handle view action - navigate to detail page
  const handleViewRfq = useCallback(
    (rfqId: string) => {
      router.push(`/backend/frc-rfqs/${rfqId}`)
    },
    [router]
  )

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
        queryClient.invalidateQueries({ queryKey: ['frc_rfqs'] })
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
  }, [rfqToDelete, queryClient, t])

  const actionsRenderer = useCallback((rowData: FrcRfqRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/backend/frc-rfqs/${rowData.id}`}
          className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
          title="View Details"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="w-4 h-4" />
        </Link>
        <DeleteButton row={rowData} />
      </div>
    )
  }, [])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo(
    (): KeyboardShortcutsConfig => ({
      rowActions: [
        { id: 'view', label: 'View RFQ details', key: 'Enter', shift: true },
        { id: 'delete', label: 'Delete RFQ', key: 'd', ctrlOrCmd: true },
      ],
    }),
    []
  )

  const handleRowAction = useCallback(
    (actionId: string, rowData: FrcRfqRow) => {
      if (actionId === 'view' && rowData.id) {
        handleViewRfq(rowData.id)
      } else if (actionId === 'delete' && rowData.id) {
        openDeleteDialog(rowData)
      }
    },
    [handleViewRfq, openDeleteDialog]
  )

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false)

  const handleWizardCreated = useCallback(
    async (_opportunityId: string) => {
      // Invalidate and refetch the RFQ list to show the new opportunity
      await queryClient.invalidateQueries({ queryKey: ['frc_rfqs'] })
      await queryClient.refetchQueries({ queryKey: ['frc_rfqs'] })
    },
    [queryClient]
  )

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('offset', String((page - 1) * limit))
    params.set('limit', String(limit))
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (search) params.set('q', search)
    if (filters.length) params.set('filters', JSON.stringify(filters))
    return params.toString()
  }, [page, limit, sortField, sortDir, search, filters])

  const { data, isLoading } = useQuery({
    queryKey: ['frc_rfqs', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcRfqRow[]; total: number }>(
        `/api/frc_rfqs/rfqs?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load RFQs')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  // Fetch perspectives
  const { data: perspectivesData } = useQuery({
    queryKey: ['perspectives', 'frc_rfqs'],
    queryFn: async () => {
      const response = await apiCall<PerspectivesIndexResponse>('/api/perspectives/frc_rfqs')
      return response.ok ? response.result : null
    },
  })

  // Transform API perspectives to DynamicTable format
  useEffect(() => {
    if (perspectivesData?.perspectives && COLUMNS.length > 0) {
      const allCols = COLUMNS.map((c) => c.data)
      const transformed = perspectivesData.perspectives.map((p) => apiToDynamicTable(p, allCols))
      setSavedPerspectives(transformed)
      if (perspectivesData.defaultPerspectiveId && !activePerspectiveId) {
        setActivePerspectiveId(perspectivesData.defaultPerspectiveId)
      }
    }
  }, [perspectivesData, activePerspectiveId])

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const response = await apiCall<{ error?: string }>(
            `/api/frc_rfqs/rfqs/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('RFQ updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_rfqs'] })
          } else {
            const error = response.result?.error || 'Update failed'
            flash(error, 'error')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
              error,
            } as CellSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },

      [TableEvents.COLUMN_SORT]: (payload: { columnName: string; direction: 'asc' | 'desc' | null }) => {
        setSortField(payload.columnName)
        setSortDir(payload.direction || 'desc')
        setPage(1)
      },

      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearch(payload.query)
        setPage(1)
      },

      [TableEvents.FILTER_CHANGE]: (payload: { filters: FilterRow[] }) => {
        setFilters(payload.filters)
        setPage(1)
      },

      // Perspective events
      [TableEvents.PERSPECTIVE_SAVE]: async (payload: PerspectiveSaveEvent) => {
        const apiSettings = dynamicTableToApi(payload.perspective)
        const response = await apiCall<{ id: string }>('/api/perspectives/frc_rfqs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.perspective.name, settings: apiSettings }),
        })
        if (response.ok && response.result?.id) {
          flash('Perspective saved', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_rfqs'] })
        } else {
          flash('Failed to save perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_SELECT]: (payload: PerspectiveSelectEvent) => {
        setActivePerspectiveId(payload.id)
        if (payload.config) {
          setFilters(payload.config.filters)
          if (payload.config.sorting.length > 0) {
            setSortField(payload.config.sorting[0].field)
            setSortDir(payload.config.sorting[0].direction)
          }
        }
        setPage(1)
      },

      [TableEvents.PERSPECTIVE_RENAME]: async (payload: PerspectiveRenameEvent) => {
        const response = await apiCall(`/api/perspectives/frc_rfqs/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.newName }),
        })
        if (response.ok) {
          flash('Perspective renamed', 'success')
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_rfqs'] })
        } else {
          flash('Failed to rename perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_DELETE]: async (payload: PerspectiveDeleteEvent) => {
        const response = await apiCall(`/api/perspectives/frc_rfqs/${payload.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Perspective deleted', 'success')
          if (activePerspectiveId === payload.id) {
            setActivePerspectiveId(null)
          }
          queryClient.invalidateQueries({ queryKey: ['perspectives', 'frc_rfqs'] })
        } else {
          flash('Failed to delete perspective', 'error')
        }
      },

      [TableEvents.PERSPECTIVE_CHANGE]: (payload: PerspectiveChangeEvent) => {
        // Handle unsaved perspective changes (e.g., show indicator)
        // For now, we just update the local state
        if (payload.config.filters) {
          setFilters(payload.config.filters)
        }
        if (payload.config.sorting && payload.config.sorting.length > 0) {
          setSortField(payload.config.sorting[0].field)
          setSortDir(payload.config.sorting[0].direction)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (isLoading && !data) {
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
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={COLUMNS}
        tableName="Opportunities"
        idColumnName="id"
        height="calc(100vh - 160px)"
        stretchColumns={true}
        colHeaders={true}
        rowHeaders={true}
        actionsRenderer={actionsRenderer}
        keyboardShortcuts={keyboardShortcuts}
        onRowAction={handleRowAction}
        savedPerspectives={savedPerspectives}
        activePerspectiveId={activePerspectiveId}
        uiConfig={{
          hideAddRowButton: true,
        }}
        pagination={{
          currentPage: page,
          totalPages: Math.ceil((data?.total || 0) / limit),
          limit,
          limitOptions: [25, 50, 100],
          onPageChange: setPage,
          onLimitChange: (l) => {
            setLimit(l)
            setPage(1)
          },
        }}
      />
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        rfqName={rfqToDelete?.name}
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          tableRef.current?.focus()
        }}
      />
      <OpportunityWizardDrawer
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleWizardCreated}
      />
    </div>
  )
}
