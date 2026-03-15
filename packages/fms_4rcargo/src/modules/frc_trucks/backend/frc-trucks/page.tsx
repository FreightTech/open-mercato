'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'

interface FrcTruckRow {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface FrcTruckPresetRow {
  id: string
  name: string
  width: number
  length: number
  height: number
  maxWeight: number
  volume: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 300, type: 'text' },
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean' },
]

const PRESET_COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 200, type: 'text' },
  { data: 'width', title: 'Width (cm)', width: 100, type: 'numeric' },
  { data: 'length', title: 'Length (cm)', width: 100, type: 'numeric' },
  { data: 'height', title: 'Height (cm)', width: 100, type: 'numeric' },
  { data: 'maxWeight', title: 'Max Weight (kg)', width: 120, type: 'numeric' },
  { data: 'volume', title: 'Volume (m3)', width: 100, type: 'numeric', readOnly: true },
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean' },
]

export default function FrcTrucksPage() {
  // Delete dialog state (shared for both trucks and presets)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [truckToDelete, setTruckToDelete] = useState<FrcTruckRow | null>(null)
  const [presetToDelete, setPresetToDelete] = useState<FrcTruckPresetRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const trucksTable = useDynamicTablePage<FrcTruckRow>({
    source: '/api/frc_trucks/trucks',
    columns: COLUMNS,
    tableName: 'Trucks',
    perspectives: 'frc_trucks',
    defaultSort: { field: 'name', direction: 'asc' },
    create: {
      mapPayload: (rowData) => ({
        name: rowData.name?.trim() || '',
        isActive: rowData.isActive !== false,
      }),
    },
    hooks: {
      validateCreate: (rowData) => {
        if (!rowData.name?.trim()) return 'Truck name is required'
        return null
      },
    },
    queryKey: 'frc_trucks',
    tableProps: {
      height: 'calc(100vh - 400px)',
      uiConfig: { hideAddRowButton: false },
    },
  })

  const presetsTable = useDynamicTablePage<FrcTruckPresetRow>({
    source: '/api/frc_trucks/presets',
    columns: PRESET_COLUMNS,
    tableName: 'Trailer Presets',
    defaultSort: { field: 'name', direction: 'asc' },
    create: {
      mapPayload: (rowData) => ({
        name: rowData.name?.trim() || '',
        width: Number(rowData.width) || 245,
        length: Number(rowData.length) || 1360,
        height: Number(rowData.height) || 280,
        maxWeight: Number(rowData.maxWeight) || 24000,
        isActive: rowData.isActive !== false,
      }),
    },
    hooks: {
      validateCreate: (rowData) => {
        if (!rowData.name?.trim()) return 'Preset name is required'
        return null
      },
    },
    queryKey: 'frc_truck_presets',
    tableProps: {
      height: '350px',
      uiConfig: { hideAddRowButton: false, hideFilterButton: true, hideBottomBar: true },
    },
  })

  const handleDeleteConfirm = useCallback(async () => {
    if (truckToDelete) {
      setIsDeleting(true)
      try {
        const response = await apiCall(`/api/frc_trucks/trucks/${truckToDelete.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Truck deleted', 'success')
          setDeleteDialogOpen(false)
          setTruckToDelete(null)
          trucksTable.refresh()
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
    } else if (presetToDelete) {
      setIsDeleting(true)
      try {
        const response = await apiCall(`/api/frc_trucks/presets/${presetToDelete.id}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          flash('Preset deleted', 'success')
          setDeleteDialogOpen(false)
          setPresetToDelete(null)
          presetsTable.refresh()
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
    }
  }, [truckToDelete, presetToDelete, trucksTable, presetsTable])

  const trucksActionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FrcTruckRow
    if (!row.id) return null
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setPresetToDelete(null)
          setTruckToDelete(row)
          setDeleteDialogOpen(true)
        }}
        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete Truck"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )
  }, [])

  const presetsActionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FrcTruckPresetRow
    if (!row.id) return null
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setTruckToDelete(null)
          setPresetToDelete(row)
          setDeleteDialogOpen(true)
        }}
        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete Preset"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )
  }, [])

  const handleTruckRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FrcTruckRow
    if (actionId === 'delete' && row.id) {
      setPresetToDelete(null)
      setTruckToDelete(row)
      setDeleteDialogOpen(true)
    }
  }, [])

  const handlePresetRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FrcTruckPresetRow
    if (actionId === 'delete' && row.id) {
      setTruckToDelete(null)
      setPresetToDelete(row)
      setDeleteDialogOpen(true)
    }
  }, [])

  const truckKeyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete truck', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const presetKeyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'delete', label: 'Delete preset', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  // Prevent browser from intercepting Cmd+D (bookmark shortcut)
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  if (trucksTable.isLoading) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={2} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          {...trucksTable.props}
          actionsRenderer={trucksActionsRenderer}
          keyboardShortcuts={truckKeyboardShortcuts}
          onRowAction={handleTruckRowAction}
        />
      </div>

      {presetsTable.isLoading ? (
        <div style={{ height: '300px' }}>
          <TableSkeleton rows={5} columns={7} />
        </div>
      ) : (
        <div onKeyDown={handleTableKeyDown}>
          <DynamicTable
            {...presetsTable.props}
            actionsRenderer={presetsActionsRenderer}
            keyboardShortcuts={presetKeyboardShortcuts}
            onRowAction={handlePresetRowAction}
          />
        </div>
      )}

      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={truckToDelete?.name || presetToDelete?.name}
        itemType={truckToDelete ? 'truck' : 'preset'}
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
        }}
      />
    </div>
  )
}
