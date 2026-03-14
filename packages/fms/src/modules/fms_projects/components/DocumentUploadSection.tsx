/**
 * Document Upload Section Component
 * Displays and manages documents attached to a project
 */

'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Upload,
  FileText,
  Download,
  Trash2,
  FileSpreadsheet,
  FileCheck,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react'

interface Attachment {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  url: string
}

interface Invoice {
  id: string
  invoiceNumber: string | null
  sellerName: string | null
  grossAmount: string | null
  confidence: string
  status: string
}

interface DocumentItem {
  id: string
  name: string
  category: string
  description: string | null
  createdAt: string
  processedAt: string | null
  attachment: Attachment | null
  invoice: Invoice | null
}

interface DocumentUploadSectionProps {
  projectId: string
  onDocumentUploaded?: (document: DocumentItem) => void
  onInvoiceExtracted?: (invoice: Invoice) => void
}

const CATEGORY_OPTIONS = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'customs', label: 'Customs Document' },
  { value: 'offer', label: 'Offer/Quotation' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  invoice: <FileSpreadsheet className="h-4 w-4" />,
  bill_of_lading: <FileText className="h-4 w-4" />,
  customs: <FileCheck className="h-4 w-4" />,
  offer: <FileText className="h-4 w-4" />,
  other: <FileText className="h-4 w-4" />,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DocumentUploadSection({
  projectId,
  onDocumentUploaded,
  onInvoiceExtracted,
}: DocumentUploadSectionProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedCategory, setSelectedCategory] = useState('other')

  // Fetch documents on mount
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/fms_projects/projects/${projectId}/documents`)
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      const data = await response.json()
      setDocuments(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Fetch on mount
  useState(() => {
    fetchDocuments()
  })

  // Handle file upload
  const handleUpload = async (file: File) => {
    try {
      setUploading(true)
      setError(null)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', file.name)
      formData.append('category', selectedCategory)

      const response = await fetch(`/api/fms_projects/projects/${projectId}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = await response.json()

      // Refresh documents list
      await fetchDocuments()

      if (onDocumentUploaded) {
        onDocumentUploaded(data.item)
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Handle extract invoice
  const handleExtract = async (documentId: string) => {
    try {
      setExtracting(documentId)
      setError(null)

      const response = await fetch(`/api/fms_documents/documents/${documentId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Extraction failed')
      }

      const data = await response.json()

      // Refresh documents list to show extraction results
      await fetchDocuments()

      if (onInvoiceExtracted && data.invoice) {
        onInvoiceExtracted(data.invoice)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(null)
    }
  }

  // Handle download
  const handleDownload = async (documentId: string) => {
    window.open(`/api/fms_documents/documents/${documentId}/download`, '_blank')
  }

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
  }

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleUpload(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Documents</h2>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Documents</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.tiff"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            size="sm"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center mb-4 hover:border-gray-400 transition-colors"
      >
        <FileText className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">
          Drag and drop files here, or click Upload
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Supports PDF, PNG, JPG, TIFF
        </p>
      </div>

      {/* Documents list */}
      {documents.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          No documents uploaded yet
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="border rounded-lg p-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="text-gray-500">
                  {CATEGORY_ICONS[doc.category] || <FileText className="h-4 w-4" />}
                </div>
                <div>
                  <div className="font-medium text-sm">{doc.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="capitalize">{doc.category.replace('_', ' ')}</span>
                    {doc.attachment && (
                      <>
                        <span>·</span>
                        <span>{formatFileSize(doc.attachment.fileSize)}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{formatDate(doc.createdAt)}</span>
                  </div>
                  {doc.invoice && (
                    <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <FileCheck className="h-3 w-3" />
                      Extracted: {doc.invoice.invoiceNumber || 'Invoice'} -{' '}
                      {doc.invoice.grossAmount} PLN
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {doc.category === 'invoice' && !doc.invoice && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExtract(doc.id)}
                    disabled={extracting === doc.id}
                    title="Extract invoice data with AI"
                  >
                    {extracting === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(doc.id)}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DocumentUploadSection
