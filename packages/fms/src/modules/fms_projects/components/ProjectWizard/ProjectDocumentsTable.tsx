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
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Upload, Trash2, FileText } from 'lucide-react'

// Badge is kept for empty state and table title

export interface ProjectDocument {
  id: string
  name: string
  category: string
  description?: string | null
  createdAt: string
  processedAt?: string | null
  // extractedData contains the raw extracted fields directly (not wrapped)
  extractedData?: Record<string, unknown> | null
  // consensusConfidence is stored separately on the document entity
  consensusConfidence?: string | null
  attachment?: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
  } | null
}

type ProjectDocumentsTableProps = {
  documents: ProjectDocument[]
  isLoading: boolean
  onDocumentUpdate: (documentId: string, field: string, value: unknown) => void
  onUpload: () => void
  onRemoveDocument: (documentId: string) => void
  onDocumentClick: (document: ProjectDocument) => void
  extractingDocumentId?: string | null
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  booking_confirmation: 'Booking Confirmation',
  invoice: 'Invoice',
  bill_of_lading: 'Bill of Lading',
  customs: 'Customs',
  customs_declaration: 'Customs Declaration',
  delivery_note: 'Delivery Note',
  packing_list: 'Packing List',
  vgm_certificate: 'VGM Certificate',
  offer: 'Offer',
  other: 'Other',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProjectDocumentsTable({
  documents,
  isLoading,
  onDocumentUpdate,
  onUpload,
  onRemoveDocument,
  onDocumentClick,
  extractingDocumentId,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
}: ProjectDocumentsTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null)

  const handleNameClick = useCallback(
    (e: React.MouseEvent, doc: ProjectDocument) => {
      e.preventDefault()
      e.stopPropagation()
      onDocumentClick(doc)
    },
    [onDocumentClick]
  )

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: 'Document Name',
      width: 300,
      type: 'text',
      readOnly: true,
      renderer: (value: any, rowData: any) => {
        const doc = rowData._raw as ProjectDocument
        return (
          <button
            onClick={(e) => handleNameClick(e, doc)}
            className="text-left text-primary hover:underline truncate w-full"
            title={doc.name}
          >
            {doc.name}
          </button>
        )
      },
    },
    {
      data: 'categoryLabel',
      title: 'Type',
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'uploadedAt',
      title: 'Date',
      width: 120,
      type: 'text',
      readOnly: true,
    },
  ], [handleNameClick])

  const tableData = useMemo(() => {
    return documents.map((doc) => {
      return {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        categoryLabel: CATEGORY_LABELS[doc.category] || doc.category,
        uploadedAt: formatDate(doc.createdAt),
        _raw: doc,
      }
    })
  }, [documents])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onDocumentUpdate(payload.id as string, payload.prop, payload.newValue)

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  const handleRemoveDocument = useCallback(
    (documentId: string) => {
      setDocumentToDelete(documentId)
      setDeleteConfirmOpen(true)
    },
    []
  )

  const handleConfirmDelete = useCallback(() => {
    if (documentToDelete) {
      onRemoveDocument(documentToDelete)
    }
    setDeleteConfirmOpen(false)
    setDocumentToDelete(null)
  }, [documentToDelete, onRemoveDocument])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setDocumentToDelete(null)
  }, [])

  if (isLoading) {
    return <TableSkeleton rows={3} columns={3} />
  }

  // Title content for top bar
  const titleContent = (
    <div className="flex items-center gap-2">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">Documents</span>
      <Badge variant="secondary">{documents.length}</Badge>
    </div>
  )

  // Buttons for top bar
  const toolbarButtons = (
    <Button onClick={onUpload} size="sm" variant="outline">
      <Upload className="h-4 w-4 mr-1" />
      Upload
    </Button>
  )

  // Empty state
  if (documents.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          {titleContent}
          {toolbarButtons}
        </div>
        <div className="p-6 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
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
          tableName=""
          idColumnName="id"
          width="100%"
          colHeaders={true}
          rowHeaders={false}
          stretchColumns={true}
          autoSelectOnFocus={autoSelectOnFocus}
          siblingTableRefs={siblingTableRefs}
          uiConfig={{
            hideSearch: true,
            hideAddRowButton: true,
            hideBottomBar: true,
            hideFilterPopover: true,
            hideSortButton: true,
            topBarStart: titleContent,
            topBarEnd: toolbarButtons,
          }}
          actionsRenderer={(rowData: Record<string, unknown>) => {
            const doc = rowData._raw as ProjectDocument

            return (
              <div className="flex items-center justify-center">
                <button
                  onClick={() => handleRemoveDocument(doc.id)}
                  className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                  title="Remove document"
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
            <DialogTitle>Remove Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this document from the project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
