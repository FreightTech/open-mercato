'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Trash2, Eye, ExternalLink } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useDynamicTablePage,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, NewRowSaveEvent } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AirCargoDrawer } from '../../components/AirCargoDrawer'
import { loadInitialRfqs } from '../../../../lib/initialSuggestions'
import { FRC_STACKABLE_TYPES } from '../../../../lib/types'

interface AirCargoRow {
  id: string
  name: string
  rfqId?: string | null
  rfqName?: string | null
  numberOfPieces: number
  stackableType: string
  lengthCm?: string | null
  widthCm?: string | null
  heightCm?: string | null
  volumeM3: string
  actualWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
  createdAt: string
  updatedAt: string
}

const STACKABLE_OPTIONS = FRC_STACKABLE_TYPES.map((type) => ({
  value: type,
  label: type === 'fully_stackable' ? 'Fully Stackable' : 'Non-Stackable',
}))

const STACKABLE_COLORS: Record<string, { bg: string; text: string }> = {
  fully_stackable: { bg: '#dcfce7', text: '#166534' },
  non_stackable: { bg: '#fef3c7', text: '#92400e' },
}

const StackableRenderer = ({ value }: { value: string }) => {
  // Show default 'fully_stackable' when empty (for new rows)
  const displayValue = value || 'fully_stackable'
  const colors = STACKABLE_COLORS[displayValue] || { bg: '#f3f4f6', text: '#374151' }
  const label = displayValue === 'fully_stackable' ? 'Fully Stackable' : 'Non-Stackable'
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

const RfqNameRenderer = (value: string, rowData: any) => {
  if (!value) return <span>-</span>

  // Try to parse as JSON (from EntitySearchEditor for new rows)
  let displayName = value
  let rfqId = rowData?.rfqId

  try {
    const parsed = JSON.parse(value)
    displayName = parsed.name || value
    rfqId = parsed.id || rfqId
  } catch {
    // Plain string from API - use as-is
  }

  // If we have an rfqId, make it a link
  if (rfqId) {
    return (
      <Link
        href={`/backend/frc-rfqs/${rfqId}`}
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
        <ExternalLink className="h-3 w-3" />
      </Link>
    )
  }

  return <span>{displayName}</span>
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return <span>{new Date(value).toLocaleDateString()}</span>
}

const NumberRenderer = ({ value }: { value: string | number }) => {
  if (value === null || value === undefined) return <span>-</span>
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return <span>-</span>
  return <span className="font-mono text-right">{num.toFixed(2)}</span>
}

const RENDERERS: Record<string, (value: any, rowData?: any) => React.ReactNode> = {
  StackableRenderer: (value) => <StackableRenderer value={value} />,
  DateRenderer: (value) => <DateRenderer value={value} />,
  NumberRenderer: (value) => <NumberRenderer value={value} />,
  RfqNameRenderer: (value, rowData) => RfqNameRenderer(value, rowData),
}

export default function AirCargoPage() {
  const t = useT()

  // Drawer state - only for viewing details
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // EntitySearchEditor config for RFQ selection
  const rfqEditorConfig = useMemo(
    () => ({
      entityType: 'frc_rfqs:frc_rfq',
      extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
        JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
        }),
      placeholder: 'Search RFQs...',
      minQueryLength: 2,
      initialSuggestions: {
        loadItems: loadInitialRfqs,
        limit: 4,
      },
    }),
    []
  )

  // Define columns with RFQ EntitySearchEditor
  const columns = useMemo(
    (): ColumnDef[] => [
      { data: 'name', title: 'Name', width: 200, type: 'text' },
      {
        data: 'rfqName',
        title: 'RFQ',
        width: 200,
        type: 'text',
        editor: createEntitySearchEditor(rfqEditorConfig),
        renderer: RENDERERS.RfqNameRenderer,
      },
      { data: 'numberOfPieces', title: 'Pieces', width: 80, type: 'numeric' },
      {
        data: 'stackableType',
        title: 'Stackable',
        width: 140,
        type: 'dropdown',
        source: STACKABLE_OPTIONS,
        renderer: RENDERERS.StackableRenderer,
      },
      { data: 'lengthCm', title: 'L (cm)', width: 90, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      { data: 'widthCm', title: 'W (cm)', width: 90, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      { data: 'heightCm', title: 'H (cm)', width: 90, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      {
        data: 'volumeM3',
        title: 'Volume (m³)',
        width: 110,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.NumberRenderer,
      },
      { data: 'actualWeightKg', title: 'Weight (kg)', width: 110, type: 'numeric', renderer: RENDERERS.NumberRenderer },
      {
        data: 'chargeableWeightKg',
        title: 'Chargeable (kg)',
        width: 130,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.NumberRenderer,
      },
      {
        data: 'loadingMetres',
        title: 'LDM',
        width: 90,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.NumberRenderer,
      },
      {
        data: 'createdAt',
        title: 'Created',
        width: 120,
        type: 'date',
        readOnly: true,
        renderer: RENDERERS.DateRenderer,
      },
    ],
    [rfqEditorConfig]
  )

  const table = useDynamicTablePage<AirCargoRow>({
    source: '/api/air_cargo/air-cargo',
    columns,
    tableName: 'Air Cargo',
    perspectives: 'air_cargo',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'air_cargo',
    create: {
      handler: async (payload, { tableRef, invalidate }) => {
        const { rowIndex, rowData } = payload

        dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

        try {
          let rfqId: string | null = null
          if (rowData.rfqName) {
            try {
              const parsed = JSON.parse(rowData.rfqName)
              rfqId = parsed.id || null
            } catch {
              rfqId = null
            }
          }

          const cargoData = {
            rfqId,
            name: rowData.name?.trim() || 'Air Cargo',
            numberOfPieces: parseInt(rowData.numberOfPieces) || 1,
            stackableType: rowData.stackableType || 'fully_stackable',
            lengthCm: rowData.lengthCm != null && rowData.lengthCm !== '' ? String(rowData.lengthCm) : null,
            widthCm: rowData.widthCm != null && rowData.widthCm !== '' ? String(rowData.widthCm) : null,
            heightCm: rowData.heightCm != null && rowData.heightCm !== '' ? String(rowData.heightCm) : null,
            actualWeightKg: rowData.actualWeightKg != null && rowData.actualWeightKg !== '' ? String(rowData.actualWeightKg) : '0',
          }

          if (!cargoData.name) throw new Error('Name is required')

          const response = await apiCall<{ id: string; error?: string }>('/api/air_cargo/air-cargo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cargoData),
          })

          if (response.ok && response.result?.id) {
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex,
              savedRowData: { ...cargoData, id: response.result.id },
            })
            invalidate()
            flash(t('air_cargo.messages.created', 'Air cargo created'), 'success')
          } else {
            throw new Error(response.result?.error || 'Failed to create air cargo')
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          flash(errorMessage, 'error')
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex,
            error: errorMessage,
          })
        }
      },
    },
    hooks: {
      beforeCellEdit: (payload, rowData) => {
        if (payload.prop === 'rfqName') {
          if (payload.newValue) {
            try {
              const parsed = JSON.parse(payload.newValue)
              return { payload: { rfqId: parsed.id } }
            } catch {
              return { payload: { rfqId: null } }
            }
          }
          return { payload: { rfqId: null } }
        }
      },
    },
    tableProps: {
      height: 'fill',
      uiConfig: { hideAddRowButton: false },
    },
  })

  // Open drawer to view cargo details
  const handleViewDetails = useCallback((id: string) => {
    setViewingId(id)
    setDrawerOpen(true)
  }, [])

  const handleConfirmDelete = useCallback((id: string) => {
    setDeletingId(id)
    setDeleteDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingId) return

    try {
      const response = await apiCall(`/api/air_cargo/air-cargo/${deletingId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash(t('air_cargo.messages.deleted', 'Air cargo deleted successfully'), 'success')
        table.refresh()
      } else {
        const error = (response.result as any)?.error ?? 'Delete failed'
        flash(error, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      flash(message, 'error')
    } finally {
      setDeleteDialogOpen(false)
      setDeletingId(null)
    }
  }, [deletingId, t, table])

  // Actions renderer with View and Delete icons
  const actionsRenderer = useCallback(
    (_rowData: unknown) => {
      const row = _rowData as AirCargoRow
      if (!row.id) return null
      return (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleViewDetails(row.id)
            }}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title={t('air_cargo.actions.view', 'View Details')}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleConfirmDelete(row.id)
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title={t('air_cargo.actions.delete', 'Delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    },
    [handleViewDetails, handleConfirmDelete, t]
  )

  const handleRowAction = useCallback(
    (actionId: string, rowData: AirCargoRow) => {
      if (actionId === 'view' && rowData.id) {
        handleViewDetails(rowData.id)
      } else if (actionId === 'delete' && rowData.id) {
        handleConfirmDelete(rowData.id)
      }
    },
    [handleViewDetails, handleConfirmDelete]
  )

  // Prevent browser from intercepting Cmd+D (bookmark shortcut)
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  if (table.isLoading) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={columns.length} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">{t('air_cargo.title', 'Air Cargo')}</h1>
      </div>

      <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          {...table.props}
          actionsRenderer={actionsRenderer}
          onRowAction={handleRowAction}
          keyboardShortcuts={{
            rowActions: [
              { id: 'view', label: 'View details', key: 'Enter', shift: true },
              { id: 'delete', label: 'Delete cargo', key: 'd', ctrlOrCmd: true },
            ],
          }}
        />
      </div>

      {/* Air Cargo Detail Drawer */}
      <AirCargoDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        airCargoId={viewingId}
        mainTableRef={table.props.tableRef as React.RefObject<HTMLElement>}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('air_cargo.delete.title', 'Delete Air Cargo')}</DialogTitle>
            <DialogDescription>
              {t(
                'air_cargo.delete.description',
                'Are you sure you want to delete this air cargo? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('air_cargo.actions.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('air_cargo.actions.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
