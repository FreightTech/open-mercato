'use client'

import * as React from 'react'
import { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface InvoiceUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadSuccess?: (invoiceId: string) => void
}

interface FileUploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  invoiceId?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ACCEPTED_TYPES = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.webp']

export function InvoiceUploadDialog({
  open,
  onOpenChange,
  onUploadSuccess,
}: InvoiceUploadDialogProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setFiles([])
    setIsDragging(false)
    setIsProcessing(false)
  }, [])

  const handleClose = useCallback(() => {
    if (isProcessing) return
    const hasSuccess = files.some((f) => f.status === 'success')
    if (hasSuccess) {
      const lastSuccess = files.filter((f) => f.status === 'success').pop()
      if (lastSuccess?.invoiceId) {
        onUploadSuccess?.(lastSuccess.invoiceId)
      }
    }
    resetState()
    onOpenChange(false)
  }, [files, isProcessing, onOpenChange, onUploadSuccess, resetState])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    const validFiles = fileArray.filter((file) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
      return ACCEPTED_TYPES.includes(ext)
    })

    if (validFiles.length < fileArray.length) {
      flash('Some files were skipped (unsupported format)', 'warning')
    }

    const newItems: FileUploadItem[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      file,
      status: 'pending',
    }))

    setFiles((prev) => [...prev, ...newItems])
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files)
    }
  }, [addFiles])

  const handleDropZoneClick = () => {
    fileInputRef.current?.click()
  }

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return

    setIsProcessing(true)
    let successCount = 0
    let errorCount = 0
    let lastInvoiceId: string | undefined

    for (const item of files) {
      if (item.status === 'success') continue

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', error: undefined } : f))
      )

      try {
        const formData = new FormData()
        formData.append('file', item.file)

        const response = await fetch('/api/fms_documents/invoices/upload', {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Upload failed')
        }

        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'success', invoiceId: result.invoiceId } : f))
        )
        lastInvoiceId = result.invoiceId
        successCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload invoice'
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'error', error: message } : f))
        )
        errorCount++
      }
    }

    setIsProcessing(false)

    if (successCount > 0) {
      flash(
        successCount === 1
          ? 'Invoice uploaded successfully'
          : `${successCount} invoices uploaded successfully`,
        'success',
      )

      if (errorCount === 0 && lastInvoiceId) {
        setTimeout(() => {
          onUploadSuccess?.(lastInvoiceId!)
          resetState()
          onOpenChange(false)
        }, 300)
      }
    }

    if (errorCount > 0) {
      flash(
        errorCount === 1
          ? 'Failed to upload 1 invoice'
          : `Failed to upload ${errorCount} invoices`,
        'error',
      )
    }
  }, [files, onUploadSuccess, onOpenChange, resetState])

  const pendingFiles = files.filter((f) => f.status === 'pending')
  const canUpload = pendingFiles.length > 0 && !isProcessing

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Invoices</DialogTitle>
          <DialogDescription>
            Upload one or more PDF invoices to extract data using AI-powered OCR
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Drop Zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
              'hover:border-primary/50 hover:bg-muted/50',
              isDragging && 'border-primary bg-primary/10',
              files.length > 0 && 'p-4',
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              multiple
              onChange={handleFileSelect}
              disabled={isProcessing}
              className="hidden"
            />
            <Upload className={cn('mx-auto h-8 w-8 mb-2', isDragging ? 'text-primary' : 'text-muted-foreground')} />
            <p className="text-sm font-medium">
              {isDragging ? 'Drop files here' : 'Drag & drop or click to select'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, PNG, JPEG, TIFF, WebP files (max 20MB each)
            </p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {files.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border',
                    item.status === 'success' && 'bg-green-50 border-green-200',
                    item.status === 'error' && 'bg-red-50 border-red-200',
                    item.status === 'uploading' && 'bg-blue-50 border-blue-200',
                    item.status === 'pending' && 'bg-muted border-border',
                  )}
                >
                  <div className="flex-shrink-0">
                    {item.status === 'pending' && <FileText className="h-5 w-5 text-muted-foreground" />}
                    {item.status === 'uploading' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                    {item.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    {item.status === 'error' && <AlertCircle className="h-5 w-5 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatFileSize(item.file.size)}</span>
                      {item.status === 'uploading' && <span className="text-blue-600">Processing...</span>}
                      {item.status === 'success' && <span className="text-green-600">Done</span>}
                      {item.status === 'error' && <span className="text-red-600">{item.error}</span>}
                    </div>
                  </div>
                  {item.status === 'pending' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(item.id) }}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
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
                <Upload className="mr-2 h-4 w-4" />
                Upload & Process {pendingFiles.length > 0 && `(${pendingFiles.length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
