'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
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
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import { UploadDocumentModal } from './UploadDocumentModal'
import { DocumentDetailPanel } from '../../fms_documents/components/DocumentDetailPanel'

interface DocumentItem {
  id: string
  name: string
  category: string
  description?: string | null
  processingStatus: string
  createdAt: string
  processedAt?: string | null
  extractedData?: Record<string, unknown> | null
  consensusConfidence?: string | null
  attachment?: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
    url: string
  } | null
}

interface FileDocumentsSectionProps {
  fileId: string
}

const CATEGORY_LABELS: Record<string, string> = {
  booking_confirmation: 'Booking Confirmation',
  invoice: 'Invoice',
  bill_of_lading: 'Bill of Lading',
  customs_declaration: 'Customs Declaration',
  delivery_note: 'Delivery Note',
  packing_list: 'Packing List',
  vgm_certificate: 'VGM Certificate',
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

function ProcessingStatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Extracted
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertCircle className="h-3 w-3" />
        Failed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      Pending
    </span>
  )
}

export function FileDocumentsSection({ fileId }: FileDocumentsSectionProps) {
  const queryClient = useQueryClient()
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['fms-file-documents', fileId],
    queryFn: async () => {
      const res = await apiCall<{ ok: boolean; items: DocumentItem[]; total: number }>(
        `/api/fms_files/files/${fileId}/documents`
      )
      return res.ok ? (res.result?.items ?? []) : []
    },
    enabled: !!fileId,
  })

  const documents: DocumentItem[] = data ?? []

  const handleUpload = useCallback(
    async (file: File, category: string): Promise<string | null> => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', file.name)
      formData.append('category', category)

      const res = await fetch(`/api/fms_files/files/${fileId}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Upload failed')
      }

      const body = await res.json()
      return body?.item?.id ?? null
    },
    [fileId]
  )

  const handleExtract = useCallback(async (documentId: string) => {
    const res = await apiCall<{ success: boolean }>(
      `/api/fms_documents/documents/${documentId}/extract`,
      { method: 'POST' }
    )
    return res.ok ? { success: true } : null
  }, [])

  const handleDocumentUploaded = useCallback(
    (documentId: string) => {
      queryClient.invalidateQueries({ queryKey: ['fms-file-documents', fileId] })
      queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })
      setUploadModalOpen(false)
      setSelectedDocumentId(documentId)
      setDetailPanelOpen(true)
    },
    [fileId, queryClient]
  )

  const handleDocumentClick = useCallback((documentId: string) => {
    setSelectedDocumentId(documentId)
    setDetailPanelOpen(true)
  }, [])

  const handleDeleteClick = useCallback((documentId: string) => {
    setDocumentToDelete(documentId)
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!documentToDelete) return
    setIsDeleting(true)
    try {
      await apiCall(`/api/fms_files/files/${fileId}/documents/${documentToDelete}`, {
        method: 'DELETE',
      })
      queryClient.invalidateQueries({ queryKey: ['fms-file-documents', fileId] })
      queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
      setDocumentToDelete(null)
    }
  }, [documentToDelete, fileId, queryClient])

  const titleContent = (
    <div className="flex items-center gap-2">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-sm">Documents</span>
      {!isLoading && <Badge variant="secondary">{documents.length}</Badge>}
    </div>
  )

  return (
    <>
      <div className="border border-border rounded-lg bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          {titleContent}
          <Button size="sm" variant="outline" onClick={() => setUploadModalOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="p-4 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDocumentClick(doc.id)}
                      className="text-sm font-medium text-primary hover:underline truncate"
                      title={doc.name}
                    >
                      {doc.name}
                    </button>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {CATEGORY_LABELS[doc.category] ?? doc.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {doc.attachment && (
                      <span>{formatFileSize(doc.attachment.fileSize)}</span>
                    )}
                    <span>{formatDate(doc.createdAt)}</span>
                    <ProcessingStatusBadge status={doc.processingStatus} />
                    {doc.consensusConfidence && doc.processingStatus === 'completed' && (
                      <span className="flex items-center gap-1 text-green-600">
                        <Sparkles className="h-3 w-3" />
                        {Math.round(parseFloat(doc.consensusConfidence) * 100)}% confidence
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDocumentClick(doc.id)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="View document"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(doc.id)}
                    className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={handleUpload}
        onExtract={handleExtract}
        onDocumentUploaded={handleDocumentUploaded}
      />

      {/* Document Detail Panel */}
      <DocumentDetailPanel
        documentId={selectedDocumentId}
        open={detailPanelOpen}
        onOpenChange={(open) => {
          setDetailPanelOpen(open)
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ['fms-file-documents', fileId] })
          }
        }}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
