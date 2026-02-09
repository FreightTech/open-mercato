'use client'

import * as React from 'react'
import { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ChevronUp,
  Eye,
} from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues with react-json-view
const ReactJson = dynamic(() => import('react-json-view'), { ssr: false })

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  projectId?: string // Optional: link documents to a project for invoice extraction
  relatedEntityId?: string // Optional: link documents to a related entity
  relatedEntityType?: string // Optional: type of the related entity (e.g., 'fms_offers:fms_quote')
}

interface ExtractionResult {
  success: boolean
  document_type?: string
  confidence?: string
  data?: Record<string, unknown>
  invoice?: {
    id: string
    invoiceNumber?: string
    sellerName?: string
    grossAmount?: string
    confidence?: string
    lineItems?: Array<{ description?: string; amount?: string }>
  }
}

interface FileUploadItem {
  id: string
  file: File
  category: string
  status: 'pending' | 'uploading' | 'extracting' | 'success' | 'error'
  error?: string
  documentId?: string
  extractionResult?: ExtractionResult | null
  extractionError?: string | null
}

const DOCUMENT_CATEGORIES = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'customs', label: 'Customs Declaration' },
  { value: 'offer', label: 'Offer' },
  { value: 'other', label: 'Other' },
]

function detectCategory(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('invoice') || lower.includes('faktura')) return 'invoice'
  if (lower.includes('bl') || lower.includes('bill') || lower.includes('lading')) return 'bill_of_lading'
  if (lower.includes('customs') || lower.includes('declaration') || lower.includes('sad')) return 'customs'
  if (lower.includes('offer') || lower.includes('quote')) return 'offer'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


export function DocumentUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  projectId,
  relatedEntityId,
  relatedEntityType,
}: DocumentUploadDialogProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [enableExtraction, setEnableExtraction] = useState(true)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [successCallbackCalled, setSuccessCallbackCalled] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx']
    const fileArray = Array.from(newFiles)

    const validFiles = fileArray.filter((file) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
      return validTypes.includes(ext)
    })

    if (validFiles.length < fileArray.length) {
      flash('Some files were skipped (unsupported format)', 'warning')
    }

    const newItems: FileUploadItem[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      file,
      category: detectCategory(file.name),
      status: 'pending',
    }))

    setFiles((prev) => [...prev, ...newItems])
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const updateFileCategory = useCallback((id: string, category: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, category } : f))
    )
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files)
      }
    },
    [addFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const handleDropZoneClick = () => {
    fileInputRef.current?.click()
  }

  const uploadFile = async (item: FileUploadItem): Promise<{ documentId: string } | null> => {
    const formData = new FormData()
    formData.append('file', item.file)
    formData.append('name', item.file.name.replace(/\.[^/.]+$/, ''))
    formData.append('category', item.category)
    if (relatedEntityId) {
      formData.append('relatedEntityId', relatedEntityId)
    }
    if (relatedEntityType) {
      formData.append('relatedEntityType', relatedEntityType)
    }

    const response = await fetch('/api/fms_documents/upload', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()

    if (response.ok && result.ok) {
      return { documentId: result.item.id }
    }

    throw new Error(result.error || 'Upload failed')
  }

  const extractDocument = async (documentId: string): Promise<ExtractionResult | null> => {
    const response = await fetch(`/api/fms_documents/documents/${documentId}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Extraction failed')
    }

    // Return extraction result
    return {
      success: true,
      document_type: result.extraction?.document_type || result.documentType,
      confidence: result.extraction?.confidence,
      data: result.extraction?.data,
      invoice: result.invoice,
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setIsProcessing(true)

    let successCount = 0
    let errorCount = 0

    for (const item of files) {
      if (item.status === 'success') continue

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', error: undefined } : f))
      )

      try {
        // Upload the file
        const result = await uploadFile(item)

        if (result) {
          let extractionResult: ExtractionResult | null = null
          let extractionError: string | null = null

          // If extraction is enabled, extract the document
          if (enableExtraction) {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === item.id ? { ...f, status: 'extracting', documentId: result.documentId } : f
              )
            )

            try {
              extractionResult = await extractDocument(result.documentId)
              // Auto-expand items with extraction results
              if (extractionResult) {
                setExpandedItems((prev) => new Set([...prev, item.id]))
              }
            } catch (err) {
              // Extraction failed but upload succeeded - store error for display
              extractionError = err instanceof Error ? err.message : 'Extraction failed'
              console.warn('Extraction failed:', err)
            }
          }

          // Mark as success with extraction result (upload succeeded even if extraction failed)
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: 'success', documentId: result.documentId, extractionResult, extractionError }
                : f
            )
          )
          successCount++
        }
      } catch (error) {
        // Mark as error
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
              : f
          )
        )
        errorCount++
      }
    }

    setIsProcessing(false)

    if (successCount > 0) {
      flash(
        successCount === 1
          ? 'Document uploaded successfully'
          : `${successCount} documents uploaded successfully`,
        'success'
      )

      // If extraction is NOT enabled, call onSuccess and auto-close
      // If extraction IS enabled, keep dialog open so user can review extracted data
      // onSuccess will be called when user manually closes the dialog
      if (!enableExtraction) {
        onSuccess?.()
        setSuccessCallbackCalled(true)
        if (errorCount === 0) {
          setTimeout(() => {
            handleClose()
          }, 1000)
        }
      }
    }

    if (errorCount > 0) {
      flash(
        errorCount === 1
          ? 'Failed to upload 1 document'
          : `Failed to upload ${errorCount} documents`,
        'error'
      )
    }
  }

  const handleClose = () => {
    if (!isProcessing) {
      // Call onSuccess if there were any successfully uploaded files and callback wasn't called yet
      const hasSuccessfulUploads = files.some((f) => f.status === 'success')
      if (hasSuccessfulUploads && !successCallbackCalled) {
        onSuccess?.()
      }
      setFiles([])
      setIsDragging(false)
      setExpandedItems(new Set())
      setSuccessCallbackCalled(false)
      onOpenChange(false)
    }
  }

  const pendingFiles = files.filter((f) => f.status === 'pending')
  const canUpload = pendingFiles.length > 0 && !isProcessing

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </DialogTitle>
          <DialogDescription>
            Upload one or more documents. Supported formats: PDF, PNG, JPG, DOC, DOCX.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Drop Zone */}
          <div
            className={cn(
              'relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer',
              'hover:border-primary/50 hover:bg-muted/50',
              isDragging && 'border-primary bg-primary/10',
              files.length > 0 && 'p-4'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx"
              multiple
              onChange={handleFileChange}
              disabled={isProcessing}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className={cn('h-8 w-8', isDragging ? 'text-primary' : 'text-muted-foreground')} />
              <p className="text-sm font-medium">
                {isDragging ? 'Drop files here' : 'Drag & drop or click to select'}
              </p>
              <p className="text-xs text-muted-foreground">PDF, PNG, JPG, DOC, DOCX files</p>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {files.map((item) => {
                const isExpanded = expandedItems.has(item.id)
                const hasExtractionResult = item.extractionResult && item.status === 'success'
                const hasExtractionError = item.extractionError && item.status === 'success'

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg border overflow-hidden',
                      item.status === 'success' && !hasExtractionError && 'bg-green-50 border-green-200',
                      item.status === 'success' && hasExtractionError && 'bg-amber-50 border-amber-200',
                      item.status === 'error' && 'bg-red-50 border-red-200',
                      (item.status === 'uploading' || item.status === 'extracting') &&
                        'bg-blue-50 border-blue-200'
                    )}
                  >
                    <div className="flex items-center gap-3 p-2">
                      <div className="flex-shrink-0">
                        {item.status === 'pending' && <FileText className="h-5 w-5 text-muted-foreground" />}
                        {item.status === 'uploading' && (
                          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        )}
                        {item.status === 'extracting' && (
                          <Sparkles className="h-5 w-5 text-blue-600 animate-pulse" />
                        )}
                        {item.status === 'success' && !hasExtractionError && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                        {item.status === 'success' && hasExtractionError && <AlertCircle className="h-5 w-5 text-amber-600" />}
                        {item.status === 'error' && <AlertCircle className="h-5 w-5 text-red-600" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.file.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(item.file.size)}</span>
                          {item.status === 'pending' && (
                            <select
                              value={item.category}
                              onChange={(e) => updateFileCategory(item.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs border rounded px-1 py-0.5 bg-background"
                            >
                              {DOCUMENT_CATEGORIES.map((cat) => (
                                <option key={cat.value} value={cat.value}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {item.status === 'uploading' && <span className="text-blue-600">Uploading...</span>}
                          {item.status === 'extracting' && (
                            <span className="text-blue-600 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Extracting data...
                            </span>
                          )}
                          {item.status === 'success' && !hasExtractionResult && !item.extractionError && (
                            <span className="text-green-600">Done</span>
                          )}
                          {item.status === 'success' && hasExtractionResult && (
                            <span className="text-green-600 flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              Data extracted
                            </span>
                          )}
                          {item.status === 'success' && item.extractionError && (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Uploaded (extraction failed)
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-red-600">{item.error || 'Failed'}</span>
                          )}
                        </div>
                      </div>

                      {item.status === 'pending' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFile(item.id)
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}

                      {hasExtractionResult && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(item.id)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title={isExpanded ? 'Hide extracted data' : 'Show extracted data'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Extraction Results Panel */}
                    {hasExtractionResult && isExpanded && (
                      <div className="border-t border-green-200 bg-white p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-green-700">
                          <Sparkles className="h-3 w-3" />
                          Extracted Data
                          {item.extractionResult?.confidence && (
                            <span className="ml-auto px-1.5 py-0.5 bg-green-100 rounded text-green-700">
                              {item.extractionResult.confidence} confidence
                            </span>
                          )}
                        </div>

                        {/* JSON Preview of extracted data */}
                        <div className="bg-gray-50 rounded-md p-2 max-h-60 overflow-y-auto">
                          <ReactJson
                            src={item.extractionResult?.invoice || item.extractionResult?.data || item.extractionResult || {}}
                            name={false}
                            collapsed={2}
                            displayDataTypes={false}
                            displayObjectSize={false}
                            enableClipboard={false}
                            theme="rjv-default"
                            style={{ backgroundColor: 'transparent', fontSize: '12px' }}
                          />
                        </div>

                        {item.extractionResult?.document_type && (
                          <div className="text-xs text-muted-foreground pt-1 border-t">
                            Type: {item.extractionResult.document_type}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Extraction Option */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <div>
                <Label htmlFor="extraction" className="text-sm font-medium cursor-pointer">
                  AI Data Extraction
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically extract data from invoices, B/L, customs docs
                </p>
              </div>
            </div>
            <Switch
              id="extraction"
              checked={enableExtraction}
              onCheckedChange={setEnableExtraction}
              disabled={isProcessing}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {files.some((f) => f.status === 'success') ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleUpload} disabled={!canUpload}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {pendingFiles.length > 0 && `(${pendingFiles.length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
