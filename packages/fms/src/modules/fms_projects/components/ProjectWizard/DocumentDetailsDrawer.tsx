'use client'

import * as React from 'react'
import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Separator } from '@open-mercato/ui/primitives/separator'
import {
  Download,
  Sparkles,
  Loader2,
  FileText,
  FileSpreadsheet,
  Ship,
  FileCheck,
  ClipboardList,
  Calendar,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react'
import type { ProjectDocument } from './ProjectDocumentsTable'

type DocumentDetailsDrawerProps = {
  open: boolean
  onClose: () => void
  document: ProjectDocument | null
  onExtract: (documentId: string) => Promise<void>
  onDownload: (documentId: string) => void
  isExtracting?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  bill_of_lading: 'Bill of Lading',
  customs: 'Customs Declaration',
  offer: 'Offer',
  other: 'Other',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  invoice: <FileSpreadsheet className="h-5 w-5" />,
  bill_of_lading: <Ship className="h-5 w-5" />,
  customs: <FileCheck className="h-5 w-5" />,
  offer: <ClipboardList className="h-5 w-5" />,
  other: <FileText className="h-5 w-5" />,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getConfidenceBadgeVariant(confidence: string): 'default' | 'secondary' | 'destructive' {
  switch (confidence) {
    case 'HIGH':
      return 'default'
    case 'MEDIUM':
      return 'secondary'
    case 'LOW':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function DocumentDetailsDrawer({
  open,
  onClose,
  document,
  onExtract,
  onDownload,
  isExtracting,
}: DocumentDetailsDrawerProps) {
  const [copied, setCopied] = useState(false)

  if (!document) return null

  const isExtracted = !!document.extractedData?.success
  const categoryIcon = CATEGORY_ICONS[document.category] || CATEGORY_ICONS.other
  const categoryLabel = CATEGORY_LABELS[document.category] || document.category

  const handleExtract = async () => {
    await onExtract(document.id)
  }

  const handleCopyJson = () => {
    if (document.extractedData?.data) {
      navigator.clipboard.writeText(JSON.stringify(document.extractedData.data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              {categoryIcon}
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left truncate pr-4">
                {document.name}
              </SheetTitle>
              <SheetDescription className="text-left">
                {categoryLabel}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* File Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">File Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <HardDrive className="h-4 w-4" />
                <span>Size</span>
              </div>
              <div className="font-medium">
                {document.attachment ? formatFileSize(document.attachment.fileSize) : '-'}
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Uploaded</span>
              </div>
              <div className="font-medium">
                {formatDate(document.createdAt)}
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Type</span>
              </div>
              <div className="font-medium">
                {document.attachment?.mimeType || 'Unknown'}
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Actions</h3>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => onDownload(document.id)}
              >
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>

              {!isExtracted ? (
                <Button
                  variant="default"
                  className="w-full justify-start"
                  onClick={handleExtract}
                  disabled={isExtracting}
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Extracting Data...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Extract Data with AI
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleExtract}
                  disabled={isExtracting}
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Re-extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Re-extract Data
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Extraction Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Extraction Status</h3>

            {isExtracted ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Data Extracted</span>
                  <Badge variant={getConfidenceBadgeVariant(document.extractedData?.confidence || '')}>
                    {document.extractedData?.confidence} confidence
                  </Badge>
                </div>

                {document.extractedData?.processing_time_ms && (
                  <p className="text-xs text-muted-foreground">
                    Processed in {document.extractedData.processing_time_ms}ms
                  </p>
                )}

                {/* Extracted Data Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Extracted Data</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyJson}
                      className="h-8 px-2"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy JSON
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="bg-muted rounded-lg p-3 max-h-[300px] overflow-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(document.extractedData?.data || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Not yet extracted</span>
              </div>
            )}
          </div>

          {/* Description if present */}
          {document.description && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                <p className="text-sm">{document.description}</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
