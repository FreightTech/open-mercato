'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Search } from 'lucide-react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export interface CargoAssignmentRow {
  id: string
  airCargoId: string
  cargoName: string
  numberOfPieces: number
  assignedQuantity: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  actualWeightKg: string
}

export interface AvailableCargoRow {
  id: string
  name: string
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  actualWeightKg: string
}

interface ProjectCargoAssignmentTableProps {
  projectId: string
  rfqId: string | null
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export interface ProjectCargoAssignmentTableHandle {
  addRow: () => void
}

interface NewCargoRow {
  id: string
  airCargoId: string
  cargoName: string
  assignedQuantity: number
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  actualWeightKg: string
  isNew: true
}

function formatDimensions(length: string | null, width: string | null, height: string | null): string {
  if (!length && !width && !height) return '-'
  const l = length || '?'
  const w = width || '?'
  const h = height || '?'
  return `${l}x${w}x${h}`
}

function formatNumber(value: string | number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export const ProjectCargoAssignmentTable = forwardRef<
  ProjectCargoAssignmentTableHandle,
  ProjectCargoAssignmentTableProps
>(function ProjectCargoAssignmentTable(
  { projectId, rfqId, tableRef: externalTableRef, siblingTableRefs },
  ref
) {
  const t = useT()
  const queryClient = useQueryClient()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Track new rows being added (pending cargo selection)
  const [newRows, setNewRows] = useState<NewCargoRow[]>([])

  // Fetch cargo assignments for this project
  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: ['frc_project_cargo', projectId],
    queryFn: async () => {
      const call = await apiCall<{ items: CargoAssignmentRow[]; availableCargo: AvailableCargoRow[] }>(
        `/api/frc_projects/projects/${projectId}/cargo`
      )
      if (!call.ok) return { items: [], availableCargo: [] }
      return call.result ?? { items: [], availableCargo: [] }
    },
    enabled: !!projectId,
  })

  const assignments = assignmentsData?.items ?? []

  // Entity search editor config for air cargo
  const airCargoEditorConfig = useMemo(
    () => ({
      entityType: 'air_cargo:frc_air_cargo',
      extractValue: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) =>
        JSON.stringify({
          id: r.recordId,
          name: r.presenter?.title || '',
        }),
      formatOption: (r: { recordId: string; presenter?: { title?: string; subtitle?: string } }) => ({
        primary: r.presenter?.title || `Cargo ${r.recordId.slice(0, 8)}...`,
        secondary: r.presenter?.subtitle,
      }),
      placeholder: t('frc_projects.detail.cargo.searchPlaceholder', 'Search cargo...'),
      minQueryLength: 1,
      noResultsText: t('frc_projects.detail.cargo.noResults', 'No cargo found. Create cargo in the RFQ first.'),
    }),
    [t]
  )

  // Add new row handler
  const handleAddRow = useCallback(() => {
    const newRow: NewCargoRow = {
      id: `new-${Date.now()}`,
      airCargoId: '',
      cargoName: '',
      assignedQuantity: 1,
      numberOfPieces: 0,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      volumeM3: '0',
      actualWeightKg: '0',
      isNew: true,
    }
    setNewRows((prev) => [...prev, newRow])
  }, [])

  // Expose addRow method to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      addRow: handleAddRow,
    }),
    [handleAddRow]
  )

  const handleRemoveNewRow = useCallback((rowId: string) => {
    setNewRows((prev) => prev.filter((r) => r.id !== rowId))
  }, [])

  // Combine existing items with new rows
  const tableData = useMemo(() => {
    const existingData = assignments.map((row) => ({
      id: row.id,
      airCargoId: row.airCargoId,
      cargoName: row.cargoName,
      assignedQuantity: row.assignedQuantity,
      numberOfPieces: row.numberOfPieces,
      dimensions: formatDimensions(row.lengthCm, row.widthCm, row.heightCm),
      volumeM3: formatNumber(row.volumeM3),
      actualWeightKg: formatNumber(row.actualWeightKg),
      isNew: false,
    }))

    const newData = newRows.map((row) => ({
      id: row.id,
      airCargoId: row.airCargoId,
      cargoName: row.cargoName,
      assignedQuantity: row.assignedQuantity,
      numberOfPieces: row.numberOfPieces,
      dimensions: formatDimensions(row.lengthCm, row.widthCm, row.heightCm),
      volumeM3: formatNumber(row.volumeM3),
      actualWeightKg: formatNumber(row.actualWeightKg),
      isNew: true,
    }))

    return [...existingData, ...newData]
  }, [assignments, newRows])

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'cargoName',
        title: t('frc_projects.detail.cargo.columns.name', 'Cargo Name'),
        width: 200,
        type: 'text',
        editor: createEntitySearchEditor(airCargoEditorConfig),
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const isNew = row.isNew as boolean
          if (isNew && !value) {
            return (
              <span className="text-muted-foreground italic flex items-center gap-1">
                <Search className="h-3 w-3" />
                {t('frc_projects.detail.cargo.clickToSearch', 'Click to search...')}
              </span>
            )
          }
          // If value is a JSON string (from entity search), parse to get name
          if (typeof value === 'string' && value.startsWith('{')) {
            try {
              const parsed = JSON.parse(value)
              return parsed.name || value
            } catch {
              return value
            }
          }
          return value as string
        },
      },
      {
        data: 'numberOfPieces',
        title: t('frc_projects.detail.cargo.columns.available', 'Available'),
        width: 90,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'assignedQuantity',
        title: t('frc_projects.detail.cargo.columns.assigned', 'Assigned'),
        width: 90,
        type: 'numeric',
      },
      {
        data: 'dimensions',
        title: t('frc_projects.detail.cargo.columns.dimensions', 'Dimensions (cm)'),
        width: 130,
        type: 'text',
        readOnly: true,
      },
      {
        data: 'volumeM3',
        title: t('frc_projects.detail.cargo.columns.volume', 'Volume m3'),
        width: 100,
        type: 'text',
        readOnly: true,
      },
      {
        data: 'actualWeightKg',
        title: t('frc_projects.detail.cargo.columns.weight', 'Weight kg'),
        width: 100,
        type: 'text',
        readOnly: true,
      },
    ],
    [t, airCargoEditorConfig]
  )

  const handleCellSave = useCallback(
    async (
      rowId: string,
      field: string,
      value: unknown,
      rowIndex: number,
      colIndex: number,
      rowData: Record<string, unknown>
    ) => {
      const isNew = rowData.isNew as boolean

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
        rowIndex,
        colIndex,
      } as CellSaveStartEvent)

      try {
        if (isNew) {
          // Handle new row - only cargoName (entity search) and quantity are editable
          if (field === 'cargoName') {
            // User selected from search
            let parsedValue: { id?: string; name?: string } = {}
            try {
              parsedValue = JSON.parse(String(value))
            } catch {
              // Not JSON - ignore, user must select from search
              dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
                rowIndex,
                colIndex,
              } as CellSaveSuccessEvent)
              return
            }

            if (parsedValue.id) {
              // User selected existing cargo - add it immediately
              const response = await apiCall(`/api/frc_projects/projects/${projectId}/cargo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  airCargoId: parsedValue.id,
                  quantity: (rowData.assignedQuantity as number) || 1,
                }),
              })

              if (!response.ok) {
                const errorResult = response.result as { error?: string } | null
                throw new Error(errorResult?.error || 'Failed to add cargo')
              }

              // Remove from new rows since it's now saved (skip if it was the placeholder row)
              if (rowId !== 'empty-placeholder') {
                handleRemoveNewRow(rowId)
              }
              queryClient.invalidateQueries({ queryKey: ['frc_project_cargo', projectId] })
              flash(t('frc_projects.detail.cargo.added', 'Cargo added to project'), 'success')
            }
          } else if (field === 'assignedQuantity') {
            // Update quantity on new row (local state only)
            setNewRows((prev) =>
              prev.map((r) =>
                r.id === rowId ? { ...r, assignedQuantity: parseInt(String(value), 10) || 1 } : r
              )
            )
          }

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex,
            colIndex,
          } as CellSaveSuccessEvent)
        } else {
          // Handle existing row edits (only quantity is editable)
          if (field !== 'assignedQuantity') {
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex,
              colIndex,
            } as CellSaveSuccessEvent)
            return
          }

          const quantity = parseInt(String(value), 10)
          if (isNaN(quantity) || quantity < 0) {
            throw new Error('Invalid quantity')
          }

          const response = await apiCall(`/api/frc_projects/projects/${projectId}/cargo/${rowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity }),
          })

          if (!response.ok) {
            throw new Error('Failed to update assignment')
          }

          queryClient.invalidateQueries({ queryKey: ['frc_project_cargo', projectId] })
          flash(t('frc_projects.detail.cargo.updated', 'Cargo assignment updated'), 'success')

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex,
            colIndex,
          } as CellSaveSuccessEvent)
        }
      } catch (error) {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
          rowIndex,
          colIndex,
          error: error instanceof Error ? error.message : 'Failed to save',
        } as CellSaveErrorEvent)
        flash(error instanceof Error ? error.message : 'Failed to save', 'error')
      }
    },
    [projectId, queryClient, t, tableRef, handleRemoveNewRow]
  )

  // Compute displayData for event handlers (same logic as render)
  const displayData = useMemo(() => {
    if (tableData.length === 0) {
      return [{
        id: 'empty-placeholder',
        airCargoId: '',
        cargoName: '',
        assignedQuantity: 1,
        numberOfPieces: 0,
        dimensions: '-',
        volumeM3: '-',
        actualWeightKg: '-',
        isNew: true,
      }]
    }
    return tableData
  }, [tableData])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        const rowData = displayData[payload.rowIndex]
        handleCellSave(
          payload.id as string,
          payload.prop,
          payload.newValue,
          payload.rowIndex,
          payload.colIndex,
          rowData as Record<string, unknown>
        )
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleDeleteCargo = useCallback(
    async (cargoId: string, isNew: boolean) => {
      // Don't allow deleting the placeholder row
      if (cargoId === 'empty-placeholder') return

      if (isNew) {
        handleRemoveNewRow(cargoId)
        return
      }

      const confirmed = window.confirm(
        t('frc_projects.detail.cargo.deleteConfirm', 'Remove this cargo from the project?')
      )
      if (!confirmed) return

      try {
        const response = await apiCall(`/api/frc_projects/projects/${projectId}/cargo/${cargoId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete assignment')
        }

        queryClient.invalidateQueries({ queryKey: ['frc_project_cargo', projectId] })
        flash(t('frc_projects.detail.cargo.deleted', 'Cargo removed from project'), 'success')
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Failed to delete', 'error')
      }
    },
    [projectId, queryClient, t, handleRemoveNewRow]
  )

  const actionsRenderer = useCallback(
    (rowData: Record<string, unknown>) => {
      const id = rowData.id as string
      const isNew = rowData.isNew as boolean
      if (!id) return null
      return (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteCargo(id, isNew)
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title={t('frc_projects.detail.cargo.delete', 'Remove')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )
    },
    [handleDeleteCargo, t]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <DynamicTable
        tableRef={tableRef}
        data={displayData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        actionsRenderer={actionsRenderer}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
})
