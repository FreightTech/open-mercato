'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Eye } from 'lucide-react'
import Link from 'next/link'
import {
  DynamicTable,
  TableSkeleton,
  TableEvents,
  dispatch,
  useEventHandlers,
  useFilterSuggestions,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  FilterRow,
  ColumnDef,
  NewRowSaveEvent,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ConfirmDeleteDialog } from '../../../../lib/components/ConfirmDeleteDialog'

interface FrcContractorRow {
  id: string
  name: string
  isActive: boolean
  primaryContactName: string | null
  primaryContactEmail: string | null
  createdAt: string
  updatedAt: string
}

// Name renderer with link to detail page
const NameLinkRenderer = (value: string, row: FrcContractorRow) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  if (!row?.id) return <span>{value}</span>
  return (
    <Link
      href={`/backend/frc-contractors/${row.id}`}
      className="text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </Link>
  )
}

const COLUMNS: ColumnDef[] = [
  { data: 'name', title: 'Name', width: 250, type: 'text', renderer: (value: unknown, row?: unknown) => NameLinkRenderer(value as string, row as FrcContractorRow) },
  { data: 'primaryContactName', title: 'Contact Name', width: 150, type: 'text' },
  { data: 'primaryContactEmail', title: 'Contact Email', width: 180, type: 'text' },
  { data: 'isActive', title: 'Active', width: 80, type: 'boolean' },
]

// Global ref for delete handler
let onDeleteHandler: ((contractor: FrcContractorRow) => void) | null = null

function setDeleteHandler(handler: ((contractor: FrcContractorRow) => void) | null) {
  onDeleteHandler = handler
}

const DeleteButton = ({ row }: { row: FrcContractorRow }) => {
  if (!row.id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onDeleteHandler) {
          onDeleteHandler(row)
        }
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete Contractor"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

export default function FrcContractorsPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Filter suggestions for autocomplete
  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'contractors:contractor',
  })

  // Table state
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterRow[]>([])

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contractorToDelete, setContractorToDelete] = useState<FrcContractorRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Register delete handler for action renderer
  const openDeleteDialog = useCallback((contractor: FrcContractorRow) => {
    setContractorToDelete(contractor)
    setDeleteDialogOpen(true)
  }, [])

  useEffect(() => {
    setDeleteHandler(openDeleteDialog)
    return () => {
      setDeleteHandler(null)
    }
  }, [openDeleteDialog])

  const handleDeleteConfirm = useCallback(async () => {
    if (!contractorToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/frc_contractors/contractors/${contractorToDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        flash('Contractor deleted', 'success')
        setDeleteDialogOpen(false)
        setContractorToDelete(null)
        queryClient.invalidateQueries({ queryKey: ['frc_contractors'] })
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
  }, [contractorToDelete, queryClient])

  const actionsRenderer = useCallback((rowData: FrcContractorRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <div className="flex items-center gap-1">
        <Link
          href={`/backend/frc-contractors/${rowData.id}`}
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

  // Handle row click - navigate to detail page
  const handleRowClick = useCallback((rowData: FrcContractorRow) => {
    if (rowData.id) {
      router.push(`/backend/frc-contractors/${rowData.id}`)
    }
  }, [router])

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'View contractor details', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete contractor', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  const handleRowAction = useCallback((actionId: string, rowData: FrcContractorRow) => {
    if (actionId === 'view' && rowData.id) {
      handleRowClick(rowData)
    } else if (actionId === 'delete' && rowData.id) {
      openDeleteDialog(rowData)
    }
  }, [openDeleteDialog, handleRowClick])

  // Prevent browser from intercepting Cmd+D (bookmark shortcut)
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
    }
  }, [])

  // Query params
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
    queryKey: ['frc_contractors', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: FrcContractorRow[]; total: number }>(
        `/api/frc_contractors/contractors?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load contractors')
      return call.result ?? { items: [], total: 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  const tableData = useMemo(() => data?.items ?? [], [data?.items])

  // Handle inline row creation
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    const { rowIndex, rowData } = payload

    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, { rowIndex })

    try {
      const contractorData = {
        name: rowData.name?.trim() || '',
        isActive: rowData.isActive !== false,
        // Primary contact fields for inline creation
        primaryContactName: rowData.primaryContactName?.trim() || null,
        primaryContactEmail: rowData.primaryContactEmail?.trim() || null,
      }

      if (!contractorData.name) {
        throw new Error('Contractor name is required')
      }

      const createResponse = await apiCall<{ id: string; error?: string }>(
        '/api/frc_contractors/contractors',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractorData),
        }
      )

      if (!createResponse.ok || !createResponse.result?.id) {
        const error = createResponse.result?.error || 'Failed to create contractor'
        throw new Error(error)
      }

      flash('Contractor created', 'success')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex,
        savedRowData: { ...contractorData, id: createResponse.result.id },
      })

      queryClient.invalidateQueries({ queryKey: ['frc_contractors'] })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create contractor'
      flash(errorMessage, 'error')

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex,
        error: errorMessage,
      })
    }
  }, [queryClient])

  useEventHandlers(
    {
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,

      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          const response = await apiCall<{ error?: string }>(
            `/api/frc_contractors/contractors/${payload.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [payload.prop]: payload.newValue }),
            }
          )

          if (response.ok) {
            flash('Contractor updated', 'success')
            dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
              rowIndex: payload.rowIndex,
              colIndex: payload.colIndex,
            } as CellSaveSuccessEvent)
            queryClient.invalidateQueries({ queryKey: ['frc_contractors'] })
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
        setSortDir(payload.direction || 'asc')
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
    },
    tableRef as React.RefObject<HTMLElement>
  )

  if (isLoading && !data) {
    return (
      <div style={{ height: 'calc(100vh - 110px)' }}>
        <TableSkeleton rows={10} columns={7} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div onKeyDown={handleTableKeyDown}>
        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={COLUMNS}
          tableName="Contractors"
          idColumnName="id"
          height="calc(100vh - 200px)"
          stretchColumns={true}
          colHeaders={true}
          rowHeaders={true}
          actionsRenderer={actionsRenderer}
          keyboardShortcuts={keyboardShortcuts}
          onRowAction={handleRowAction}
          loadFilterSuggestions={loadFilterSuggestions}
          uiConfig={{
            hideAddRowButton: false,
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
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        itemName={contractorToDelete?.name}
        itemType="contractor"
        isDeleting={isDeleting}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          tableRef.current?.focus()
        }}
      />
    </div>
  )
}
