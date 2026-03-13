'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Download, Trash2, Plus } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { DocumentDetailPanel } from '../../components/DocumentDetailPanel'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { useTableConfig } from '../../components/useTableConfig'
import { DocumentUploadDialog } from '../../components/DocumentUploadDialog'

interface FmsDocumentRow {
  id: string
  name: string
  category?: string | null
  description?: string | null
  attachmentId: string
  documentType?: string | null
  documentNumber?: string | null
  blNumber?: string | null
  bookingNumber?: string | null
  vesselName?: string | null
  portOfLoading?: string | null
  portOfDischarge?: string | null
  sellerName?: string | null
  totalGrossAmount?: string | null
  currency?: string | null
  createdAt: string
  updatedAt: string
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    offer: 'bg-blue-100 text-blue-800',
    invoice: 'bg-green-100 text-green-800',
    customs_declaration: 'bg-purple-100 text-purple-800',
    bill_of_lading: 'bg-orange-100 text-orange-800',
    booking_confirmation: 'bg-blue-100 text-blue-800',
    delivery_note: 'bg-teal-100 text-teal-800',
    packing_list: 'bg-cyan-100 text-cyan-800',
    vgm_certificate: 'bg-yellow-100 text-yellow-800',
    other: 'bg-gray-100 text-gray-800',
  }
  return colors[category] || 'bg-gray-100 text-gray-800'
}

const CategoryBadgeRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const displayValue = value.replace(/_/g, ' ')
  return (
    <span
      className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full capitalize max-w-full overflow-hidden ${getCategoryColor(value)}`}
    >
      <span className="truncate">{displayValue}</span>
    </span>
  )
}

const DownloadLinkRenderer = ({ rowData }: { rowData: FmsDocumentRow }) => {
  if (!rowData.id) return <span>-</span>
  return (
    <a
      href={`/api/fms_documents/documents/${rowData.id}/download`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
      title="Download document"
    >
      <Download className="h-3.5 w-3.5" />
      <span className="text-xs">Download</span>
    </a>
  )
}

const DocumentTypeBadgeRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>
  const displayValue = value.replace(/_/g, ' ')
  const typeColors: Record<string, string> = {
    invoice: 'bg-green-50 text-green-700 border-green-200',
    bill_of_lading: 'bg-orange-50 text-orange-700 border-orange-200',
    packing_list: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    customs_declaration: 'bg-purple-50 text-purple-700 border-purple-200',
    booking_confirmation: 'bg-blue-50 text-blue-700 border-blue-200',
    vgm_certificate: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  }
  const colorClass = typeColors[value] || 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border capitalize truncate ${colorClass}`}>
      {displayValue}
    </span>
  )
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CategoryBadgeRenderer: (value) => <CategoryBadgeRenderer value={value} />,
  DownloadLinkRenderer: (_value, rowData) => <DownloadLinkRenderer rowData={rowData} />,
  DocumentTypeBadgeRenderer: (value) => <DocumentTypeBadgeRenderer value={value} />,
}

export default function FmsDocumentsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const selectedDocumentId = searchParams.get('doc')

  const setSelectedDocumentId = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('doc', id)
    } else {
      params.delete('doc')
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)

  const { data: tableConfig, isLoading: configLoading } = useTableConfig('fms_documents')

  // Name renderer that opens the detail drawer
  const nameRenderer = useCallback((value: string, rowData: FmsDocumentRow) => {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setSelectedDocumentId(rowData.id)
        }}
        className="text-left text-blue-600 hover:text-blue-800 hover:underline truncate max-w-full"
        title={value}
      >
        {value}
      </button>
    )
  }, [setSelectedDocumentId])

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []

    // Add download column after the base columns
    const baseColumns = tableConfig.columns.map((col) => {
      // Make name column clickable
      if (col.data === 'name') {
        return {
          ...col,
          type: col.type === 'checkbox' ? 'boolean' : col.type,
          renderer: nameRenderer,
        }
      }
      return {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
        renderer: col.renderer ? RENDERERS[col.renderer] : undefined,
      }
    }) as ColumnDef[]

    // Add download column
    baseColumns.push({
      data: 'download',
      title: 'Download',
      width: 90,
      readOnly: true,
      renderer: (_value: unknown, rowData: FmsDocumentRow) => <DownloadLinkRenderer rowData={rowData} />,
    })

    return baseColumns
  }, [tableConfig, nameRenderer])

  const uploadButton = useMemo(() => (
    <Button onClick={() => setIsUploadDialogOpen(true)} size="sm">
      <Plus className="h-4 w-4 mr-1" />
      Upload Document
    </Button>
  ), [])

  const table = useDynamicTablePage<FmsDocumentRow>({
    source: '/api/fms_documents/documents',
    columns,
    tableName: 'Documents',
    perspectives: 'fms_documents',
    filterSuggestions: 'fms_documents:fms_document',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    delete: { title: 'Delete Document', nameColumn: 'name' },
    queryKey: 'fms_documents',
    tableProps: {
      height: 'fill',
      stretchColumns: false,
      enableComments: true,
      commentsEntityType: 'fms_document',
      commentsViewContext: 'fms_documents',
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        readOnlyStyle: 'normal',
        topBarEnd: uploadButton,
        borderless: true,
      },
      keyboardShortcuts: {
        rowActions: [
          { id: 'view', label: 'Open document details', key: 'Enter', shift: true },
          { id: 'delete', label: 'Delete document', key: 'd', ctrlOrCmd: true },
        ],
      },
    },
  })

  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as FmsDocumentRow
    if (!row.id) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          table.setRowToDelete(row)
        }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [table.setRowToDelete])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FmsDocumentRow
    if (actionId === 'view') {
      setSelectedDocumentId(row.id)
    } else if (actionId === 'delete') {
      table.setRowToDelete(row)
    }
  }, [setSelectedDocumentId, table.setRowToDelete])

  const handleDocumentUploaded = useCallback((documentId?: string) => {
    table.refresh()
    setIsUploadDialogOpen(false)
    if (documentId) {
      setSelectedDocumentId(documentId)
    }
  }, [table.refresh, setSelectedDocumentId])

  if (configLoading || table.isLoading) {
    return (
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TableSkeleton />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        actionsRenderer={actionsRenderer}
        onRowAction={handleRowAction}
      />

      {table.deleteDialog}

      <DocumentUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onSuccess={handleDocumentUploaded}
      />

      <DocumentDetailPanel
        documentId={selectedDocumentId}
        open={!!selectedDocumentId}
        onOpenChange={(open) => { if (!open) setSelectedDocumentId(null) }}
        mainTableRef={table.props.tableRef as React.RefObject<HTMLDivElement | null>}
      />
    </div>
  )
}
