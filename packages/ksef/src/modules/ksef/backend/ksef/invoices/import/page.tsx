"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export default function KsefInvoiceImportPage() {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [xmlPreview, setXmlPreview] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [direction, setDirection] = React.useState<'outgoing' | 'incoming'>('outgoing')

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.name.endsWith('.xml')) {
      setError('Please select an XML file')
      return
    }

    setFileName(file.name)
    setError(null)

    const text = await file.text()
    setXmlPreview(text.substring(0, 2000) + (text.length > 2000 ? '\n... (truncated)' : ''))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }

  const handleUpload = async () => {
    const files = fileInputRef.current?.files
    if (!files || files.length === 0) {
      setError('Please select a file first')
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.set('file', files[0])

    const result = await apiCall<{ id: string; invoiceNumber: string; lineItemCount: number }>(
      '/api/ksef/invoices/import-xml',
      {
        method: 'POST',
        body: formData,
        headers: {
          'x-ksef-direction': direction,
        },
      }
    )

    if (result.ok) {
      router.push(`/backend/ksef/invoices/${result.data.id}`)
    } else {
      setError((result as { error?: string }).error ?? 'Failed to import XML')
    }
    setUploading(false)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import FA(3) XML</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a FA(3) XML file to create a KSeF invoice
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'outgoing' | 'incoming')}
            className="rounded-md border px-3 py-1.5 text-sm bg-background"
          >
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>
        </div>

        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".xml"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          {fileName ? (
            <div>
              <div className="text-sm font-medium">{fileName}</div>
              <div className="text-xs text-muted-foreground mt-1">Click or drop to replace</div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-muted-foreground">
                Drop an FA(3) XML file here, or click to select
              </div>
              <div className="text-xs text-muted-foreground mt-1">Accepts .xml files</div>
            </div>
          )}
        </div>
      </div>

      {xmlPreview && (
        <div className="rounded-lg border p-4">
          <h2 className="font-medium mb-2">XML Preview</h2>
          <pre className="bg-muted p-4 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
            {xmlPreview}
          </pre>
        </div>
      )}

      {fileName && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {uploading ? 'Importing...' : 'Import Invoice'}
          </button>
        </div>
      )}
    </div>
  )
}
