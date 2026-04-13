"use client"
import * as React from 'react'
import TariffTreeView from './TariffTreeView'

interface HsSuggestionData {
  hsCode: string
  description: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  source?: 'ai' | 'manual'
}

interface NonTariffMeasureDetail {
  description: string
  countryCode?: string
  countryDescription?: string
  conditions?: { code: string; description: string; action: string }[]
  certificates?: { code: string; description: string }[]
  regulationAbbreviation?: string
  regulationLink?: string
}

interface Isztar4ResultData {
  code: string
  description: string
  dutyAmount?: string
  supplementaryUnit?: string
  nonTariffMeasures?: (NonTariffMeasureDetail | string)[]
  valid: boolean
}

interface TariffTreeNodeData {
  code?: string
  description: string
  children?: TariffTreeNodeData[]
}

interface TariffTreePathData {
  chapterCode: string
  chapterDescription: string
  headingCode: string
  headingDescription: string
  leafCode: string
  leafDescription: string
  reasoning: string
  alternativeHeadings?: { code: string; description: string; note: string }[]
}

interface HsClassificationData {
  id: string
  lineNumber: number
  productDescription: string
  aiSuggestions: HsSuggestionData[]
  isztar4Results: Isztar4ResultData[]
  tariffTree?: TariffTreeNodeData | null
  aiPath?: TariffTreePathData | null
  selectedHsCode: string | null
  selectedDescription: string | null
  selectedDutyRate: string | null
  selectedAt: string | null
}

interface HistoryEntry {
  productDescription: string
  selectedHsCode: string
  selectedDescription: string | null
  selectedDutyRate: string | null
  selectedAt: string | null
}

interface HsClassificationPanelProps {
  classifications: HsClassificationData[]
  shipmentId: string
  productLines: unknown[]
  onRefresh: () => void
}

const confidenceColors: Record<string, string> = {
  high: 'bg-green-900/40 text-green-600 dark:text-green-400',
  medium: 'bg-amber-900/40 text-amber-600 dark:text-amber-400',
  low: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-destructive',
}

const confidenceDots: Record<string, string> = {
  high: 'bg-green-400',
  medium: 'bg-amber-400',
  low: 'bg-red-400',
}

function getMeasureDescription(measure: NonTariffMeasureDetail | string): string {
  return typeof measure === 'string' ? measure : measure.description
}

function hasDetails(measure: NonTariffMeasureDetail | string): boolean {
  if (typeof measure === 'string') return false
  return !!(measure.conditions?.length || measure.certificates?.length || measure.regulationAbbreviation)
}

function MeasureTag({ measure }: { measure: NonTariffMeasureDetail | string }) {
  const [expanded, setExpanded] = React.useState(false)
  const desc = getMeasureDescription(measure)
  const expandable = hasDetails(measure)
  const detail = typeof measure === 'string' ? null : measure

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={expandable ? () => setExpanded(!expanded) : undefined}
        className={`inline-flex items-center text-xs bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 px-2 py-0.5 rounded ${expandable ? 'cursor-pointer hover:bg-amber-500/30' : 'cursor-default'}`}
      >
        &#9888; {desc}
        {expandable && (
          <span className="ml-1 text-amber-600/80 dark:text-amber-400/60">{expanded ? '\u25B2' : '\u25BC'}</span>
        )}
      </button>
      {expanded && detail && (
        <div className="mt-1 ml-2 rounded border border-amber-200 dark:border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs space-y-1">
          {detail.countryDescription && (
            <div className="text-muted-foreground">
              <span className="font-medium text-amber-600/80 dark:text-amber-400/80">Applies to:</span> {detail.countryDescription}
            </div>
          )}
          {detail.conditions?.map((condition, conditionIndex) => (
            <div key={conditionIndex} className="text-muted-foreground">
              <span className="font-medium text-amber-600/80 dark:text-amber-400/80">Condition:</span> {condition.description}
              {condition.action && <span className="text-amber-600/80 dark:text-amber-400/60"> &rarr; {condition.action}</span>}
            </div>
          ))}
          {detail.certificates?.map((cert, certIndex) => (
            <div key={certIndex} className="text-muted-foreground">
              <span className="font-medium text-amber-600/80 dark:text-amber-400/80">Required:</span>{' '}
              <span className="font-mono text-amber-600/80 dark:text-amber-400/70">{cert.code}</span> {cert.description}
            </div>
          ))}
          {detail.regulationAbbreviation && (
            <div className="text-muted-foreground">
              <span className="font-medium text-amber-600/80 dark:text-amber-400/80">Regulation:</span>{' '}
              {detail.regulationLink ? (
                <a
                  href={detail.regulationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {detail.regulationAbbreviation}
                </a>
              ) : (
                detail.regulationAbbreviation
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistorySection({
  productDescription,
  onApplyHistoryCode,
  applying,
}: {
  productDescription: string
  onApplyHistoryCode: (hsCode: string) => void
  applying: string | null
}) {
  const [history, setHistory] = React.useState<HistoryEntry[] | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    if (loaded) return
    setLoaded(true)
    const query = productDescription.slice(0, 50)
    fetch(`/api/customs/customs/hs-history?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => setHistory(data.results ?? []))
      .catch(() => setHistory([]))
  }, [productDescription, loaded])

  if (history === null) return null
  if (history.length === 0) return null

  return (
    <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2 mb-2">
      <div className="text-xs font-medium text-primary/80 mb-1">Past classifications for similar products:</div>
      <div className="flex flex-wrap gap-2">
        {history.map((entry, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onApplyHistoryCode(entry.selectedHsCode)}
            disabled={applying === entry.selectedHsCode}
            className="inline-flex items-center gap-1 text-xs bg-primary/20 text-primary/80 px-2 py-0.5 rounded font-mono hover:bg-primary/30 cursor-pointer disabled:opacity-50"
            title={`Click to apply — ${entry.productDescription} — ${entry.selectedDescription ?? ''}`}
          >
            {applying === entry.selectedHsCode ? '...' : entry.selectedHsCode}
            {entry.selectedDutyRate && <span className="text-primary/70">({entry.selectedDutyRate})</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function HsClassificationPanel({
  classifications,
  shipmentId,
  productLines,
  onRefresh,
}: HsClassificationPanelProps) {
  const [classifying, setClassifying] = React.useState(false)
  const [expandedLines, setExpandedLines] = React.useState<Set<number>>(new Set())
  const [selecting, setSelecting] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [manualInputs, setManualInputs] = React.useState<Record<number, string>>({})
  const [manualLoading, setManualLoading] = React.useState<number | null>(null)
  const [manualError, setManualError] = React.useState<Record<number, string>>({})
  const [historyApplying, setHistoryApplying] = React.useState<string | null>(null)

  const handleClassify = async () => {
    setClassifying(true)
    setError(null)
    try {
      const response = await fetch(`/api/customs/customs/shipments/${shipmentId}/classify`, {
        method: 'POST',
      })
      if (response.ok) {
        const result = await response.json()
        if (result?.classifications) {
          const lineNumbers = new Set<number>(
            result.classifications.map((c: { lineNumber: number }) => c.lineNumber),
          )
          setExpandedLines(lineNumbers)
        }
        if (result?.errors?.length > 0) {
          setError(`Some classifications failed:\n${result.errors.join('\n')}`)
        }
        onRefresh()
      } else {
        const body = await response.json().catch(() => ({}))
        setError(body?.error ?? `Classification failed (${response.status})`)
      }
    } catch {
      setError('Classification request failed. Please try again.')
    } finally {
      setClassifying(false)
    }
  }

  const handleSelect = async (lineNumber: number, suggestion: HsSuggestionData, enrichment?: Isztar4ResultData) => {
    setSelecting(`${lineNumber}-${suggestion.hsCode}`)
    try {
      const response = await fetch(`/api/customs/customs/shipments/${shipmentId}/lines/${lineNumber}/select-hs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hsCode: suggestion.hsCode,
          description: enrichment?.description || suggestion.description,
          dutyRate: enrichment?.dutyAmount,
        }),
      })
      if (response.ok) {
        onRefresh()
      }
    } catch {
      // ignore
    } finally {
      setSelecting(null)
    }
  }

  const handleManualSubmit = async (lineNumber: number) => {
    const rawCode = (manualInputs[lineNumber] ?? '').trim()
    if (!rawCode) return

    // Validate: must be 4-10 digits (with optional dots/spaces)
    const cleanCode = rawCode.replace(/[\s.]/g, '')
    if (!/^\d{4,10}$/.test(cleanCode)) {
      setManualError((prev) => ({ ...prev, [lineNumber]: 'Enter 4-10 digit HS code' }))
      return
    }

    setManualLoading(lineNumber)
    setManualError((prev) => {
      const next = { ...prev }
      delete next[lineNumber]
      return next
    })

    try {
      const response = await fetch(`/api/customs/customs/shipments/${shipmentId}/lines/${lineNumber}/select-hs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hsCode: cleanCode.padEnd(10, '0'),
          description: null,
          dutyRate: null,
          enrich: true,
        }),
      })
      if (response.ok) {
        setManualInputs((prev) => {
          const next = { ...prev }
          delete next[lineNumber]
          return next
        })
        onRefresh()
      } else {
        const body = await response.json().catch(() => ({}))
        setManualError((prev) => ({ ...prev, [lineNumber]: body?.error ?? 'Failed to save' }))
      }
    } catch {
      setManualError((prev) => ({ ...prev, [lineNumber]: 'Request failed' }))
    } finally {
      setManualLoading(null)
    }
  }

  const toggleLine = (lineNumber: number) => {
    setExpandedLines((prev) => {
      const next = new Set(prev)
      if (next.has(lineNumber)) {
        next.delete(lineNumber)
      } else {
        next.add(lineNumber)
      }
      return next
    })
  }

  const handleApplyHistoryCode = async (lineNumber: number, hsCode: string, classification: HsClassificationData) => {
    // Check if the code matches an existing AI suggestion
    const matchingSuggestion = classification.aiSuggestions.find((s) => s.hsCode === hsCode)
    if (matchingSuggestion) {
      // Select the existing suggestion
      const enrichment = classification.isztar4Results[classification.aiSuggestions.indexOf(matchingSuggestion)]
      await handleSelect(lineNumber, matchingSuggestion, enrichment)
      return
    }

    // Otherwise, apply as manual entry with ISZTAR4 enrichment
    setHistoryApplying(hsCode)
    try {
      const response = await fetch(`/api/customs/customs/shipments/${shipmentId}/lines/${lineNumber}/select-hs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hsCode,
          description: null,
          dutyRate: null,
          enrich: true,
        }),
      })
      if (response.ok) {
        onRefresh()
      }
    } catch {
      // ignore
    } finally {
      setHistoryApplying(null)
    }
  }

  const handleTreeSelect = async (lineNumber: number, code: string, description: string) => {
    setSelecting(`${lineNumber}-${code}`)
    try {
      const response = await fetch(`/api/customs/customs/shipments/${shipmentId}/lines/${lineNumber}/select-hs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hsCode: code,
          description,
          dutyRate: null,
          enrich: true,
        }),
      })
      if (response.ok) {
        onRefresh()
      }
    } catch {
      // ignore
    } finally {
      setSelecting(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-foreground">HS Code Classification</h3>
        <button
          onClick={handleClassify}
          disabled={classifying || productLines.length === 0}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {classifying ? 'Classifying...' : 'Classify Products'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3">
          <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {classifications.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          No classifications yet. Click &quot;Classify Products&quot; to run AI-powered classification.
        </p>
      )}

      <div className="space-y-2">
        {classifications.map((classification) => {
          const isExpanded = expandedLines.has(classification.lineNumber)
          const isSelected = !!classification.selectedHsCode
          const hasSuggestions = classification.aiSuggestions.length > 0

          return (
            <div
              key={classification.id}
              className={`rounded-lg border ${isSelected ? 'border-green-300 dark:border-green-500/40 bg-green-50/50 dark:bg-green-500/5' : 'border-border'}`}
            >
              {/* Accordion header */}
              <button
                onClick={() => toggleLine(classification.lineNumber)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">
                    #{classification.lineNumber}
                  </span>
                  <span className="text-sm font-medium text-foreground">{classification.productDescription}</span>
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                      &#10003; {classification.selectedHsCode}
                    </span>
                  )}
                  {!hasSuggestions && !isSelected && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      No suggestions
                    </span>
                  )}
                  {hasSuggestions && !isSelected && (
                    <span className="text-xs text-muted-foreground">
                      {classification.aiSuggestions.length} suggestion{classification.aiSuggestions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isExpanded ? '\u25B2' : '\u25BC'}
                </span>
              </button>

              {/* Accordion body */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  {/* Classification history */}
                  <HistorySection
                    productDescription={classification.productDescription}
                    onApplyHistoryCode={(hsCode) => handleApplyHistoryCode(classification.lineNumber, hsCode, classification)}
                    applying={historyApplying}
                  />

                  {/* Tariff Tree view (grounded flow) */}
                  {classification.tariffTree && (
                    <TariffTreeView
                      tree={classification.tariffTree}
                      aiPath={classification.aiPath ?? null}
                      selectedHsCode={classification.selectedHsCode}
                      onSelectCode={(code, description) =>
                        handleTreeSelect(classification.lineNumber, code, description)
                      }
                      selecting={selecting !== null}
                    />
                  )}

                  {/* Suggestion cards — always shown when suggestions exist */}
                  {!hasSuggestions && !classification.tariffTree && (
                    <div className="rounded border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        AI classification returned no suggestions for this product line.
                        This may be due to a temporary API issue. Click &quot;Classify Products&quot; to retry.
                      </p>
                    </div>
                  )}

                  {hasSuggestions && (
                    <>
                      {classification.tariffTree && (
                        <div className="text-xs font-medium text-muted-foreground mt-3 mb-1 border-t border-border pt-3">
                          AI Suggestions — with ISZTAR4 enrichment
                        </div>
                      )}

                      {classification.aiSuggestions.map((suggestion, suggestionIndex) => {
                        const enrichment = classification.isztar4Results[suggestionIndex]
                        const isThisSelected = classification.selectedHsCode === suggestion.hsCode
                        const selectKey = `${classification.lineNumber}-${suggestion.hsCode}`
                        const isManual = suggestion.source === 'manual'

                        return (
                          <div
                            key={`${suggestion.hsCode}-${suggestion.source ?? 'ai'}`}
                            className={`rounded border p-3 ${isThisSelected ? 'border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10' : 'border-border bg-card'}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-bold text-foreground">{suggestion.hsCode}</span>
                                  {isManual ? (
                                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                      manual
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${confidenceColors[suggestion.confidence]}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${confidenceDots[suggestion.confidence]}`} />
                                      {suggestion.confidence}
                                    </span>
                                  )}
                                  {isThisSelected && (
                                    <span className="text-green-600 dark:text-green-400 text-xs font-medium">&#10003; Selected</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {enrichment?.valid ? enrichment.description : suggestion.description}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 italic">
                                  {suggestion.reasoning}
                                </p>

                                {/* ISZTAR4 enrichment data */}
                                {enrichment && enrichment.valid && (
                                  <div className="mt-2 flex flex-wrap gap-2 items-start">
                                    {enrichment.dutyAmount && (
                                      <span className="inline-flex items-center text-xs bg-primary/20 text-primary/80 px-2 py-0.5 rounded">
                                        Duty: {enrichment.dutyAmount}
                                      </span>
                                    )}
                                    {enrichment.supplementaryUnit && (
                                      <span className="inline-flex items-center text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                        Unit: {enrichment.supplementaryUnit}
                                      </span>
                                    )}
                                    {enrichment.nonTariffMeasures?.map((measure, measureIndex) => (
                                      <MeasureTag key={measureIndex} measure={measure} />
                                    ))}
                                  </div>
                                )}
                                {enrichment && !enrichment.valid && (
                                  <span className="inline-flex items-center text-xs text-muted-foreground mt-1">
                                    ISZTAR4 data unavailable
                                  </span>
                                )}
                              </div>

                              {!isThisSelected && (
                                <button
                                  onClick={() => handleSelect(classification.lineNumber, suggestion, enrichment)}
                                  disabled={selecting === selectKey}
                                  className="ml-3 px-2.5 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50 shrink-0 text-foreground"
                                >
                                  {selecting === selectKey ? '...' : 'Select'}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}

                  {/* Manual HS code input */}
                  <div className="rounded border border-dashed border-border p-3 bg-card">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Enter HS code manually
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 8429 5100"
                        value={manualInputs[classification.lineNumber] ?? ''}
                        onChange={(event) =>
                          setManualInputs((prev) => ({ ...prev, [classification.lineNumber]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleManualSubmit(classification.lineNumber)
                        }}
                        className="flex-1 text-sm font-mono border border-border rounded px-2 py-1 bg-background text-foreground placeholder:text-muted-foreground"
                      />
                      <button
                        onClick={() => handleManualSubmit(classification.lineNumber)}
                        disabled={manualLoading === classification.lineNumber || !(manualInputs[classification.lineNumber] ?? '').trim()}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                      >
                        {manualLoading === classification.lineNumber ? '...' : 'Apply'}
                      </button>
                    </div>
                    {manualError[classification.lineNumber] && (
                      <p className="text-xs text-destructive mt-1">{manualError[classification.lineNumber]}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
