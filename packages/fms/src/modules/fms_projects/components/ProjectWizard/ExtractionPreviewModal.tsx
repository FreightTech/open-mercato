'use client'

import * as React from 'react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Copy, Check, FileText, ChevronDown, ChevronRight, Clock } from 'lucide-react'

type ExtractionPreviewModalProps = {
  open: boolean
  onClose: () => void
  extractionResult: {
    success: boolean
    document_type: string
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    data: Record<string, unknown>
    raw_text?: string
    processing_time_ms: number
  } | null
  documentName?: string
}

function getConfidenceBadgeVariant(confidence: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (confidence) {
    case 'HIGH':
      return 'default'
    case 'MEDIUM':
      return 'secondary'
    case 'LOW':
      return 'destructive'
    default:
      return 'outline'
  }
}

function getConfidenceColor(confidence: string): string {
  switch (confidence) {
    case 'HIGH':
      return 'text-green-600'
    case 'MEDIUM':
      return 'text-yellow-600'
    case 'LOW':
      return 'text-red-600'
    default:
      return 'text-muted-foreground'
  }
}

// Recursive component to render JSON tree
function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (data === null || data === undefined) {
    return <span className="text-muted-foreground italic">null</span>
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-600">{data ? 'true' : 'false'}</span>
  }

  if (typeof data === 'number') {
    return <span className="text-blue-600">{data}</span>
  }

  if (typeof data === 'string') {
    return <span className="text-green-600">"{data}"</span>
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground">[]</span>
    }

    return (
      <div className="pl-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-xs">[{data.length} items]</span>
        </button>
        {expanded && (
          <div className="border-l border-muted pl-3 ml-1 mt-1 space-y-1">
            {data.map((item, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-muted-foreground text-xs">{index}:</span>
                <JsonTree data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) {
      return <span className="text-muted-foreground">{'{}'}</span>
    }

    return (
      <div className="pl-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-xs">{'{'}...{'}'}</span>
        </button>
        {expanded && (
          <div className="border-l border-muted pl-3 ml-1 mt-1 space-y-1">
            {entries.map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-orange-600 font-medium">"{key}":</span>
                <JsonTree data={value} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return <span>{String(data)}</span>
}

export function ExtractionPreviewModal({
  open,
  onClose,
  extractionResult,
  documentName,
}: ExtractionPreviewModalProps) {
  const [copied, setCopied] = useState(false)
  const [showRawText, setShowRawText] = useState(false)

  const handleCopy = async () => {
    if (!extractionResult?.data) return

    try {
      await navigator.clipboard.writeText(JSON.stringify(extractionResult.data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (!extractionResult) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Extraction Result
            {documentName && (
              <span className="text-muted-foreground font-normal text-sm">- {documentName}</span>
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4 pt-2">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline">
                {extractionResult.document_type.replace('_', ' ')}
              </Badge>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">Confidence:</span>
              <Badge variant={getConfidenceBadgeVariant(extractionResult.confidence)}>
                {extractionResult.confidence}
              </Badge>
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-xs">{extractionResult.processing_time_ms}ms</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 pt-4">
          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {extractionResult.raw_text && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRawText(!showRawText)}
                >
                  {showRawText ? 'Show Extracted Data' : 'Show Raw Text'}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-4">
            {showRawText ? (
              <pre className="text-sm font-mono whitespace-pre-wrap text-muted-foreground">
                {extractionResult.raw_text || 'No raw text available'}
              </pre>
            ) : (
              <div className="font-mono text-sm">
                <JsonTree data={extractionResult.data} />
              </div>
            )}
          </div>

          {/* Formatted JSON fallback */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View as plain JSON
            </summary>
            <pre className="mt-2 p-3 rounded bg-muted overflow-auto max-h-40 text-xs">
              {JSON.stringify(extractionResult.data, null, 2)}
            </pre>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  )
}
