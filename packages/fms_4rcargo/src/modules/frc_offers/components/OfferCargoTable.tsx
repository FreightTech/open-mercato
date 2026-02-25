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
import { Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type OfferLineData = {
  id: string
  name: string
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  volumetricWeightKg: string
  actualWeightKg: string
  chargeableWeightKg: string
  stackableType: string
}

interface OfferCargoTableProps {
  offerId: string
  offerLines: OfferLineData[]
  isLoading?: boolean
  onLineSave: (lineId: string, field: string, value: unknown) => Promise<void>
  onLineCreate: (data: Record<string, unknown>) => Promise<{ id: string }>
  onLineDelete: (lineId: string) => Promise<void>
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

export function OfferCargoTable({
  offerId,
  offerLines,
  isLoading = false,
  onLineSave,
  onLineCreate,
  onLineDelete,
  onDataChange,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OfferCargoTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [lineToDelete, setLineToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'name',
        title: t('frc_offers.detail.cargo.name', 'Name'),
        width: 150,
        type: 'text',
      },
      {
        data: 'numberOfPieces',
        title: t('frc_offers.detail.cargo.pieces', 'Pieces'),
        width: 70,
        type: 'numeric',
      },
      {
        data: 'lengthCm',
        title: t('frc_offers.detail.cargo.length', 'L (cm)'),
        width: 80,
        type: 'numeric',
      },
      {
        data: 'widthCm',
        title: t('frc_offers.detail.cargo.width', 'W (cm)'),
        width: 80,
        type: 'numeric',
      },
      {
        data: 'heightCm',
        title: t('frc_offers.detail.cargo.height', 'H (cm)'),
        width: 80,
        type: 'numeric',
      },
      {
        data: 'actualWeightKg',
        title: t('frc_offers.detail.cargo.weight', 'Wt (kg)'),
        width: 90,
        type: 'numeric',
      },
      {
        data: 'volumeM3',
        title: t('frc_offers.detail.cargo.volume', 'Vol (m3)'),
        width: 90,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'volumetricWeightKg',
        title: t('frc_offers.detail.cargo.volumetricWeight', 'Vol Wt (kg)'),
        headerTooltip: t('frc_offers.detail.cargo.volumetricWeightTooltip', 'Volume (m³) × 167 kg/m³'),
        width: 100,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'chargeableWeightKg',
        title: t('frc_offers.detail.cargo.chargeableWeight', 'Chg (kg)'),
        headerTooltip: t('frc_offers.detail.cargo.chargeableWeightTooltip', 'MAX(Actual Weight × Pieces, Volumetric Weight)'),
        width: 90,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'stackableType',
        title: t('frc_offers.detail.cargo.stackable', 'Stackable'),
        width: 120,
        type: 'dropdown',
        source: STACKABLE_OPTIONS,
        renderer: stackableChipRenderer,
      },
    ],
    [t]
  )

  const tableData = useMemo(() => {
    return offerLines.map((line) => ({
      id: line.id,
      name: line.name || '',
      numberOfPieces: line.numberOfPieces || 1,
      lengthCm: formatNumber(line.lengthCm, 2) || '',
      widthCm: formatNumber(line.widthCm, 2) || '',
      heightCm: formatNumber(line.heightCm, 2) || '',
      actualWeightKg: formatNumber(line.actualWeightKg, 2) || '',
      volumeM3: formatNumber(line.volumeM3, 4) || '',
      volumetricWeightKg: formatNumber(line.volumetricWeightKg, 2) || '',
      chargeableWeightKg: formatNumber(line.chargeableWeightKg, 2) || '',
      stackableType: line.stackableType || 'fully_stackable',
    }))
  }, [offerLines])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const lineId = payload.id as string
          const field = payload.prop as string
          let value: unknown = payload.newValue

          // Map the field to API format
          if (field === 'numberOfPieces') {
            value = parseInt(String(value)) || 1
          } else if (['lengthCm', 'widthCm', 'heightCm', 'actualWeightKg'].includes(field)) {
            value = value ? String(value) : null
          }

          await onLineSave(lineId, field, value)

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)

          // Refresh data to get updated computed fields
          onDataChange()
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },

      [TableEvents.NEW_ROW_SAVE]: async (payload: NewRowSaveEvent) => {
        try {
          const { _isNew, id, ...rowData } = payload.rowData as Record<string, unknown>

          const result = await onLineCreate({
            name: (rowData.name as string) || 'New Cargo',
            numberOfPieces: parseInt(String(rowData.numberOfPieces)) || 1,
            stackableType: (rowData.stackableType as string) || 'fully_stackable',
            lengthCm: rowData.lengthCm ? String(rowData.lengthCm) : null,
            widthCm: rowData.widthCm ? String(rowData.widthCm) : null,
            heightCm: rowData.heightCm ? String(rowData.heightCm) : null,
            actualWeightKg: rowData.actualWeightKg ? String(rowData.actualWeightKg) : null,
          })

          if (result?.id) {
            dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              savedRowData: { ...rowData, id: result.id },
            } as NewRowSaveSuccessEvent)

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
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleRemoveLine = useCallback((lineId: string) => {
    setLineToDelete(lineId)
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!lineToDelete) return

    setIsDeleting(true)
    try {
      await onLineDelete(lineToDelete)
      onDataChange()
    } catch {
      // Error handling is done by parent
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
      setLineToDelete(null)
    }
  }, [lineToDelete, onLineDelete, onDataChange])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setLineToDelete(null)
  }, [])

  if (isLoading) {
    return <TableSkeleton rows={3} columns={9} />
  }

  if (offerLines.length === 0) {
    return (
      <>
        <div className="border rounded-lg">
          <DynamicTable
            tableRef={tableRef}
            data={[]}
            columns={columns}
            tableName="Cargo"
            idColumnName="id"
            width="100%"
            colHeaders={true}
            rowHeaders={false}
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
            emptyMessage={t('frc_offers.detail.cargo.empty', 'No cargo items. Click + to add.')}
          />
        </div>

        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('frc_offers.detail.cargo.deleteTitle', 'Remove Cargo')}</DialogTitle>
              <DialogDescription>
                {t(
                  'frc_offers.detail.cargo.deleteConfirm',
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
      </>
    )
  }

  return (
    <>
      <div className="border rounded-lg">
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Cargo"
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={false}
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
                    handleRemoveLine(rowData.id as string)
                  }}
                  className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                  title={t('frc_offers.detail.cargo.remove', 'Remove cargo')}
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
            <DialogTitle>{t('frc_offers.detail.cargo.deleteTitle', 'Remove Cargo')}</DialogTitle>
            <DialogDescription>
              {t(
                'frc_offers.detail.cargo.deleteConfirm',
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
    </>
  )
}
