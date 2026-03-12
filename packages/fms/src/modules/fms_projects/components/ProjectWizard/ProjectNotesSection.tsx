'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DynamicTable,
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
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Trash2 } from 'lucide-react'

type ProjectNote = {
  id: string
  projectId: string
  body: string
  authorUserId?: string | null
  authorName?: string | null
  createdAt: string
  updatedAt: string
}

type ProjectNotesResponse = {
  items?: ProjectNote[]
  total?: number
}

type ProjectNotesSectionProps = {
  projectId: string
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export function ProjectNotesSection({
  projectId,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
}: ProjectNotesSectionProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const queryClient = useQueryClient()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['fms_project_notes', projectId],
    queryFn: async () => {
      const response = await apiCall<ProjectNotesResponse>(
        `/api/fms_projects/projects/${projectId}/notes`
      )
      if (!response.ok) throw new Error('Failed to load notes')
      return response.result?.items ?? []
    },
    enabled: !!projectId,
  })

  const notes = data ?? []

  // Table columns definition
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'body',
      title: 'Note',
      width: 500,
      type: 'text',
    },
    {
      data: 'authorName',
      title: 'Author',
      width: 120,
      type: 'text',
      readOnly: true,
    },
  ], [])

  // Table data
  const tableData = useMemo(() => {
    return notes.map(note => ({
      id: note.id,
      body: note.body,
      authorName: note.authorName ?? '',
    }))
  }, [notes])

  // Handle cell edit save
  const handleCellSave = useCallback(async (payload: CellEditSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex: payload.rowIndex,
      colIndex: payload.colIndex,
    } as CellSaveStartEvent)

    try {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id,
          [payload.prop]: payload.newValue === '' ? null : payload.newValue,
        }),
      })

      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Update failed'
        throw new Error(errorMsg)
      }

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
      } as CellSaveSuccessEvent)

      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed'
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
        error: errorMessage,
      } as CellSaveErrorEvent)
      flash(errorMessage, 'error')
    }
  }, [projectId, refetch, tableRef])

  // Handle new row save
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, {
      rowIndex: payload.rowIndex,
    })

    try {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: payload.rowData.body || '',
        }),
      })

      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save'
        throw new Error(errorMsg)
      }

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        savedRowData: response.result,
      } as NewRowSaveSuccessEvent)

      flash('Note added', 'success')
      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        error: errorMessage,
      } as NewRowSaveErrorEvent)
      flash(errorMessage, 'error')
    }
  }, [projectId, refetch, tableRef])

  // Handle delete note - open confirmation dialog
  const handleDeleteNote = useCallback((noteId: string) => {
    setNoteToDelete(noteId)
    setDeleteConfirmOpen(true)
  }, [])

  // Confirm delete handler
  const handleConfirmDelete = useCallback(async () => {
    if (!noteToDelete) return

    try {
      const response = await apiCall(
        `/api/fms_projects/projects/${projectId}/notes?id=${noteToDelete}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        throw new Error('Failed to delete note')
      }

      flash('Note deleted', 'success')
      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Delete failed'
      flash(errorMessage, 'error')
    } finally {
      setDeleteConfirmOpen(false)
      setNoteToDelete(null)
    }
  }, [noteToDelete, projectId, refetch])

  // Cancel delete handler
  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setNoteToDelete(null)
  }, [])

  // Event handlers for DynamicTable
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: handleCellSave,
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Generate key to force re-render when data changes
  const tableKey = useMemo(() => {
    if (notes.length === 0) return 'empty'
    return `project-notes-${notes.map(n => `${n.id}-${n.body?.substring(0, 10)}`).join('-')}`
  }, [notes])

  // Calculate dynamic height based on number of rows
  const tableHeight = useMemo(() => {
    const rowHeight = 40
    const headerHeight = 40
    const toolbarHeight = 40
    const minHeight = 160
    const maxHeight = 400
    const contentHeight = toolbarHeight + headerHeight + ((tableData.length + 1) * rowHeight) + 20
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  if (isLoading) {
    return (
      <div style={{ height: 120 }}>
        <DynamicTable
          tableRef={tableRef}
          data={[]}
          columns={columns}
          tableName="Notes"
          idColumnName="id"
          width="100%"
          height="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          uiConfig={{
            hideToolbar: false,
            hideSearch: true,
            hideFilterButton: true,
            hideAddRowButton: false,
            hideBottomBar: true,
            hideActionsColumn: true,
          }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg" style={{ height: tableHeight }}>
        <DynamicTable
          key={tableKey}
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Notes"
          idColumnName="id"
          width="100%"
          height="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          autoSelectOnFocus={autoSelectOnFocus}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideToolbar: false,
            hideSearch: true,
            hideFilterButton: true,
            hideAddRowButton: false,
            hideBottomBar: true,
          }}
          actionsRenderer={(rowData: Record<string, unknown>) => {
            // Don't show delete button for new rows
            if (rowData._isNew) return null
            return (
              <button
                onClick={() => handleDeleteNote(rowData.id as string)}
                className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                title="Delete note"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )
          }}
        />
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
