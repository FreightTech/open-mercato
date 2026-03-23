'use client'

import React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { RefreshCw, Download, Loader2, FileWarning } from 'lucide-react'

type Props = {
  pdfBlobUrl: string | null
  pdfLoading: boolean
  pdfError: string | null
  invoiceId: string | null
  onRefresh: () => void
  onDownload: () => void
  label?: string
}

export function InvoicePdfPreview({
  pdfBlobUrl,
  pdfLoading,
  pdfError,
  invoiceId,
  onRefresh,
  onDownload,
  label,
}: Props) {
  return (
    <div style={{ width: '50%', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b" style={{ background: 'var(--muted)', flexShrink: 0 }}>
        <span className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>
          {label || 'PDF Preview'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={!invoiceId || pdfLoading}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDownload}
            disabled={!pdfBlobUrl}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* PDF content area */}
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {pdfLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            <span className="text-xs text-muted-foreground">Generating preview...</span>
          </div>
        ) : pdfError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <FileWarning className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{pdfError}</span>
            <Button variant="outline" size="sm" onClick={onRefresh} className="mt-1">
              Retry
            </Button>
          </div>
        ) : pdfBlobUrl ? (
          <iframe
            src={`${pdfBlobUrl}#navpanes=0&view=FitH`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="PDF Preview"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <FileWarning className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Save the invoice to preview PDF
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
