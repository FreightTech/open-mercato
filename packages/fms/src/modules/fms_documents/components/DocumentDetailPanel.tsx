'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, CellEditSaveEvent } from '@open-mercato/ui/backend/dynamic-table'
import { Download, FileText, AlertTriangle, Save, Pencil, ThumbsUp, ThumbsDown, Send, Sparkles, Loader2, Wand2 } from 'lucide-react'
import { PagePreview } from './PagePreview'
import { PageThumbnails } from './PageThumbnails'
import { LinkedProjectBanner } from './LinkedProjectBanner'
import { getSectionsForType, buildFlatSections } from './document-section-configs'
import type { SectionConfig } from './document-section-configs'

interface DocumentDetailPanelProps {
  documentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  mainTableRef?: React.RefObject<HTMLDivElement | null>
  // File page mode props - when mode is 'file', shows "Apply to File" instead of "Save"
  mode?: 'documents' | 'file'
  onApplyToFile?: (extractedData: Record<string, unknown>) => void
  isApplyingToFile?: boolean
  onExtract?: (documentId: string) => Promise<void>
  isExtracting?: boolean
  documentCategory?: string | null
}

interface DocumentDetail {
  id: string
  name: string
  category: string | null
  description: string | null
  attachmentId: string
  extractedData: Record<string, unknown> | null
  documentData: Record<string, unknown> | null
  documentType: string | null
  documentTypeConfidence: number | null
  processingStatus: string
  processedAt: string | null
  editedBy: string | null
  editedAt: string | null
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

interface DocumentSectionProps {
  section: SectionConfig
  extractedData: Record<string, unknown>
  onCellChange?: (dataPath: string, prop: string, rowIndex: number, newValue: unknown) => void
}

function DocumentSection({ section, extractedData, onCellChange }: DocumentSectionProps) {
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
      const firstColKey = section.columns[0]?.data
      const rows = raw.map((item, idx) => ({
        id: `row-${idx}`,
        ...(typeof item === 'object' && item !== null
          ? item
          : firstColKey ? { [firstColKey]: item } : {}),
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

  const handleCellChange = useCallback((payload: CellEditSaveEvent) => {
    onCellChange?.(section.dataPath, payload.prop, payload.rowIndex, payload.newValue)
  }, [onCellChange, section.dataPath])

  useEventHandlers(
    { [TableEvents.CELL_EDIT_SAVE]: handleCellChange },
    tableRef as React.RefObject<HTMLElement>
  )

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
    booking_confirmation: 'Booking Confirmation',
    packing_list: 'Packing List',
    vgm_certificate: 'VGM Certificate',
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

function ExtractionInfoBar({
  documentId,
  documentType,
  confidence,
}: {
  documentId: string
  documentType: string | null
  confidence: number | null
}) {
  const [feedbackRating, setFeedbackRating] = useState<'good' | 'bad' | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  const feedbackMutation = useMutation({
    mutationFn: async (payload: { rating: 'good' | 'bad'; message: string; documentUrl: string }) => {
      const response = await apiCall(`/api/fms_documents/documents/${documentId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Failed to send feedback')
      return response.result
    },
    onSuccess: () => {
      setFeedbackSent(true)
    },
  })

  const handleSubmitFeedback = useCallback(() => {
    if (!feedbackRating) return
    const documentUrl = `${window.location.origin}/backend/fms-documents?doc=${documentId}`
    feedbackMutation.mutate({ rating: feedbackRating, message: feedbackMessage, documentUrl })
  }, [feedbackRating, feedbackMessage, feedbackMutation, documentId])

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getDocumentTypeBadge(documentType)}
          {getConfidenceBadge(confidence)}
        </div>
        {!feedbackSent && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Extraction quality:</span>
            <button
              onClick={() => setFeedbackRating(feedbackRating === 'good' ? null : 'good')}
              className={`p-1.5 rounded-md transition-colors ${
                feedbackRating === 'good'
                  ? 'bg-green-100 text-green-700'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title="Good extraction"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setFeedbackRating(feedbackRating === 'bad' ? null : 'bad')}
              className={`p-1.5 rounded-md transition-colors ${
                feedbackRating === 'bad'
                  ? 'bg-red-100 text-red-700'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title="Bad extraction"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {feedbackRating && !feedbackSent && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder={feedbackRating === 'bad' ? 'What was wrong with the extraction?' : 'Any comments? (optional)'}
            className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitFeedback() }}
            autoFocus
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSubmitFeedback}
            disabled={feedbackMutation.isPending}
          >
            {feedbackMutation.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      {feedbackSent && (
        <p className="text-xs text-green-600">Thank you for your feedback!</p>
      )}
    </div>
  )
}

export function DocumentDetailPanel({
  documentId,
  open,
  onOpenChange,
  mainTableRef,
  // File page mode props
  mode = 'documents',
  onApplyToFile,
  isApplyingToFile,
  onExtract,
  isExtracting,
  documentCategory,
}: DocumentDetailPanelProps) {
  const [selectedPage, setSelectedPage] = useState(1)
  const workingDataRef = useRef<Record<string, unknown> | null>(null)
  const isDirtyRef = useRef<boolean>(false)
  const lastInitializedRef = useRef<{
    documentId: string | null
    extractedDataRef: Record<string, unknown> | null
  }>({ documentId: null, extractedDataRef: null })
  const queryClient = useQueryClient()

  const { data: document, isLoading, error } = useQuery({
    queryKey: ['document-detail', documentId],
    queryFn: async (): Promise<DocumentDetail | null> => {
      if (!documentId) return null
      const response = await apiCall<DocumentDetail>(`/api/fms_documents/documents/${documentId}`)
      return response.ok ? (response.result as DocumentDetail) : null
    },
    enabled: !!documentId && open,
    refetchInterval: (query) => {
      const status = query.state.data?.processingStatus
      if (status === 'queued' || status === 'processing') return 3000
      return false
    },
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

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!documentId) throw new Error('No document')
      const response = await apiCall(`/api/fms_documents/documents/${documentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ documentData: data }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Failed to save')
      return response.result
    },
    onSuccess: () => {
      isDirtyRef.current = false
      queryClient.invalidateQueries({ queryKey: ['document-detail', documentId] })
    },
  })

  const totalPages = pagesData?.totalPages ?? 0
  const hasPages = totalPages > 0

  const imageUrlBase = documentId
    ? `/api/fms_documents/documents/${documentId}/pages`
    : ''

  // Compute working data — deep clone so DynamicTable can mutate in place
  const unwrappedData = useMemo(() => {
    // Prefer documentData (working copy), fall back to extractedData
    const source = document?.documentData ?? document?.extractedData
    if (!source) return null
    // Handle legacy format where extractedData wraps the actual data
    if ('data' in source && 'document_type' in source) {
      return JSON.parse(JSON.stringify(source.data)) as Record<string, unknown>
    }
    return JSON.parse(JSON.stringify(source)) as Record<string, unknown>
  }, [document?.documentData, document?.extractedData])

  // Keep a stable ref to the working data for save
  // Only reset working data when:
  // 1. Document ID changed (loading a different document)
  // 2. The actual extracted data reference changed (re-extraction happened)
  // 3. We haven't made any unsaved changes (not dirty)
  React.useEffect(() => {
    const isNewDocument = documentId !== lastInitializedRef.current.documentId
    const isReExtraction = document?.extractedData !== lastInitializedRef.current.extractedDataRef &&
      document?.extractedData !== undefined
    const shouldReset = isNewDocument || isReExtraction || !isDirtyRef.current

    if (shouldReset && unwrappedData) {
      workingDataRef.current = unwrappedData
      lastInitializedRef.current = {
        documentId: documentId,
        extractedDataRef: document?.extractedData ?? null,
      }
      isDirtyRef.current = false
    } else if (!workingDataRef.current && unwrappedData) {
      // Initial load case - always set if workingDataRef is null
      workingDataRef.current = unwrappedData
      lastInitializedRef.current = {
        documentId: documentId,
        extractedDataRef: document?.extractedData ?? null,
      }
    }
  }, [documentId, document?.extractedData, unwrappedData])

  // Clear dirty flag when panel closes
  React.useEffect(() => {
    if (!open) {
      isDirtyRef.current = false
    }
  }, [open])

  const sections = useMemo(() => {
    if (!unwrappedData) return []
    const docType = document?.documentType || (document?.extractedData as any)?.document_type || null
    const typed = getSectionsForType(docType)
    if (typed) return typed
    return buildFlatSections(unwrappedData)
  }, [unwrappedData, document?.documentType, document?.extractedData])

  const hasExtractedData = unwrappedData && Object.keys(unwrappedData).length > 0

  const handleCellChange = useCallback((dataPath: string, prop: string, rowIndex: number, newValue: unknown) => {
    if (!workingDataRef.current) return
    const data = workingDataRef.current

    if (!dataPath) {
      // Top-level field (e.g. invoice_number, currency)
      data[prop] = newValue
      isDirtyRef.current = true
      return
    }

    // Resolve nested path (e.g. 'seller', 'transportation.container_numbers')
    const parts = dataPath.split('.')
    let target: unknown = data
    for (const part of parts) {
      if (target == null || typeof target !== 'object') return
      const obj = target as Record<string, unknown>
      if (obj[part] === undefined) obj[part] = {}
      target = obj[part]
    }

    if (Array.isArray(target)) {
      // Array section: update the item at rowIndex
      const item = target[rowIndex]
      if (typeof item === 'object' && item !== null) {
        (item as Record<string, unknown>)[prop] = newValue
      } else {
        // Primitive array (e.g. container_numbers string array)
        target[rowIndex] = newValue
      }
      isDirtyRef.current = true
    } else if (typeof target === 'object' && target !== null) {
      // Object section: update the property directly
      (target as Record<string, unknown>)[prop] = newValue
      isDirtyRef.current = true
    }
  }, [])

  const handleSave = useCallback(() => {
    if (!workingDataRef.current) return
    saveMutation.mutate(workingDataRef.current)
  }, [saveMutation])

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
                  {document.editedAt && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                      <Pencil className="h-3 w-3 mr-1" />
                      Edited {new Date(document.editedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Badge>
                  )}
                  {/* Show "Apply to File" for file mode with booking confirmations, otherwise show "Save" */}
                  {mode === 'file' && (documentCategory ?? document.category) === 'booking_confirmation' && hasExtractedData && onApplyToFile ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        if (workingDataRef.current) {
                          onApplyToFile(workingDataRef.current)
                        }
                      }}
                      disabled={isApplyingToFile}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isApplyingToFile ? <Spinner className="h-4 w-4 mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
                      Apply to File
                    </Button>
                  ) : hasExtractedData && mode === 'documents' ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? <Spinner className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Save
                    </Button>
                  ) : null}
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

                  {document.processingStatus === 'queued' && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extraction queued — waiting to start...
                    </div>
                  )}

                  {document.processingStatus === 'processing' && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting document data with AI...
                    </div>
                  )}

                  {document.processingStatus === 'pending' && !hasExtractedData && mode === 'documents' && (
                    <div className="flex items-center gap-2 p-3 bg-muted border rounded-lg text-sm text-muted-foreground">
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      Not processed yet. Upload a PDF and enable AI extraction to see structured data.
                    </div>
                  )}

                  {/* AI Extraction Buttons - Only shown in file mode */}
                  {mode === 'file' && onExtract && documentId && (
                    <div className="space-y-3">
                      {!hasExtractedData ? (
                        <Button
                          variant="default"
                          className="w-full justify-start"
                          onClick={() => onExtract(documentId)}
                          disabled={isExtracting}
                        >
                          {isExtracting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Extracting Data...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Extract Data with AI
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => onExtract(documentId)}
                          disabled={isExtracting}
                        >
                          {isExtracting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Re-extracting...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Re-extract Data
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Extraction Info & Feedback */}
                  {hasExtractedData && (
                    <ExtractionInfoBar
                      documentId={document.id}
                      documentType={document.documentType}
                      confidence={document.documentTypeConfidence}
                    />
                  )}

                  {/* Linked Project Banner */}
                  <LinkedProjectBanner documentId={document.id} />

                  {/* Extracted Data Sections */}
                  {hasExtractedData && sections.map((section) => (
                    <DocumentSection
                      key={section.id}
                      section={section}
                      extractedData={unwrappedData!}
                      onCellChange={handleCellChange}
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
