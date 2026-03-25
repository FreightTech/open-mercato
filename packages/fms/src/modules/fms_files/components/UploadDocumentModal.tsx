'use client'

import * as React from 'react'
import { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
} from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'

interface ExtractionResult {
  success: boolean
  document_type?: string
  confidence?: string
  data?: Record<string, unknown>
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

type UploadDocumentModalProps = {
  open: boolean
  onClose: () => void
  onUpload: (file: File, category: string) => Promise<string | null>
  onExtract?: (documentId: string) => Promise<ExtractionResult | null>
  onDocumentUploaded?: (documentId: string) => void
}

const DOCUMENT_CATEGORIES = [
  { value: 'booking_confirmation', label: 'Booking Confirmation' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'customs_declaration', label: 'Customs Declaration' },
  { value: 'delivery_note', label: 'Delivery Note' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'vgm_certificate', label: 'VGM Certificate' },
  { value: 'offer', label: 'Offer' },
  { value: 'other', label: 'Other' },
]

function detectCategory(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('booking') || lower.includes('confirmation') || lower.match(/book[_\-\s]?conf/i)) {
    return 'booking_confirmation'
  }
  if (lower.includes('invoice') || lower.includes('faktura')) return 'invoice'
  if (lower.includes('bl') || lower.includes('bill') || lower.includes('lading')) return 'bill_of_lading'
  if (lower.includes('customs') || lower.includes('declaration') || lower.includes('sad')) return 'customs_declaration'
  if (lower.includes('delivery') || lower.includes('pod') || lower.includes('proof')) return 'delivery_note'
  if (lower.includes('packing') || lower.includes('pack_list')) return 'packing_list'
  if (lower.includes('vgm')) return 'vgm_certificate'
  if (lower.includes('offer') || lower.includes('quote')) return 'offer'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadDocumentModal({
  open,
  onClose,
  onUpload,
  onExtract,
  onDocumentUploaded,
}: UploadDocumentModalProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [enableExtraction, setEnableExtraction] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setFiles([])
    setIsDragging(false)
  }, [])

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      resetState()
      onClose()
    }
  }, [isProcessing, resetState, onClose])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx']
    const fileArray = Array.from(newFiles)
    const validFiles = fileArray.filter((file) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
      return validTypes.includes(ext)
    })
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
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, category } : f)))
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files)
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
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleUpload = async () => {
    if (files.length === 0) return
    setIsProcessing(true)
    let lastSuccessfulDocumentId: string | null = null

    for (const item of files) {
      if (item.status === 'success') continue

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', error: undefined } : f))
      )

      try {
        const documentId = await onUpload(item.file, item.category)

        if (documentId) {
          let extractionResult: ExtractionResult | null = null
          let extractionError: string | null = null

          if (enableExtraction && onExtract) {
            setFiles((prev) =>
              prev.map((f) => (f.id === item.id ? { ...f, status: 'extracting', documentId } : f))
            )
            try {
              extractionResult = await onExtract(documentId)
            } catch (err) {
              extractionError = err instanceof Error ? err.message : 'Extraction failed'
              console.warn('[fms-files:upload] extraction failed:', err)
            }
          }

          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: 'success', documentId, extractionResult, extractionError }
                : f
            )
          )
          lastSuccessfulDocumentId = documentId
        } else {
          throw new Error('Upload failed — no document ID returned')
        }
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
              : f
          )
        )
      }
    }

    setIsProcessing(false)

    if (lastSuccessfulDocumentId && onDocumentUploaded) {
      onDocumentUploaded(lastSuccessfulDocumentId)
    }
  }

  const pendingFiles = files.filter((f) => f.status === 'pending')
  const hasSuccessfulUploads = files.some((f) => f.status === 'success')
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
            onClick={() => fileInputRef.current?.click()}
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
                      (item.status === 'uploading' || item.status === 'extracting') && 'bg-blue-50 border-blue-200'
                    )}
                  >
                    <div className="flex items-center gap-3 p-2">
                      <div className="flex-shrink-0">
                        {item.status === 'pending' && <FileText className="h-5 w-5 text-muted-foreground" />}
                        {item.status === 'uploading' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                        {item.status === 'extracting' && <Sparkles className="h-5 w-5 text-blue-600 animate-pulse" />}
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Extraction toggle */}
          {onExtract && (
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
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {hasSuccessfulUploads ? 'Close' : 'Cancel'}
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
