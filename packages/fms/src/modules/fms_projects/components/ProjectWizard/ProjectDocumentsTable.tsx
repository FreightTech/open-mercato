'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
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
  Upload,
  Trash2,
  FileText,
} from 'lucide-react'

export interface ProjectDocument {
  id: string
  name: string
  category: string
  description?: string | null
  createdAt: string
  processedAt?: string | null
  extractedData?: {
    success: boolean
    document_type: string
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    data: Record<string, unknown>
    raw_text?: string
    processing_time_ms: number
  } | null
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
}

const CATEGORY_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  bill_of_lading: 'Bill of Lading',
  customs: 'Customs',
  offer: 'Offer',
  other: 'Other',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
}: ProjectDocumentsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

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
      title: 'Name',
      width: 220,
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
      title: 'Category',
      width: 120,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'fileSize',
      title: 'Size',
      width: 80,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'uploadedAt',
      title: 'Uploaded',
      width: 120,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'statusBadge',
      title: 'Status',
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: any) => {
        const status = value as string
        const isExtracting = status === 'Extracting...'
        const isExtracted = status === 'Extracted'
        return (
          <Badge
            variant={isExtracting ? 'outline' : isExtracted ? 'default' : 'secondary'}
            className="text-xs"
          >
            {status}
          </Badge>
        )
      },
    },
    {
      data: 'confidenceBadge',
      title: 'Confidence',
      width: 90,
      type: 'text',
      readOnly: true,
      renderer: (value: any) => {
        const confidence = value as string
        if (confidence === '-') return <span className="text-muted-foreground">-</span>
        return (
          <Badge
            variant={
              confidence === 'HIGH' ? 'default' :
              confidence === 'MEDIUM' ? 'secondary' : 'destructive'
            }
            className="text-xs"
          >
            {confidence}
          </Badge>
        )
      },
    },
  ], [handleNameClick])

  const tableData = useMemo(() => {
    return documents.map((doc) => {
      const isExtracted = !!doc.extractedData?.success
      const isExtracting = extractingDocumentId === doc.id

      return {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        categoryLabel: CATEGORY_LABELS[doc.category] || doc.category,
        fileSize: doc.attachment ? formatFileSize(doc.attachment.fileSize) : '-',
        uploadedAt: formatDate(doc.createdAt),
        statusBadge: isExtracting ? 'Extracting...' : isExtracted ? 'Extracted' : 'Pending',
        confidenceBadge: doc.extractedData?.confidence || '-',
        _raw: doc,
      }
    })
  }, [documents, extractingDocumentId])

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
      if (confirm('Remove this document from the project?')) {
        onRemoveDocument(documentId)
      }
    },
    [onRemoveDocument]
  )

  if (isLoading) {
    return <TableSkeleton rows={3} columns={6} />
  }

  if (documents.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No documents uploaded yet</p>
        <Button onClick={onUpload} size="sm" variant="outline" className="mt-2">
          <Upload className="h-4 w-4 mr-1" />
          Upload Document
        </Button>
      </div>
    )
  }

  const tableHeight = Math.min(Math.max(documents.length * 40 + 100, 150), 300)

  const toolbarButtons = (
    <Button onClick={onUpload} size="sm" variant="outline">
      <Upload className="h-4 w-4 mr-1" />
      Upload
    </Button>
  )

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName="Documents"
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          topBarEnd: toolbarButtons,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => {
          const doc = rowData._raw as ProjectDocument

          return (
            <div className="flex items-center justify-center">
              {/* Only delete button in actions */}
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
  )
}
