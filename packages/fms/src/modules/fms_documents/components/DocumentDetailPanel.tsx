'use client'

import * as React from 'react'
import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  DynamicTable,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { Download, FileText, AlertTriangle } from 'lucide-react'
import { PagePreview } from './PagePreview'
import { PageThumbnails } from './PageThumbnails'
import { getSectionsForType, buildFlatSections } from './document-section-configs'
import type { SectionConfig } from './document-section-configs'

interface DocumentDetailPanelProps {
  documentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  mainTableRef?: React.RefObject<HTMLDivElement | null>
}

interface DocumentDetail {
  id: string
  name: string
  category: string | null
  description: string | null
  attachmentId: string
  extractedData: Record<string, unknown> | null
  documentType: string | null
  documentTypeConfidence: number | null
  processingStatus: string
  processedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface PagesResponse {
  documentId: string
  totalPages: number
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value || '-'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ')
    }
    return `${value.length} item${value.length !== 1 ? 's' : ''}`
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function resolveDataPath(data: Record<string, unknown>, path: string): unknown {
  if (!path) return data
  const parts = path.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    return Object.values(obj).every(isEmptyValue)
  }
  return false
}

function DocumentSection({ section, extractedData }: { section: SectionConfig; extractedData: Record<string, unknown> }) {
  const tableRef = useRef<HTMLDivElement>(null)

  const { tableData, columns } = useMemo(() => {
    if (section.type === 'flat') {
      const flatRows: Array<{ id: string; field: string; value: string }> = []
      for (const [key, value] of Object.entries(extractedData)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
            if (!isEmptyValue(subValue)) {
              flatRows.push({
                id: `${key}.${subKey}`,
                field: `${formatFieldLabel(key)} > ${formatFieldLabel(subKey)}`,
                value: formatFieldValue(subValue),
              })
            }
          }
        } else if (!isEmptyValue(value)) {
          flatRows.push({
            id: key,
            field: formatFieldLabel(key),
            value: formatFieldValue(value),
          })
        }
      }
      return { tableData: flatRows, columns: section.columns }
    }

    const raw = resolveDataPath(extractedData, section.dataPath)
    if (isEmptyValue(raw)) return { tableData: [], columns: section.columns }

    if (section.type === 'array') {
      if (!Array.isArray(raw)) return { tableData: [], columns: section.columns }
      const rows = raw.map((item, idx) => ({
        id: `row-${idx}`,
        ...(typeof item === 'object' && item !== null ? item : {}),
      }))
      return { tableData: rows, columns: section.columns }
    }

    // type === 'object'
    if (typeof raw !== 'object' || raw === null) return { tableData: [], columns: section.columns }

    // For header sections (dataPath = ''), only include columns that have data
    const obj = raw as Record<string, unknown>
    const colsWithData = section.columns.filter((col) => !isEmptyValue(obj[col.data]))
    if (colsWithData.length === 0) return { tableData: [], columns: section.columns }

    // Format array values for display in object mode
    const processedObj: Record<string, unknown> = {}
    for (const col of colsWithData) {
      const val = obj[col.data]
      processedObj[col.data] = Array.isArray(val) ? val.join(', ') : val
    }

    return {
      tableData: [{ id: 'row-0', ...processedObj }],
      columns: colsWithData,
    }
  }, [section, extractedData])

  if (tableData.length === 0) return null

  return (
    <div>
      <Label className="text-sm font-semibold mb-2 block">{section.label}</Label>
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns as ColumnDef[]}
        tableName={section.label}
        idColumnName="id"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideAddRowButton: true,
          hideToolbar: true,
          hideBottomBar: true,
          hideActionsColumn: true,
        }}
      />
    </div>
  )
}

function getDocumentTypeBadge(documentType: string | null) {
  if (!documentType) return null
  const labels: Record<string, string> = {
    invoice: 'Invoice',
    bill_of_lading: 'Bill of Lading',
    customs_declaration: 'Customs Declaration',
    delivery_note: 'Delivery Note',
    unknown: 'Unknown',
  }
  return (
    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
      {labels[documentType] || documentType.replace(/_/g, ' ')}
    </Badge>
  )
}

function getConfidenceBadge(confidence: number | null) {
  if (confidence == null) return null
  if (confidence >= 80) {
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">High ({confidence}%)</Badge>
  }
  if (confidence >= 50) {
    return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">Medium ({confidence}%)</Badge>
  }
  return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">Low ({confidence}%)</Badge>
}

export function DocumentDetailPanel({
  documentId,
  open,
  onOpenChange,
  mainTableRef,
}: DocumentDetailPanelProps) {
  const [selectedPage, setSelectedPage] = useState(1)

  const { data: document, isLoading, error } = useQuery({
    queryKey: ['document-detail', documentId],
    queryFn: async (): Promise<DocumentDetail | null> => {
      if (!documentId) return null
      const response = await apiCall<DocumentDetail>(`/api/fms_documents/documents/${documentId}`)
      return response.ok ? (response.result as DocumentDetail) : null
    },
    enabled: !!documentId && open,
  })

  const { data: pagesData } = useQuery({
    queryKey: ['document-pages', documentId],
    queryFn: async (): Promise<PagesResponse | null> => {
      if (!documentId) return null
      const response = await apiCall<PagesResponse>(`/api/fms_documents/documents/${documentId}/pages`)
      return response.ok ? (response.result as PagesResponse) : null
    },
    enabled: !!documentId && open,
  })

  const totalPages = pagesData?.totalPages ?? 0
  const hasPages = totalPages > 0

  const imageUrlBase = documentId
    ? `/api/fms_documents/documents/${documentId}/pages`
    : ''

  const unwrappedData = useMemo(() => {
    if (!document?.extractedData) return null
    // Handle legacy format where extractedData wraps the actual data
    const raw = document.extractedData
    if ('data' in raw && 'document_type' in raw) {
      return raw.data as Record<string, unknown>
    }
    return raw
  }, [document?.extractedData])

  const sections = useMemo(() => {
    if (!unwrappedData) return []
    const docType = document?.documentType || (document?.extractedData as any)?.document_type || null
    const typed = getSectionsForType(docType)
    if (typed) return typed
    return buildFlatSections(unwrappedData)
  }, [unwrappedData, document?.documentType, document?.extractedData])

  const hasExtractedData = unwrappedData && Object.keys(unwrappedData).length > 0

  const handleOpenAutoFocus = React.useCallback((event: Event) => {
    event.preventDefault()
  }, [])

  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      event.preventDefault()
      mainTableRef?.current?.focus()
    },
    [mainTableRef]
  )

  // Reset selected page when opening a new document
  React.useEffect(() => {
    if (open) setSelectedPage(1)
  }, [documentId, open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        fullWidth
        className="p-0"
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Spinner className="h-8 w-8" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-destructive">
            Failed to load document
          </div>
        )}

        {document && (
          <div className="flex h-full w-full">
            {/* Left Panel - Page Preview */}
            {hasPages && documentId && (
              <div className="flex-shrink-0 border-r flex flex-col h-full bg-muted/30" style={{ width: '50%' }}>
                <PagePreview
                  entityId={documentId}
                  imageUrlBase={imageUrlBase}
                  pageNumber={selectedPage}
                  totalPages={totalPages}
                  className="flex-1"
                />
                <PageThumbnails
                  entityId={documentId}
                  imageUrlBase={imageUrlBase}
                  totalPages={totalPages}
                  selectedPage={selectedPage}
                  onSelectPage={setSelectedPage}
                  className="flex-shrink-0"
                />
              </div>
            )}

            {/* Right Panel - Document Details */}
            <div className="flex-1 flex flex-col h-full min-w-0">
              {/* Header */}
              <div className="flex-shrink-0 border-b bg-background px-6 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold truncate flex-1">{document.name}</h2>
                  {getDocumentTypeBadge(document.documentType)}
                  {getConfidenceBadge(document.documentTypeConfidence)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.open(`/api/fms_documents/documents/${document.id}/download`, '_blank')
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">
                  {/* Processing Status Messages */}
                  {document.processingStatus === 'failed' && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      Document processing failed. Try re-extracting the document.
                    </div>
                  )}

                  {document.processingStatus === 'processing' && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                      <Spinner className="h-4 w-4" />
                      Document is being processed...
                    </div>
                  )}

                  {document.processingStatus === 'pending' && !hasExtractedData && (
                    <div className="flex items-center gap-2 p-3 bg-muted border rounded-lg text-sm text-muted-foreground">
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      Not processed yet. Upload a PDF and enable AI extraction to see structured data.
                    </div>
                  )}

                  {/* Extracted Data Sections */}
                  {hasExtractedData && sections.map((section) => (
                    <DocumentSection
                      key={section.id}
                      section={section}
                      extractedData={unwrappedData!}
                    />
                  ))}

                  {/* Metadata footer */}
                  {document.processedAt && (
                    <div className="text-xs text-muted-foreground border-t pt-4">
                      Processed at{' '}
                      {new Date(document.processedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
