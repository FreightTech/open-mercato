'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  FileText,
  Download,
  Sparkles,
  Trash2,
  Eye,
  Loader2,
  File,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { cn } from '@open-mercato/shared/lib/utils'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { DocumentUploadDialog } from '../../fms_documents/components/DocumentUploadDialog'

type QuoteDocument = {
  id: string
  name: string
  category: string
  fileName: string
  fileSize: number
  attachmentId: string
  url: string
  processedAt?: string | null
  extractedData?: Record<string, any> | null
  createdAt: string
}

type QuoteDocumentsProps = {
  quoteId: string
  className?: string
  compact?: boolean
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (['pdf'].includes(ext || '')) return FileText
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return ImageIcon
  return File
}

export function QuoteDocuments({ quoteId, className = '' }: QuoteDocumentsProps) {
  const queryClient = useQueryClient()
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [extractingId, setExtractingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState<QuoteDocument | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showExtractedData, setShowExtractedData] = useState<QuoteDocument | null>(null)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['quote_documents', quoteId],
    queryFn: async () => {
      const response = await apiCall<{ items: QuoteDocument[] }>(
        `/api/fms_documents/documents?relatedEntityId=${quoteId}&relatedEntityType=fms_quotes:fms_quote`
      )
      if (!response.ok) throw new Error('Failed to load documents')
      return response.result?.items || []
    },
    enabled: !!quoteId,
  })

  const handleExtract = useCallback(
    async (doc: QuoteDocument) => {
      setExtractingId(doc.id)
      try {
        const response = await apiCall<{ ok: boolean; extractedData?: Record<string, any> }>(
          `/api/fms_documents/documents/${doc.id}/extract`,
          { method: 'POST' }
        )

        if (response.ok && response.result?.ok) {
          flash('Data extracted successfully', 'success')
          queryClient.invalidateQueries({ queryKey: ['quote_documents', quoteId] })
        } else {
          flash('Failed to extract data', 'error')
        }
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Extraction failed', 'error')
      } finally {
        setExtractingId(null)
      }
    },
    [quoteId, queryClient]
  )

  const handleDelete = useCallback(async () => {
    if (!showDeleteDialog) return

    setDeletingId(showDeleteDialog.id)
    try {
      const response = await apiCall(`/api/fms_documents/documents/${showDeleteDialog.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        flash('Document deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['quote_documents', quoteId] })
        setShowDeleteDialog(null)
      } else {
        flash('Failed to delete document', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Delete failed', 'error')
    } finally {
      setDeletingId(null)
    }
  }, [showDeleteDialog, quoteId, queryClient])

  if (!quoteId) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        Save the quote first to upload documents.
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Rate Sheets & Documents</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsUploadDialogOpen(true)}
          className="h-7 text-xs"
        >
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </Button>
      </div>

      {/* Documents Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading documents...
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="h-8 text-xs">Name</TableHead>
                <TableHead className="h-8 text-xs w-24">Size</TableHead>
                <TableHead className="h-8 text-xs w-24">Status</TableHead>
                <TableHead className="h-8 text-xs w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const FileIcon = getFileIcon(doc.fileName)
                const hasExtractedData = !!doc.extractedData && Object.keys(doc.extractedData).length > 0

                return (
                  <TableRow key={doc.id} className="hover:bg-muted/30">
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {formatFileSize(doc.fileSize)}
                    </TableCell>
                    <TableCell className="py-2">
                      {hasExtractedData ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Extracted
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Uploaded</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        {hasExtractedData && (
                          <button
                            onClick={() => setShowExtractedData(doc)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="View extracted data"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleExtract(doc)}
                          disabled={extractingId === doc.id}
                          className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                          title="Extract with AI"
                        >
                          {extractingId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <a
                          href={`/api/fms_documents/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => setShowDeleteDialog(doc)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div
          className={cn(
            'text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg cursor-pointer transition-colors',
            'hover:border-primary/50 hover:bg-muted/30'
          )}
          onClick={() => setIsUploadDialogOpen(true)}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p>No documents uploaded</p>
          <p className="text-xs">Upload rate sheets, PDFs, or images</p>
        </div>
      )}

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['quote_documents', quoteId] })
        }}
        relatedEntityId={quoteId}
        relatedEntityType="fms_quotes:fms_quote"
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={(open) => !open && setShowDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{showDeleteDialog?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)} disabled={!!deletingId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!deletingId}>
              {deletingId ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extracted data dialog */}
      <Dialog open={!!showExtractedData} onOpenChange={(open) => !open && setShowExtractedData(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Extracted Data</DialogTitle>
            <DialogDescription>Data extracted from &quot;{showExtractedData?.name}&quot;</DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-4 overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(showExtractedData?.extractedData, null, 2)}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtractedData(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
