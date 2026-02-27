'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
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
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Trash2, Eye } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AirCargoDrawer } from '../../air_cargo/components/AirCargoDrawer'

export type AirCargoEditItem = {
  id: string
  name: string
  numberOfPieces: number
  stackableType: string
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  volumetricWeightKg: string
  actualWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
}

type AirCargoEditTableProps = {
  rfqId: string
  cargoItems: AirCargoEditItem[]
  isLoading: boolean
  onDataChange: () => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STACKABLE_OPTIONS = ['fully_stackable', 'non_stackable']

// Stackable chip renderer
const stackableChipRenderer = (value: string) => {
  const isStackable = value === 'fully_stackable'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isStackable ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {isStackable ? 'Stackable' : 'Non-stackable'}
    </span>
  )
}

// Format numeric values for display
function formatNumber(value: string | number | null, decimals = 2): string {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  return num.toFixed(decimals)
}

/**
 * Calculate cargo metrics from dimensions and weight
 * Air cargo: 1 m3 = 167 kg volumetric weight
 */
function calculateCargoMetrics(data: {
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string | null
}): {
  volumeM3: string
  chargeableWeightKg: string
  loadingMetres: string
} {
  const lengthCm = parseFloat(data.lengthCm || '0') || 0
  const widthCm = parseFloat(data.widthCm || '0') || 0
  const heightCm = parseFloat(data.heightCm || '0') || 0
  const pieces = data.numberOfPieces || 1
  const actualWeightKg = parseFloat(data.actualWeightKg || '0') || 0

  // Volume = L x W x H x pieces / 1,000,000 (cm3 to m3)
  const volumeM3 = (lengthCm * widthCm * heightCm * pieces) / 1_000_000

  // Volumetric weight (air cargo: 1 m3 = 167 kg)
  const volumetricWeightKg = volumeM3 * 167

  // Chargeable weight = max(actual total weight, volumetric weight)
  const actualTotalWeight = actualWeightKg * pieces
  const chargeableWeightKg = Math.max(actualTotalWeight, volumetricWeightKg)

  // Loading metres (for trucking): length / 100 * width / 240 * pieces
  const loadingMetres = (lengthCm / 100) * (widthCm / 240) * pieces

  return {
    volumeM3: volumeM3.toFixed(4),
    chargeableWeightKg: chargeableWeightKg.toFixed(2),
    loadingMetres: loadingMetres.toFixed(4),
  }
}

export function AirCargoEditTable({
  rfqId,
  cargoItems,
  isLoading,
  onDataChange,
  tableRef: externalTableRef,
  siblingTableRefs,
}: AirCargoEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [cargoToDelete, setCargoToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewingCargoId, setViewingCargoId] = useState<string | null>(null)

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'name',
        title: 'Name',
        width: 150,
        type: 'text',
      },
      {
        data: 'numberOfPieces',
        title: 'Pieces',
        width: 70,
        type: 'numeric',
      },
      {
        data: 'lengthCm',
        title: 'L (cm)',
        width: 80,
        type: 'numeric',
      },
      {
        data: 'widthCm',
        title: 'W (cm)',
        width: 80,
        type: 'numeric',
      },
      {
        data: 'heightCm',
        title: 'H (cm)',
        width: 80,
        type: 'numeric',
      },
      {
        data: 'actualWeightKg',
        title: 'Weight (kg)',
        width: 100,
        type: 'numeric',
      },
      {
        data: 'volumeM3',
        title: 'Volume (m3)',
        width: 100,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'volumetricWeightKg',
        title: 'Vol Wt (kg)',
        headerTooltip: 'Volume (m³) × 167 kg/m³',
        width: 100,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'chargeableWeightKg',
        title: 'Chg. Wt (kg)',
        headerTooltip: 'MAX(Actual Weight × Pieces, Volumetric Weight)',
        width: 100,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'stackableType',
        title: 'Stackable',
        width: 120,
        type: 'dropdown',
        source: STACKABLE_OPTIONS,
        renderer: stackableChipRenderer,
      },
    ],
    []
  )

  const tableData = useMemo(() => {
    return cargoItems.map((item) => ({
      id: item.id,
      name: item.name || '',
      numberOfPieces: item.numberOfPieces || 1,
      lengthCm: formatNumber(item.lengthCm, 2) || '',
      widthCm: formatNumber(item.widthCm, 2) || '',
      heightCm: formatNumber(item.heightCm, 2) || '',
      actualWeightKg: formatNumber(item.actualWeightKg, 2) || '',
      volumeM3: formatNumber(item.volumeM3, 4) || '',
      volumetricWeightKg: formatNumber(item.volumetricWeightKg, 2) || '',
      chargeableWeightKg: formatNumber(item.chargeableWeightKg, 2) || '',
      stackableType: item.stackableType || 'fully_stackable',
    }))
  }, [cargoItems])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const cargoId = payload.id as string
          const updateData: Record<string, unknown> = {}

          // Map the field to API format
          if (payload.prop === 'numberOfPieces') {
            updateData.numberOfPieces = parseInt(String(payload.newValue)) || 1
          } else if (payload.prop === 'lengthCm') {
            updateData.lengthCm = payload.newValue ? String(payload.newValue) : null
          } else if (payload.prop === 'widthCm') {
            updateData.widthCm = payload.newValue ? String(payload.newValue) : null
          } else if (payload.prop === 'heightCm') {
            updateData.heightCm = payload.newValue ? String(payload.newValue) : null
          } else if (payload.prop === 'actualWeightKg') {
            updateData.actualWeightKg = payload.newValue ? String(payload.newValue) : null
          } else if (payload.prop === 'stackableType') {
            updateData.stackableType = payload.newValue
          } else if (payload.prop === 'name') {
            updateData.name = payload.newValue
          }

          const response = await apiCall(`/api/frc_rfqs/rfqs/${rfqId}/cargo/${cargoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (response.ok) {
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)

            // Refresh data to get updated computed fields and totals
            onDataChange()
          } else {
            throw new Error('Update failed')
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
          flash(t('frc_rfqs.cargo.updateError', 'Failed to update cargo'), 'error')
        }
      },

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        try {
          const { _isNew, id, ...rowData } = payload.rowData as Record<string, unknown>

          // Calculate computed fields client-side for immediate feedback
          const metrics = calculateCargoMetrics({
            numberOfPieces: (rowData.numberOfPieces as number) || 1,
            lengthCm: (rowData.lengthCm as string) || null,
            widthCm: (rowData.widthCm as string) || null,
            heightCm: (rowData.heightCm as string) || null,
            actualWeightKg: (rowData.actualWeightKg as string) || null,
          })

          const response = await apiCall(`/api/frc_rfqs/rfqs/${rfqId}/cargo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [
                {
                  name: (rowData.name as string) || '',
                  numberOfPieces: (rowData.numberOfPieces as number) || 1,
                  stackableType: (rowData.stackableType as string) || 'fully_stackable',
                  lengthCm: (rowData.lengthCm as string) || null,
                  widthCm: (rowData.widthCm as string) || null,
                  heightCm: (rowData.heightCm as string) || null,
                  actualWeightKg: (rowData.actualWeightKg as string) || null,
                  volumeM3: metrics.volumeM3,
                  chargeableWeightKg: metrics.chargeableWeightKg,
                  loadingMetres: metrics.loadingMetres,
                },
              ],
            }),
          })

          const result = response.result as { items?: Array<{ id: string; name?: string }> } | undefined
          if (response.ok && result?.items?.[0]?.id) {
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...rowData, id: result.items[0].id },
            } as NewRowSaveSuccessEvent)

            flash(t('frc_rfqs.cargo.created', 'Cargo item added'), 'success')
            onDataChange()
          } else {
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
              rowIndex: payload.rowIndex,
              error: 'Failed to create cargo item',
            } as NewRowSaveErrorEvent)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create cargo'
          dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            error: errorMessage,
          } as NewRowSaveErrorEvent)
          flash(t('frc_rfqs.cargo.createError', 'Failed to add cargo'), 'error')
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleViewDetails = useCallback((cargoId: string) => {
    setViewingCargoId(cargoId)
    setDrawerOpen(true)
  }, [])

  const handleRemoveCargo = useCallback((cargoId: string) => {
    setCargoToDelete(cargoId)
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!cargoToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_rfqs/rfqs/${rfqId}/cargo/${cargoToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash(t('frc_rfqs.cargo.deleted', 'Cargo item removed'), 'success')
        onDataChange()
      } else {
        throw new Error('Delete failed')
      }
    } catch {
      flash(t('frc_rfqs.cargo.deleteError', 'Failed to remove cargo'), 'error')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
      setCargoToDelete(null)
    }
  }, [cargoToDelete, rfqId, onDataChange, t])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setCargoToDelete(null)
  }, [])

  if (isLoading) {
    return <TableSkeleton rows={3} columns={9} />
  }

  if (cargoItems.length === 0) {
    return (
      <div className="border rounded-lg">
        <DynamicTable
          tableRef={tableRef}
          data={[]}
          columns={columns}
          tableName="Air Cargo"
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideColumnsButton: true,
            hideFilterButton: true,
            hideSortButton: true,
          }}
          emptyMessage={t('frc_rfqs.cargo.empty', 'No cargo items. Click + to add.')}
        />
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg">
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Air Cargo"
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideColumnsButton: true,
            hideFilterButton: true,
            hideSortButton: true,
          }}
          actionsRenderer={(rowData: Record<string, unknown>) => {
            // Don't show actions for new rows (they have a cancel button)
            if (rowData._isNew) return null
            return (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewDetails(rowData.id as string)
                  }}
                  className="p-1 text-muted-foreground hover:text-blue-600 transition-colors"
                  title={t('frc_rfqs.cargo.viewDetails', 'View Details')}
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveCargo(rowData.id as string)
                  }}
                  className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                  title={t('frc_rfqs.cargo.remove', 'Remove cargo')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          }}
        />
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('frc_rfqs.cargo.deleteTitle', 'Remove Cargo')}</DialogTitle>
            <DialogDescription>
              {t(
                'frc_rfqs.cargo.deleteConfirm',
                'Are you sure you want to remove this cargo item? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelDelete} disabled={isDeleting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? t('common.removing', 'Removing...') : t('common.remove', 'Remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AirCargoDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        airCargoId={viewingCargoId}
        mainTableRef={tableRef as React.RefObject<HTMLElement>}
      />
    </>
  )
}
