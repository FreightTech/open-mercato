"use client"
import * as React from 'react'
import { detectDocumentType, isUuidFilename } from '../services/batch-utils'
import type { DocumentType } from '../data/entities'

interface FileEntry {
  file: File
  detectedType: DocumentType | null
  assignedType: DocumentType | null
  groupId: string
}

interface GroupSummary {
  groupId: string
  bl: FileEntry | null
  invoice: FileEntry | null
  packingList: FileEntry | null
}

const docTypeLabels: Record<DocumentType, string> = {
  bill_of_lading: 'B/L',
  commercial_invoice: 'Invoice',
  packing_list: 'Packing List',
}

const docTypeColors: Record<DocumentType, string> = {
  bill_of_lading: 'bg-primary/20 text-primary/80 border-primary/30',
  commercial_invoice: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-300 dark:border-amber-500/30',
  packing_list: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30',
}

/**
 * Auto-group files into shipment groups.
 * Strategy: extract a numeric/group suffix from filename (e.g., bl_01, invoice_01, pl_01 -> group "01")
 * Also handles unseparated digits (BL3, CI3, PL3 -> group "3").
 * Skips UUID filenames (their hex segments are not meaningful group numbers).
 * Fallback: assign sequentially by type.
 */
function autoGroupFiles(entries: FileEntry[]): FileEntry[] {
  // Always reset groupIds to '0' — prevents stale state from previous runs
  const updated = entries.map((entry) => ({ ...entry, groupId: '0' }))

  // Try to extract group identifiers from filenames, but skip UUIDs
  // Patterns from most specific to least specific:
  //   1. Separator-delimited: bl_01.pdf, invoice-02.pdf
  //   2. Trailing digits before extension: BL3.pdf, CI3.pdf, PL3.pdf
  const groupPattern = /[_\-\s.](\d{1,4})[_\-\s.]/
  const suffixPattern = /[_\-\s.](\d{1,4})\.[^.]+$/
  const trailingDigitPattern = /(\d{1,4})\.[^.]+$/

  for (const entry of updated) {
    if (isUuidFilename(entry.file.name)) {
      continue
    }
    const match =
      entry.file.name.match(groupPattern) ??
      entry.file.name.match(suffixPattern) ??
      entry.file.name.match(trailingDigitPattern)
    if (match) {
      entry.groupId = match[1]
    }
  }

  // If no numeric groups detected, group by round-robin per type
  const hasNumericGroups = updated.some((entry) => entry.groupId !== '0')
  if (!hasNumericGroups) {
    const byType: Record<string, FileEntry[]> = {
      bill_of_lading: [],
      commercial_invoice: [],
      packing_list: [],
    }

    for (const entry of updated) {
      const type = entry.assignedType ?? entry.detectedType
      if (type) {
        byType[type].push(entry)
      }
    }

    const maxCount = Math.max(
      byType.bill_of_lading.length,
      byType.commercial_invoice.length,
      byType.packing_list.length,
    )

    for (let groupIndex = 0; groupIndex < maxCount; groupIndex++) {
      const groupId = String(groupIndex + 1)
      for (const type of ['bill_of_lading', 'commercial_invoice', 'packing_list'] as const) {
        if (byType[type][groupIndex]) {
          byType[type][groupIndex].groupId = groupId
        }
      }
    }
  }

  return updated
}

function buildGroupSummaries(entries: FileEntry[]): GroupSummary[] {
  const groupMap = new Map<string, GroupSummary>()

  for (const entry of entries) {
    const type = entry.assignedType ?? entry.detectedType
    if (!type) continue

    if (!groupMap.has(entry.groupId)) {
      groupMap.set(entry.groupId, {
        groupId: entry.groupId,
        bl: null,
        invoice: null,
        packingList: null,
      })
    }

    const group = groupMap.get(entry.groupId)!
    if (type === 'bill_of_lading') group.bl = entry
    else if (type === 'commercial_invoice') group.invoice = entry
    else if (type === 'packing_list') group.packingList = entry
  }

  return Array.from(groupMap.values()).sort((a, b) => a.groupId.localeCompare(b.groupId, undefined, { numeric: true }))
}

/** Truncate UUID filenames for display */
function displayFileName(name: string): string {
  if (isUuidFilename(name) && name.length > 20) {
    return name.slice(0, 8) + '...' + name.slice(-4)
  }
  return name
}

interface BatchUploadDialogProps {
  onClose: () => void
  onCreated: (shipmentIds: string[]) => void
}

export default function BatchUploadDialog({ onClose, onCreated }: BatchUploadDialogProps) {
  const [entries, setEntries] = React.useState<FileEntry[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const addFiles = React.useCallback((files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfFiles.length === 0) return

    const newEntries: FileEntry[] = pdfFiles.map((file) => {
      const detectedType = detectDocumentType(file.name)
      return {
        file,
        detectedType,
        assignedType: detectedType,
        groupId: '0',
      }
    })

    setEntries((prev) => {
      const all = [...prev, ...newEntries]
      return autoGroupFiles(all)
    })
  }, [])

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragOver(false)
      addFiles(event.dataTransfer.files)
    },
    [addFiles],
  )

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = React.useCallback(() => {
    setDragOver(false)
  }, [])

  const removeFile = (index: number) => {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return autoGroupFiles(next)
    })
  }

  const changeType = (index: number, newType: DocumentType | '') => {
    setEntries((prev) => {
      const next = prev.map((entry, i) =>
        i === index ? { ...entry, assignedType: newType || null } : entry,
      )
      return autoGroupFiles(next)
    })
  }

  const handleSubmit = async () => {
    // Send ALL files — server will AI-detect unknown types
    setUploading(true)
    setError(null)

    const formData = new FormData()
    entries.forEach((entry, entryIndex) => {
      formData.append(`file_${entryIndex}`, entry.file)
      formData.append(
        `meta_${entryIndex}`,
        JSON.stringify({
          groupId: entry.groupId,
          docType: entry.assignedType,
        }),
      )
    })

    try {
      const response = await fetch('/api/customs/customs/shipments/batch', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (data.ok) {
        onCreated(data.shipments.map((s: { id: string }) => s.id))
      } else {
        setError(data.error || 'Batch upload failed')
      }
    } catch {
      setError('Upload failed — check your connection')
    } finally {
      setUploading(false)
    }
  }

  const groups = buildGroupSummaries(entries)
  const unassigned = entries.filter((e) => !e.assignedType && !e.detectedType)
  const hasAnyFile = entries.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">Batch Upload</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Drop multiple PDFs at once. Document types are auto-detected from filenames, or by AI for generic filenames.
        </p>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-muted-foreground'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files)
              event.target.value = ''
            }}
          />
          <div className="text-muted-foreground">
            <div className="text-2xl mb-2">&#128195;</div>
            <div className="text-sm font-medium">Drop PDF files here or click to browse</div>
            <div className="text-xs mt-1">
              Descriptive filenames (bl_01.pdf, invoice_01.pdf) enable auto-grouping. Generic filenames are AI-classified on upload.
            </div>
          </div>
        </div>

        {/* File list with type assignments */}
        {hasAnyFile && (
          <div className="mt-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              {entries.length} file{entries.length !== 1 ? 's' : ''} added
            </h3>

            <div className="space-y-1.5">
              {entries.map((entry, index) => {
                const effectiveType = entry.assignedType ?? entry.detectedType
                return (
                  <div
                    key={`${entry.file.name}-${index}`}
                    className="flex items-center gap-2 text-sm bg-muted/30 rounded px-3 py-1.5"
                  >
                    <span
                      className="flex-1 truncate text-foreground font-mono text-xs"
                      title={entry.file.name}
                    >
                      {displayFileName(entry.file.name)}
                    </span>
                    {effectiveType && entry.groupId !== '0' && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        G{entry.groupId}
                      </span>
                    )}
                    <select
                      value={entry.assignedType ?? ''}
                      onChange={(event) =>
                        changeType(index, event.target.value as DocumentType | '')
                      }
                      className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground shrink-0"
                    >
                      <option value="">Auto-detect</option>
                      <option value="bill_of_lading">B/L</option>
                      <option value="commercial_invoice">Invoice</option>
                      <option value="packing_list">Packing List</option>
                    </select>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-destructive hover:text-destructive/80 text-xs px-1 shrink-0"
                      title="Remove"
                    >
                      &#10005;
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Group preview — only show if we have classified files */}
            {groups.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {groups.length} shipment{groups.length !== 1 ? 's' : ''} will be created
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {groups.map((group) => (
                    <div
                      key={group.groupId}
                      className="rounded border border-border p-3 bg-card"
                    >
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        Shipment Group {group.groupId}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.bl ? (
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs border ${docTypeColors.bill_of_lading}`}>
                            {docTypeLabels.bill_of_lading}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs border border-border text-muted-foreground">
                            B/L missing
                          </span>
                        )}
                        {group.invoice ? (
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs border ${docTypeColors.commercial_invoice}`}>
                            {docTypeLabels.commercial_invoice}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs border border-border text-muted-foreground">
                            Invoice missing
                          </span>
                        )}
                        {group.packingList ? (
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs border ${docTypeColors.packing_list}`}>
                            {docTypeLabels.packing_list}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs border border-border text-muted-foreground">
                            P/L missing
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unassigned.length > 0 && unassigned.length < entries.length && (
              <p className="text-xs text-primary">
                {unassigned.length} file{unassigned.length !== 1 ? 's' : ''} will be AI-classified on upload. You can also assign types manually above.
              </p>
            )}

            {unassigned.length > 0 && unassigned.length === entries.length && (
              <div className="rounded border border-border p-3 bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  All files will be AI-classified and grouped on upload. Document types and shipment grouping will be determined automatically from PDF content.
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-destructive text-sm mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || !hasAnyFile}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading
              ? 'Uploading & detecting...'
              : `Upload & Process${entries.length > 0 ? ` (${entries.length} file${entries.length !== 1 ? 's' : ''})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
