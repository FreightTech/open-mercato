"use client"
import * as React from 'react'
import PdfProofViewer from './PdfProofViewer'

interface ParsedDocumentData {
  id: string
  documentType: string
  fileName: string
  extracted: Record<string, unknown> | null
  parseError: string | null
  createdAt: string
}

interface DocumentUploadFormProps {
  documents: ParsedDocumentData[]
  shipmentId: string
  onReparse: () => void
}

const docTypeLabels: Record<string, string> = {
  bill_of_lading: 'Bill of Lading / Sea Waybill',
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
}

export default function DocumentUploadForm({ documents, shipmentId, onReparse }: DocumentUploadFormProps) {
  const [reparsing, setReparsing] = React.useState(false)
  const [previewDocId, setPreviewDocId] = React.useState<string | null>(null)

  const handleReparse = async () => {
    setReparsing(true)
    try {
      const response = await fetch(`/api/customs/customs/shipments/${shipmentId}/reparse`, {
        method: 'POST',
      })
      if (response.ok) {
        onReparse()
      }
    } catch {
      // ignore
    } finally {
      setReparsing(false)
    }
  }

  const docTypes = ['bill_of_lading', 'commercial_invoice', 'packing_list'] as const

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-foreground">Uploaded Documents</h3>
        <button
          onClick={handleReparse}
          disabled={reparsing}
          className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted disabled:opacity-50 text-foreground"
        >
          {reparsing ? 'Re-parsing...' : 'Re-parse All'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {docTypes.map((docType) => {
          const doc = documents.find((document) => document.documentType === docType)
          const isActive = doc && previewDocId === doc.id
          return (
            <div
              key={docType}
              onClick={() => {
                if (!doc) return
                setPreviewDocId(previewDocId === doc.id ? null : doc.id)
              }}
              className={`rounded-lg border p-4 bg-card transition-colors ${
                isActive
                  ? 'border-primary ring-1 ring-primary/30'
                  : 'border-border'
              } ${doc ? 'cursor-pointer hover:border-muted-foreground/40' : ''}`}
            >
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {docTypeLabels[docType]}
              </div>
              {doc ? (
                <>
                  <div className="text-sm font-medium text-foreground truncate">{doc.fileName}</div>
                  <div className="mt-2 flex items-center justify-between">
                    {doc.parseError ? (
                      <span className="inline-flex items-center text-xs text-destructive">
                        <span className="mr-1">&#10005;</span> Parse error
                      </span>
                    ) : doc.extracted ? (
                      <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400">
                        <span className="mr-1">&#10003;</span> Parsed successfully
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400">
                        <span className="mr-1 animate-spin">&#9696;</span> Parsing...
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground/50">
                      {isActive ? 'Click to close' : 'Click to preview'}
                    </span>
                  </div>
                  {doc.parseError && (
                    <p className="text-xs text-destructive mt-1 truncate" title={doc.parseError}>
                      {doc.parseError}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Not uploaded</div>
              )}
            </div>
          )
        })}
      </div>

      {previewDocId && (
        <div style={{ height: '75vh' }}>
          <PdfProofViewer
            shipmentId={shipmentId}
            documents={documents.map((d) => ({ id: d.id, documentType: d.documentType, fileName: d.fileName }))}
            activeDocId={previewDocId}
            onDocChange={setPreviewDocId}
            highlightQuote={null}
            highlightPage={null}
          />
        </div>
      )}
    </div>
  )
}
