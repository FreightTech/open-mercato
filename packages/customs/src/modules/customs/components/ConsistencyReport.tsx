"use client"
import * as React from 'react'
import PdfProofViewer from './PdfProofViewer'

interface ConsistencyCheckData {
  id: string
  field: string
  label: string
  sourceDoc1: string
  sourceDoc2: string
  value1: unknown
  value2: unknown
  status: 'ok' | 'mismatch' | 'missing' | 'warning'
  discrepancy: string | null
}

interface ParsedDocumentData {
  id: string
  documentType: string
  fileName: string
  extracted: Record<string, unknown> | null
}

interface SourceQuote {
  quote: string
  page: number
}

interface ConsistencyReportProps {
  checks: ConsistencyCheckData[]
  documents?: ParsedDocumentData[]
  shipmentId?: string
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  warning: { label: 'Warn', className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' },
  mismatch: { label: 'Fail', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  missing: { label: 'N/A', className: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400' },
}

/** Map display labels back to document type strings */
const DOC_LABEL_TO_TYPE: Record<string, string> = {
  'B/L': 'bill_of_lading',
  'Invoice': 'commercial_invoice',
  'Packing List': 'packing_list',
}

/**
 * Cross-field comparisons: the consistency checker sometimes compares different
 * fields across documents. This maps check field → { docType → sourceQuoteKey }.
 * If a field is not listed here, both sides use the same base key.
 */
const CROSS_FIELD_QUOTES: Record<string, Record<string, string>> = {
  invoiceReference: {
    commercial_invoice: 'documentNumber',
    packing_list: 'invoiceReference',
  },
}

/** Strip pair suffixes to get the base entity field key for _sourceQuotes lookup */
function getBaseFieldKey(field: string): string {
  return field
    .replace(/_bl_inv$/, '')
    .replace(/_bl_pl$/, '')
    .replace(/_inv_pl$/, '')
}

function getSourceQuote(
  documents: ParsedDocumentData[],
  sourceLabel: string,
  checkField: string,
): { docId: string; quote: SourceQuote } | null {
  const docType = DOC_LABEL_TO_TYPE[sourceLabel]
  if (!docType) return null

  const doc = documents.find((d) => d.documentType === docType)
  if (!doc?.extracted) return null

  const quotes = doc.extracted._sourceQuotes as Record<string, SourceQuote> | undefined
  if (!quotes) return null

  // Check cross-field mapping first
  const baseField = getBaseFieldKey(checkField)
  const crossMap = CROSS_FIELD_QUOTES[baseField]
  const quoteKey = crossMap?.[docType] ?? baseField

  const entry = quotes[quoteKey]
  if (!entry?.quote) return null

  return { docId: doc.id, quote: entry }
}

function formatCheckValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

/** Extracted as a component to isolate each expansion's PDF viewer state */
function ExpandedProofPanel({
  shipmentId,
  check,
  doc1,
  doc2,
  source1,
  source2,
}: {
  shipmentId: string
  check: ConsistencyCheckData
  doc1: ParsedDocumentData | null
  doc2: ParsedDocumentData | null
  source1: { docId: string; quote: SourceQuote } | null
  source2: { docId: string; quote: SourceQuote } | null
}) {
  return (
    <div className="grid grid-cols-2 gap-3 p-3 bg-muted/10">
      {/* Source 1 viewer */}
      <div className="min-w-0 overflow-hidden">
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          {check.sourceDoc1}: <span className="text-foreground">{formatCheckValue(check.value1)}</span>
        </div>
        {doc1 ? (
          <div style={{ height: '400px' }}>
            <PdfProofViewer
              shipmentId={shipmentId}
              documents={[{ id: doc1.id, documentType: doc1.documentType, fileName: doc1.fileName }]}
              activeDocId={doc1.id}
              onDocChange={() => {}}
              highlightQuote={source1?.quote.quote ?? null}
              highlightPage={source1?.quote.page ?? null}
              highlightValue={check.value1 != null ? String(check.value1) : null}
              scrollBehavior="instant"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-[400px] rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">Document not available</p>
          </div>
        )}
      </div>

      {/* Source 2 viewer */}
      <div className="min-w-0 overflow-hidden">
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          {check.sourceDoc2}: <span className="text-foreground">{formatCheckValue(check.value2)}</span>
        </div>
        {doc2 && check.value2 != null ? (
          <div style={{ height: '400px' }}>
            <PdfProofViewer
              shipmentId={shipmentId}
              documents={[{ id: doc2.id, documentType: doc2.documentType, fileName: doc2.fileName }]}
              activeDocId={doc2.id}
              onDocChange={() => {}}
              highlightQuote={source2?.quote.quote ?? null}
              highlightPage={source2?.quote.page ?? null}
              highlightValue={check.value2 != null ? String(check.value2) : null}
              scrollBehavior="instant"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-[400px] rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">
              Field not present in {check.sourceDoc2}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ConsistencyReport({ checks, documents, shipmentId }: ConsistencyReportProps) {
  const [expandedCheckId, setExpandedCheckId] = React.useState<string | null>(null)
  const clickedRowRef = React.useRef<{ element: HTMLElement; viewportTop: number } | null>(null)

  // After DOM mutation, correct scroll so the clicked row stays at the same viewport position
  React.useLayoutEffect(() => {
    if (clickedRowRef.current) {
      const { element, viewportTop: savedTop } = clickedRowRef.current
      const newTop = element.getBoundingClientRect().top
      const delta = newTop - savedTop
      if (delta !== 0) {
        window.scrollBy({ top: delta, behavior: 'instant' })
      }
      clickedRowRef.current = null
    }
  }, [expandedCheckId])

  // Sort: mismatches first, then warnings, then missing, then ok
  const statusOrder: Record<string, number> = { mismatch: 0, warning: 1, missing: 2, ok: 3 }
  const sorted = [...checks].sort(
    (checkA, checkB) => (statusOrder[checkA.status] ?? 4) - (statusOrder[checkB.status] ?? 4),
  )

  const mismatchCount = checks.filter((check) => check.status === 'mismatch').length
  const warningCount = checks.filter((check) => check.status === 'warning').length
  const missingCount = checks.filter((check) => check.status === 'missing').length
  const okCount = checks.filter((check) => check.status === 'ok').length

  const canExpand = documents && documents.length > 0 && shipmentId

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-red-700 dark:text-red-400 font-medium">{mismatchCount} mismatches</span>
        <span className="text-orange-700 dark:text-orange-400 font-medium">{warningCount} warnings</span>
        <span className="text-muted-foreground font-medium">{missingCount} missing</span>
        <span className="text-green-700 dark:text-green-400 font-medium">{okCount} OK</span>
      </div>

      {/* Check table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-foreground w-14"></th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Field</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Source 1</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Value 1</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Source 2</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Value 2</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Discrepancy</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((check) => {
              const badge = STATUS_BADGES[check.status] ?? STATUS_BADGES.ok
              const isExpanded = expandedCheckId === check.id

              // Look up source quotes for expansion
              const source1 = canExpand ? getSourceQuote(documents, check.sourceDoc1, check.field) : null
              const source2 = canExpand ? getSourceQuote(documents, check.sourceDoc2, check.field) : null
              const doc1Type = DOC_LABEL_TO_TYPE[check.sourceDoc1]
              const doc2Type = DOC_LABEL_TO_TYPE[check.sourceDoc2]
              const doc1 = canExpand ? documents.find((d) => d.documentType === doc1Type) : null
              const doc2 = canExpand ? documents.find((d) => d.documentType === doc2Type) : null

              return (
                <React.Fragment key={check.id}>
                  <tr
                    onClick={(e) => {
                      if (!canExpand) return
                      const row = e.currentTarget as HTMLElement
                      clickedRowRef.current = { element: row, viewportTop: row.getBoundingClientRect().top }
                      setExpandedCheckId(isExpanded ? null : check.id)
                    }}
                    className={`border-b border-border transition-colors ${
                      check.status === 'mismatch' ? 'bg-red-50 dark:bg-red-500/5' :
                      check.status === 'warning' ? 'bg-orange-50 dark:bg-orange-500/5' :
                      check.status === 'missing' ? 'bg-muted/20' : ''
                    } ${canExpand ? 'cursor-pointer hover:bg-muted/40' : ''} ${
                      isExpanded ? 'bg-primary/10 hover:bg-primary/10' : ''
                    }`}
                  >
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-medium text-xs text-foreground">
                      {check.label}
                      {isExpanded && <span className="ml-1 text-primary/60 text-[10px]">&#9650;</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{check.sourceDoc1}</td>
                    <td className="px-3 py-1.5 text-xs text-foreground">{formatCheckValue(check.value1)}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{check.sourceDoc2}</td>
                    <td className="px-3 py-1.5 text-xs text-foreground">{formatCheckValue(check.value2)}</td>
                    <td className={`px-3 py-1.5 text-xs ${
                      check.status === 'mismatch' ? 'text-red-700 dark:text-red-400 font-medium' :
                      check.status === 'warning' ? 'text-orange-700 dark:text-orange-400 font-medium' :
                      'text-muted-foreground'
                    }`}>
                      {check.discrepancy ?? '—'}
                    </td>
                  </tr>

                  {/* Expanded inline proof panel */}
                  {isExpanded && canExpand && (
                    <tr className="border-b border-border">
                      <td colSpan={7} className="p-0">
                        <ExpandedProofPanel
                          shipmentId={shipmentId}
                          check={check}
                          doc1={doc1 ?? null}
                          doc2={doc2 ?? null}
                          source1={source1}
                          source2={source2}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
