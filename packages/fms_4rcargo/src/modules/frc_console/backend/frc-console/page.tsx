'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { ConsoleWizardDrawer } from '../../components/ConsoleWizard'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor, type SearchResult } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { FRC_CONSOLE_STATUSES } from '../../../../lib/types'
import { formatDateForApi } from '../../../../lib/dateUtils'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'
import { loadInitialAirports, loadInitialTrucks } from '../../../../lib/initialSuggestions'

interface FrcConsoleRow {
  id: string
  name: string
  customName: string | null
  date: string
  status: string
  truckPresetId: string | null
  truckPresetName: string | null
  projectId: string | null
  projectNumber: string | null
  truckId: string | null
  truckName: string | null
  originAirportId: string | null
  originAirportCode: string | null
  destinationAirportId: string | null
  destinationAirportCode: string | null
  createdAt: string
  updatedAt: string
}

// Dropdown options from types
const CONSOLE_STATUS_OPTIONS = FRC_CONSOLE_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '),
}))

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const colors = STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151' }
  const label = value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
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

// Name renderer with link to detail page
const NameLinkRenderer = (value: string, row: FrcConsoleRow) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  if (!row?.id) return <span>{value}</span>
  return (
    <a
      href={`/backend/frc-console/${row.id}`}
      className="text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </a>
  )
}

// Project renderer - uses row data to create link
const createProjectRenderer = (rowData: FrcConsoleRow) => {
  const value = rowData.projectNumber
  const projectId = rowData.projectId
  if (!value || !projectId) return <span className="text-muted-foreground">-</span>
  return (
    <a
      href={`/backend/frc-projects/${projectId}`}
      className="font-mono text-xs text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {String(value)}
    </a>
  )
}

const RENDERERS: Record<string, (value: unknown, row?: FrcConsoleRow) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value as string} />,
  DateRenderer: (value) => <DateRenderer value={value as string} />,
  NameLinkRenderer: (value, row) => NameLinkRenderer(value as string, row as FrcConsoleRow),
}

// Base columns (without dynamic editors)
const BASE_COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 200, type: 'text', readOnly: true, renderer: RENDERERS.NameLinkRenderer },
  { data: 'customName', title: 'Custom Name', width: 150, type: 'text' },
  { data: 'date', title: 'Loading Date', width: 120, type: 'date' },
  { data: 'truckName', title: 'Truck', width: 120, type: 'text' },
  { data: 'originAirportCode', title: 'Origin', width: 100, type: 'text' },
  { data: 'destinationAirportCode', title: 'Destination', width: 100, type: 'text' },
  {
    data: 'status',
    title: 'Status',
    width: 120,
    type: 'dropdown',
    source: CONSOLE_STATUS_OPTIONS,
    renderer: RENDERERS.StatusRenderer,
  },
  { data: 'truckPresetName', title: 'Preset', width: 150, type: 'text' },
  { data: 'projectNumber', title: 'Project', width: 120, type: 'text' },
  { data: 'createdAt', title: 'Created', width: 120, type: 'date', readOnly: true, renderer: RENDERERS.DateRenderer },
]

export default function FrcConsolePage() {
  const t = useT()
  const router = useRouter()

  // Wizard state
  const [showWizard, setShowWizard] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [consoleToDelete, setConsoleToDelete] = useState<FrcConsoleRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Entity search editor configs
  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: 'Search airports...',
    minQueryLength: 1,
    additionalFilters: { type: 'airport' },
    initialSuggestions: {
      loadItems: loadInitialAirports,
      limit: 4,
    },
  }), [])

  const presetEditorConfig = useMemo(() => ({
    entityType: 'frc_trucks:frc_truck_preset',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search presets...',
    minQueryLength: 1,
  }), [])

  const truckEditorConfig = useMemo(() => ({
    entityType: 'frc_trucks:frc_truck',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search trucks...',
    minQueryLength: 1,
    initialSuggestions: {
      loadItems: loadInitialTrucks,
      limit: 4,
    },
  }), [])

  const projectEditorConfig = useMemo(() => ({
    entityType: 'frc_projects:frc_project',
    extractValue: (r: SearchResult) =>
      JSON.stringify({ id: r.recordId, number: r.presenter?.title || '' }),
    placeholder: 'Search projects...',
    minQueryLength: 1,
  }), [])

  // Build columns with entity search editors
  const columns = useMemo((): ColumnDef[] => {
    return BASE_COLUMNS.map((col) => {
      if (col.data === 'originAirportCode') {
        return {
          ...col,
          editor: createEntitySearchEditor(airportEditorConfig),
        }
      }
      if (col.data === 'destinationAirportCode') {
        return {
          ...col,
          editor: createEntitySearchEditor(airportEditorConfig),
        }
      }
      if (col.data === 'truckPresetName') {
        return {
          ...col,
          editor: createEntitySearchEditor(presetEditorConfig),
        }
      }
      if (col.data === 'truckName') {
        return {
          ...col,
          editor: createEntitySearchEditor(truckEditorConfig),
        }
      }
      if (col.data === 'projectNumber') {
        return {
          ...col,
          editor: createEntitySearchEditor(projectEditorConfig),
          renderer: (_value: unknown, row: Record<string, unknown>) => createProjectRenderer(row as unknown as FrcConsoleRow),
        }
      }
      return col
    })
  }, [airportEditorConfig, presetEditorConfig, truckEditorConfig, projectEditorConfig])

  const table = useDynamicTablePage<FrcConsoleRow>({
    source: '/api/frc_console/console',
    columns,
    tableName: 'Truck Loading Console',
    perspectives: 'frc_console',
    defaultSort: { field: 'date', direction: 'desc' },
    queryKey: 'frc_console',
    hooks: {
      beforeCellEdit: (payload, _rowData) => {
        if (payload.prop === 'originAirportCode') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { originAirportId: parsed.id } }
          } catch {
            return { payload: { originAirportId: null } }
          }
        }
        if (payload.prop === 'destinationAirportCode') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { destinationAirportId: parsed.id } }
          } catch {
            return { payload: { destinationAirportId: null } }
          }
        }
        if (payload.prop === 'truckPresetName') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { truckPresetId: parsed.id } }
          } catch {
            return { payload: { truckPresetId: null } }
          }
        }
        if (payload.prop === 'truckName') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { truckId: parsed.id } }
          } catch {
            return { payload: { truckId: null } }
          }
        }
        if (payload.prop === 'projectNumber') {
          try {
            const parsed = JSON.parse(String(payload.newValue))
            return { payload: { projectId: parsed.id } }
          } catch {
            return { payload: { projectId: null } }
          }
        }
        if (payload.prop === 'customName') {
          return { payload: { customName: payload.newValue || null } }
        }
        if (payload.prop === 'date') {
          return { payload: { date: formatDateForApi(payload.newValue) } }
        }
      },
    },
    tableProps: {
      height: 'fill',
      uiConfig: { hideAddRowButton: true },
    },
  })

  // Delete confirm handler
  const handleDeleteConfirm = useCallback(async () => {
    if (!consoleToDelete) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_console/console/${consoleToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash(t('frc_console.list.deleteSuccess', 'Console deleted'), 'success')
        setDeleteDialogOpen(false)
        setConsoleToDelete(null)
        table.refresh()
      } else {
        const errorResult = response.result as { error?: string } | undefined
        flash(errorResult?.error || t('frc_console.list.deleteError', 'Failed to delete console'), 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [consoleToDelete, table, t])

  // Actions renderer
  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FrcConsoleRow
    if (!row.id) return null
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/backend/frc-console/${row.id}`)
          }}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title={t('frc_console.list.viewConsole', 'View Console')}
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setConsoleToDelete(row)
            setDeleteDialogOpen(true)
          }}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title={t('frc_console.list.deleteConsole', 'Delete Console')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }, [router, t])

  // Row action handler (keyboard shortcuts)
  const handleRowAction = useCallback((actionId: string, rowData: FrcConsoleRow) => {
    if (actionId === 'view' && rowData.id) {
      router.push(`/backend/frc-console/${rowData.id}`)
    } else if (actionId === 'delete' && rowData.id) {
      setConsoleToDelete(rowData)
      setDeleteDialogOpen(true)
    }
  }, [router])

  // Handle Ctrl+D to prevent browser bookmark dialog
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  // Wizard created handler
  const handleWizardCreated = useCallback(async () => {
    table.refresh()
    setShowWizard(false)
  }, [table])

  if (table.isLoading) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={8} />
      </div>
    )
  }

  return (
    <div>
      {/* Header with New Console button */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Truck Loading Console</h1>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Console
        </Button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          {...table.props}
          actionsRenderer={actionsRenderer}
          onRowAction={handleRowAction}
          keyboardShortcuts={{
            rowActions: [
              { id: 'view', label: t('frc_console.list.viewConsole', 'View console'), key: 'Enter', shift: true },
              { id: 'delete', label: t('frc_console.list.deleteConsole', 'Delete console'), key: 'd', ctrlOrCmd: true },
            ],
          }}
        />
      </div>

      {/* Console Wizard Drawer */}
      <ConsoleWizardDrawer
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={handleWizardCreated}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={consoleToDelete?.name}
        itemType="console"
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
        }}
      />
    </div>
  )
}
