"use client"
import * as React from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface DocumentInfo {
  id: string
  documentType: string
  fileName: string
}

interface PdfProofViewerProps {
  shipmentId: string
  documents: DocumentInfo[]
  activeDocId: string | null
  onDocChange: (docId: string) => void
  highlightQuote: string | null
  highlightPage: number | null
  highlightValue?: string | null
  scrollBehavior?: ScrollBehavior
}

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

interface HighlightRect {
  left: number
  top: number
  width: number
  height: number
}

const DOC_TYPE_LABELS: Record<string, string> = {
  bill_of_lading: 'B/L',
  commercial_invoice: 'Invoice',
  packing_list: 'Packing List',
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function itemToRect(item: TextItem, scale: number, pageHeightPts: number): HighlightRect {
  const transform = item.transform
  const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1])
  const xPts = transform[4]
  const yPts = transform[5]

  return {
    left: xPts * scale,
    top: (pageHeightPts - yPts - fontSize) * scale,
    width: (item.width || fontSize * item.str.length * 0.6) * scale,
    height: fontSize * scale * 1.2,
  }
}

/** Find all positions of `search` within `text` */
function findAllOccurrences(text: string, search: string): number[] {
  const positions: number[] = []
  let pos = 0
  while (pos <= text.length - search.length) {
    const found = text.indexOf(search, pos)
    if (found === -1) break
    positions.push(found)
    pos = found + 1
  }
  return positions
}

/** Check if match at [start, end) sits on word boundaries in text */
function isWordBounded(text: string, start: number, end: number): boolean {
  const before = start === 0 || /\W/.test(text[start - 1])
  const after = end >= text.length || /\W/.test(text[end])
  return before && after
}

/** Map a match position in concatenated text back to the overlapping TextItem rects */
function matchToRects(
  textItems: TextItem[],
  matchStart: number,
  matchLen: number,
  scale: number,
  pageHeightPts: number,
): HighlightRect[] {
  const rects: HighlightRect[] = []
  let charPos = 0
  for (const item of textItems) {
    const normalizedItem = normalizeText(item.str)
    const itemLen = normalizedItem.length + 1 // +1 for space separator
    const itemEnd = charPos + itemLen

    if (itemEnd > matchStart && charPos < matchStart + matchLen) {
      rects.push(itemToRect(item, scale, pageHeightPts))
    }
    charPos = itemEnd
  }
  return rects
}

/** Strategy 1: exact substring match — find best occurrence (word-bounded, last) */
function tryExactMatch(
  concatenated: string,
  search: string,
  textItems: TextItem[],
  scale: number,
  pageHeightPts: number,
): HighlightRect[] {
  const positions = findAllOccurrences(concatenated, search)
  if (positions.length === 0) return []

  const wordBounded = positions.filter((p) => isWordBounded(concatenated, p, p + search.length))
  // Prefer word-bounded matches; take the first one
  const bestMatch = wordBounded.length > 0
    ? wordBounded[0]
    : positions[0]
  return matchToRects(textItems, bestMatch, search.length, scale, pageHeightPts)
}

/** Strategy 2: word-sequence matching — find contiguous run of text items with best word overlap */
function tryWordSequenceMatch(
  textItems: TextItem[],
  searchWords: string[],
  scale: number,
  pageHeightPts: number,
): HighlightRect[] {
  if (searchWords.length === 0) return []

  let bestScore = 0
  let bestStart = -1
  let bestEnd = -1

  // Sliding window: try each starting text item, expand to cover matching words
  for (let start = 0; start < textItems.length; start++) {
    let matchedWords = 0
    const windowWords = new Set<string>()

    for (let end = start; end < Math.min(start + searchWords.length + 3, textItems.length); end++) {
      const itemWords = normalizeText(textItems[end].str).split(/\s+/).filter((w) => w.length > 0)
      for (const w of itemWords) windowWords.add(w)

      matchedWords = searchWords.filter((sw) => windowWords.has(sw)).length
      const score = matchedWords / searchWords.length

      if (score > bestScore) {
        bestScore = score
        bestStart = start
        bestEnd = end
      }
    }
  }

  // Require at least 50% of words to match
  if (bestScore < 0.5 || bestStart < 0) return []

  const rects: HighlightRect[] = []
  for (let idx = bestStart; idx <= bestEnd; idx++) {
    rects.push(itemToRect(textItems[idx], scale, pageHeightPts))
  }
  return rects
}

function findTextHighlights(
  textItems: TextItem[],
  quote: string | null,
  scale: number,
  pageHeightPts: number,
  fallbackValue?: string | null,
): HighlightRect[] {
  if (textItems.length === 0) return []

  const concatenated = normalizeText(textItems.map((item) => item.str).join(' '))

  // Try with quote first, then fallback value
  const candidates = [quote, fallbackValue].filter(
    (text): text is string => typeof text === 'string' && normalizeText(text).length >= 3,
  )

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)

    // Strategy 1: exact substring match
    const exactRects = tryExactMatch(concatenated, normalized, textItems, scale, pageHeightPts)
    if (exactRects.length > 0) return exactRects

    // Strategy 2: word-sequence match (handles spacing/punctuation differences)
    const words = normalized.split(/\s+/).filter((w) => w.length > 1)
    if (words.length >= 2) {
      const seqRects = tryWordSequenceMatch(textItems, words, scale, pageHeightPts)
      if (seqRects.length > 0) return seqRects
    }
  }

  return []
}

export default function PdfProofViewer({
  shipmentId,
  documents,
  activeDocId,
  onDocChange,
  highlightQuote,
  highlightPage,
  highlightValue,
  scrollBehavior = 'smooth',
}: PdfProofViewerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [pdfDataCache, setPdfDataCache] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(false)
  const [currentPage, setCurrentPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(0)
  const [highlights, setHighlights] = React.useState<HighlightRect[]>([])
  const [isScanned, setIsScanned] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = React.useState(1.0)
  const pdfDocRef = React.useRef<PDFDocumentProxy | null>(null)
  const cachedDocIdRef = React.useRef<string | null>(null)
  const renderTaskRef = React.useRef<{ cancel: () => void } | null>(null)

  const clampZoom = (z: number) => Math.min(3.0, Math.max(0.5, Math.round(z * 100) / 100))

  // Trackpad pinch-to-zoom (wheel + ctrlKey)
  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoomLevel((prev) => clampZoom(prev - e.deltaY * 0.01))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  // Fetch PDF data when active document changes
  React.useEffect(() => {
    if (!activeDocId) return
    if (pdfDataCache[activeDocId]) return

    setLoading(true)
    setError(null)
    fetch(`/api/customs/customs/shipments/${shipmentId}/documents/${activeDocId}/file`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load document')
        return response.json()
      })
      .then((data: { fileData: string }) => {
        if (data.fileData) {
          setPdfDataCache((prev) => ({ ...prev, [activeDocId]: data.fileData }))
        } else {
          setError('No file data available')
        }
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load document')
      })
      .finally(() => setLoading(false))
  }, [activeDocId, shipmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to highlight page when a verify request comes in
  React.useEffect(() => {
    if (highlightPage && highlightPage > 0 && highlightPage <= totalPages) {
      setCurrentPage(highlightPage)
    }
  }, [highlightPage, highlightQuote]) // eslint-disable-line react-hooks/exhaustive-deps

  // Render PDF page when data/page changes
  React.useEffect(() => {
    if (!activeDocId) return
    const base64 = pdfDataCache[activeDocId]
    if (!base64) return

    let cancelled = false

    async function renderPage() {
      setError(null)
      try {
        // Workaround: pdfjs-dist's internal worker setup uses dynamic import()
        // that Turbopack rewrites to a CDN URL (which 404s). Fix: fetch the
        // worker source from public/, create a blob URL, and set workerSrc to
        // that blob URL — it's same-origin so pdfjs creates a real Worker from it.
        if (!(window as any).__pdfjsBlobWorkerSrc) {
          const workerCode = await fetch('/pdf.worker.min.mjs').then((r) => r.text())
          const blob = new Blob([workerCode], { type: 'application/javascript' })
          ;(window as any).__pdfjsBlobWorkerSrc = URL.createObjectURL(blob)
        }

        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = (window as any).__pdfjsBlobWorkerSrc

        // Load PDF document (reuse if same)
        if (!pdfDocRef.current || cachedDocIdRef.current !== activeDocId) {
          const binaryData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
          const loadingTask = pdfjsLib.getDocument({ data: binaryData })
          const pdfDoc = await loadingTask.promise
          cachedDocIdRef.current = activeDocId
          pdfDocRef.current = pdfDoc
          if (!cancelled) setTotalPages(pdfDoc.numPages)
        }

        if (cancelled) return
        const pdfDoc = pdfDocRef.current!
        const pageNum = Math.min(currentPage, pdfDoc.numPages)
        const page = await pdfDoc.getPage(pageNum)

        const canvas = canvasRef.current
        if (!canvas || cancelled) return

        // Scale to fit container width, then apply zoom
        const containerWidth = containerRef.current?.clientWidth ?? 500
        const unscaledViewport = page.getViewport({ scale: 1 })
        const baseScale = containerWidth / unscaledViewport.width
        const scale = baseScale * zoomLevel
        const viewport = page.getViewport({ scale })

        canvas.width = viewport.width
        canvas.height = viewport.height

        // Cancel any in-flight render before starting a new one
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel()
          renderTaskRef.current = null
        }

        const renderTask = page.render({ canvas: canvasRef.current!, viewport })
        renderTaskRef.current = renderTask
        await renderTask.promise
        renderTaskRef.current = null

        // Get text layer for highlighting
        const textContent = await page.getTextContent()
        const textItems: TextItem[] = []
        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
            textItems.push({
              str: item.str,
              transform: item.transform,
              width: item.width,
              height: item.height,
            })
          }
        }

        // Check if this is a scanned document (no/minimal text layer)
        if (!cancelled) {
          setIsScanned(textItems.length < 5)
        }

        // Find highlights if we have a quote/value and we're on the right page
        const hasHighlightSource = highlightQuote || highlightValue
        if (!cancelled && hasHighlightSource && currentPage === (highlightPage ?? 1)) {
          const rects = findTextHighlights(
            textItems,
            highlightQuote,
            scale,
            unscaledViewport.height,
            highlightValue,
          )
          setHighlights(rects)
          // Scroll the first highlight into view within this viewer's scroll area
          if (rects.length > 0 && containerRef.current) {
            const scrollContainer = containerRef.current
            // Only scroll if container actually has scrollable overflow
            if (scrollContainer.scrollHeight > scrollContainer.clientHeight || scrollContainer.scrollWidth > scrollContainer.clientWidth) {
              const firstRect = rects[0]
              const canvasWrapperTop = canvasRef.current?.parentElement?.offsetTop ?? 0
              const targetX = firstRect.left + firstRect.width / 2 - scrollContainer.clientWidth / 2
              const targetY = canvasWrapperTop + firstRect.top + firstRect.height / 2 - scrollContainer.clientHeight / 2
              requestAnimationFrame(() => scrollContainer.scrollTo({
                left: Math.max(0, targetX),
                top: Math.max(0, targetY),
                behavior: scrollBehavior,
              }))
            }
          }
        } else if (!cancelled) {
          setHighlights([])
        }
      } catch (renderError) {
        // Ignore cancellation errors (expected when a new render supersedes this one)
        const message = renderError instanceof Error ? renderError.message : String(renderError)
        if (message.includes('cancelled') || message.includes('Rendering cancelled')) return
        if (!cancelled) {
          console.error('[PdfProofViewer] Render error:', renderError)
          setError('Failed to render PDF')
        }
      }
    }

    renderPage()
    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
    }
  }, [activeDocId, pdfDataCache, currentPage, highlightQuote, highlightPage, highlightValue, zoomLevel]) // eslint-disable-line react-hooks/exhaustive-deps

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-full">
      {/* Document selector tabs */}
      <div className="flex border-b border-border px-2 pt-1 shrink-0">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => {
              onDocChange(doc.id)
              setCurrentPage(1)
              setHighlights([])
              setZoomLevel(1.0)
            }}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
              activeDocId === doc.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
          </button>
        ))}
      </div>

      {/* PDF viewer area */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        {loading && (
          <div className="flex items-center justify-center p-8">
            <p className="text-xs text-muted-foreground">Loading PDF...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center p-8">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {!loading && !error && !activeDocId && (
          <div className="flex items-center justify-center p-8">
            <p className="text-xs text-muted-foreground">Select a document to view</p>
          </div>
        )}

        {/* Scanned document notice */}
        {isScanned && activeDocId && !loading && (
          <div className="mx-2 mt-2 rounded border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Scanned document — text highlighting unavailable.
            </p>
          </div>
        )}

        {/* Quote overlay when highlighting */}
        {(highlightQuote || highlightValue) && activeDocId && !loading && (
          <div className="mx-2 mt-2 rounded border border-primary/30 bg-primary/10 px-3 py-1.5">
            <p className="text-xs text-primary/80 font-mono">
              &ldquo;{highlightQuote ?? highlightValue}&rdquo;
            </p>
          </div>
        )}

        {/* Canvas + highlight overlays */}
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="block" />

          {/* Highlight rectangles — pixel-positioned over canvas */}
          {highlights.map((rect, index) => (
            <div
              key={index}
              className="absolute pointer-events-none rounded-sm"
              style={{
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                backgroundColor: 'rgba(59, 130, 246, 0.25)',
                border: '2px solid rgba(59, 130, 246, 0.7)',
                boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Page navigation + zoom controls */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2 py-0.5 text-xs border border-border rounded hover:bg-muted disabled:opacity-30 text-foreground"
            >
              &#9664;
            </button>
            <span className="text-xs text-muted-foreground">
              {currentPage}/{totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2 py-0.5 text-xs border border-border rounded hover:bg-muted disabled:opacity-30 text-foreground"
            >
              &#9654;
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoomLevel((z) => clampZoom(z - 0.25))}
              disabled={zoomLevel <= 0.5}
              className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-muted disabled:opacity-30 text-foreground"
            >
              &minus;
            </button>
            <span className="text-xs text-muted-foreground w-10 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => clampZoom(z + 0.25))}
              disabled={zoomLevel >= 3.0}
              className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-muted disabled:opacity-30 text-foreground"
            >
              +
            </button>
            {zoomLevel !== 1.0 && (
              <button
                onClick={() => setZoomLevel(1.0)}
                className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground"
              >
                Fit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
