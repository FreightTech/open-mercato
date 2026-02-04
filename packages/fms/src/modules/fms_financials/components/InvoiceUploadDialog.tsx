'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Upload,
  FileText,
  AlertCircle,
} from 'lucide-react'

interface InvoiceUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadSuccess?: (invoiceId: string) => void
}

type UploadState = 'idle' | 'uploading' | 'error'

export function InvoiceUploadDialog({
  open,
  onOpenChange,
  onUploadSuccess,
}: InvoiceUploadDialogProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const resetState = useCallback(() => {
    setState('idle')
    setError(null)
    setFile(null)
    setIsDragActive(false)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [onOpenChange, resetState])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      setFile(droppedFile)
      setError(null)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }, [])

  // Upload file - extract, save, and create page images in one call
  const handleUpload = useCallback(async () => {
    if (!file) return

    setState('uploading')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/fms_financials/invoices/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      // Success - close dialog and open detail drawer
      onUploadSuccess?.(result.invoiceId)
      handleClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload invoice'
      setError(message)
      setState('error')
    }
  }, [file, onUploadSuccess, handleClose])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Invoice</DialogTitle>
          <DialogDescription>
            Upload a PDF invoice to extract data using AI-powered OCR
          </DialogDescription>
        </DialogHeader>

        {state === 'idle' && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop your invoice PDF here, or click to select
              </p>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.webp"
                onChange={handleFileSelect}
                className="hidden"
                id="invoice-file-input"
              />
              <Label
                htmlFor="invoice-file-input"
                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                Select File
              </Label>
            </div>

            {file && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            )}
          </div>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Spinner className="h-10 w-10 mb-4" />
            <p className="text-sm font-medium">Processing invoice...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Extracting data and generating page previews
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-sm font-medium text-destructive mb-2">Upload Failed</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>

          {state === 'idle' && (
            <Button onClick={handleUpload} disabled={!file}>
              <Upload className="mr-2 h-4 w-4" />
              Upload & Process
            </Button>
          )}

          {state === 'error' && (
            <Button onClick={resetState}>
              Try Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
