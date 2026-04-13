import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { RefreshCw, Download, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExchangeRateSection } from './ExchangeRateSection'
import type { ExchangeRateRow } from './ExchangeRateSection'
import type { ExchangeRateSnapshot, FmsCostGroupingMode } from '../../fms_offers/data/types'
import type { WizardItem } from '../lib/wizard-types'
import type { ChargeRow } from './ChargesTable'

type OfferTabInfo = { offerId: string; label: string; offerNumber: string }

type PdfMode = 'combined' | 'separate'

type WizardStepPreviewProps = {
  editableItems: WizardItem[]
  calculations: Array<{ chargeRows: ChargeRow[] }>
  offerId: string | null
  flushPendingSync?: () => Promise<void>
  specialTerms?: string
  onSpecialTermsChange?: (text: string) => void
  initialBaseCurrency?: string | null
  initialExchangeRates?: ExchangeRateSnapshot[] | null
  clientName?: string
  /** When the wizard has multiple offer tabs, pass them here for group PDF support */
  offerTabs?: OfferTabInfo[]
  /** Controlled PDF mode from parent (so parent can disable tabs in combined mode) */
  pdfMode?: PdfMode
  onPdfModeChange?: (mode: PdfMode) => void
}

const GROUPING_OPTIONS: Array<{ value: FmsCostGroupingMode; label: string }> = [
  { value: 'itemized', label: 'Itemized' },
  { value: 'section_totals', label: 'Main + Destination (totals)' },
  { value: 'all_in', label: 'Freight forwarding (all-in)' },
]

export function WizardStepPreview({ editableItems, calculations, offerId, flushPendingSync, specialTerms, onSpecialTermsChange, initialBaseCurrency, initialExchangeRates, clientName, offerTabs, pdfMode: controlledPdfMode, onPdfModeChange }: WizardStepPreviewProps) {
  const t = useT()
  const [baseCurrency, setBaseCurrency] = useState(initialBaseCurrency || 'USD')
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateSnapshot[]>(initialExchangeRates || [])
  const [groupingMode, setGroupingMode] = useState<FmsCostGroupingMode>('itemized')
  const [expandedSidebar, setExpandedSidebar] = useState<Set<string>>(new Set(['currencies', 'validity', 'grouping', 'offers']))

  // Multi-offer PDF selection
  const hasMultipleOffers = (offerTabs?.length ?? 0) > 1
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set())
  const [internalPdfMode, setInternalPdfMode] = useState<PdfMode>('combined')
  const pdfMode = controlledPdfMode ?? internalPdfMode
  const setPdfMode = useCallback((mode: PdfMode) => {
    setInternalPdfMode(mode)
    onPdfModeChange?.(mode)
  }, [onPdfModeChange])

  // Initialize selected offers when tabs change
  useEffect(() => {
    if (offerTabs && offerTabs.length > 0) {
      setSelectedOfferIds(new Set(offerTabs.map((tab) => tab.offerId)))
    }
  }, [offerTabs])

  const toggleOfferSelection = useCallback((id: string) => {
    setSelectedOfferIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        // Don't allow deselecting all — keep at least one
        if (next.size > 1) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectedOfferIdsArray = React.useMemo(
    () => offerTabs?.filter((tab) => selectedOfferIds.has(tab.offerId)).map((tab) => tab.offerId) ?? [],
    [offerTabs, selectedOfferIds],
  )
  const [validityMode, setValidityMode] = useState<'days' | 'date'>('days')
  const [validityDays, setValidityDays] = useState(14)
  const [validityDate, setValidityDate] = useState('')
  const [paymentDays, setPaymentDays] = useState(14)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)

  // --- PDF preview state ---
  const [previewPages, setPreviewPages] = useState<string[]>([])
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewGeneration, setPreviewGeneration] = useState(0)

  useEffect(() => {
    if (initialBaseCurrency) setBaseCurrency(initialBaseCurrency)
  }, [initialBaseCurrency])

  useEffect(() => {
    if (initialExchangeRates && initialExchangeRates.length > 0) setExchangeRates(initialExchangeRates)
  }, [initialExchangeRates])

  const usedCurrencies = React.useMemo(() => {
    const codes = new Set<string>()
    for (const calc of calculations) {
      for (const row of calc.chargeRows) {
        if (row.currencyCode) codes.add(row.currencyCode)
      }
    }
    return [...codes]
  }, [calculations])

  // --- Persist offer settings (debounced) ---

  const persistOfferSettings = useCallback((fields: Record<string, unknown>) => {
    if (!offerId) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify(fields),
        headers: { 'Content-Type': 'application/json' },
      })
      setPreviewGeneration((n) => n + 1)
    }, 500)
  }, [offerId])

  const handleRatesLoaded = useCallback((rates: ExchangeRateRow[]) => {
    const snapshots: ExchangeRateSnapshot[] = rates.map((r) => ({
      fromCurrencyCode: r.fromCurrencyCode,
      toCurrencyCode: r.toCurrencyCode,
      rate: r.rate,
      date: r.date,
      source: r.source,
    }))
    setExchangeRates(snapshots)
    persistOfferSettings({ baseCurrency, exchangeRates: snapshots, costGroupingMode: groupingMode })
  }, [baseCurrency, groupingMode, persistOfferSettings])

  const handleBaseCurrencyChange = useCallback((code: string) => {
    setBaseCurrency(code)
    persistOfferSettings({ baseCurrency: code, exchangeRates, costGroupingMode: groupingMode })
  }, [exchangeRates, groupingMode, persistOfferSettings])

  // Mark mounted after initial render to skip persistence effects on mount
  useEffect(() => {
    mountedRef.current = true
  }, [])

  // Persist grouping mode
  useEffect(() => {
    if (!mountedRef.current || !offerId) return
    const timer = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify({ costGroupingMode: groupingMode }),
        headers: { 'Content-Type': 'application/json' },
      })
      setPreviewGeneration((n) => n + 1)
    }, 300)
    return () => clearTimeout(timer)
  }, [groupingMode, offerId])

  // Persist validity settings
  useEffect(() => {
    if (!mountedRef.current || !offerId) return
    let validUntil: string | null = null
    if (validityMode === 'date' && validityDate) {
      validUntil = new Date(validityDate).toISOString()
    } else {
      const d = new Date()
      d.setDate(d.getDate() + validityDays)
      validUntil = d.toISOString()
    }
    const timer = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify({ validUntil }),
        headers: { 'Content-Type': 'application/json' },
      })
      setPreviewGeneration((n) => n + 1)
    }, 500)
    return () => clearTimeout(timer)
  }, [validityMode, validityDays, validityDate, offerId])

  // Persist payment terms
  useEffect(() => {
    if (!mountedRef.current || !offerId) return
    const timer = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify({ paymentTerms: `${paymentDays} days from invoice` }),
        headers: { 'Content-Type': 'application/json' },
      })
      setPreviewGeneration((n) => n + 1)
    }, 500)
    return () => clearTimeout(timer)
  }, [paymentDays, offerId])

  useEffect(() => {
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current) }
  }, [])

  const toggleSidebar = useCallback((id: string) => {
    setExpandedSidebar((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // --- PDF preview fetch ---

  const fetchPreview = useCallback(async () => {
    if (!offerId) return
    if (flushPendingSync) await flushPendingSync()
    setPdfLoading(true)
    try {
      // Use group endpoint when multiple offers are selected in combined mode
      const useGroupPreview = hasMultipleOffers && selectedOfferIdsArray.length > 1 && pdfMode === 'combined'
      const previewUrl = useGroupPreview
        ? `/api/fms_offers/offer-group-preview-images?offerIds=${selectedOfferIdsArray.join(',')}&t=${Date.now()}`
        : `/api/fms_offers/offers/${offerId}/preview-images?t=${Date.now()}`

      const response = await fetch(previewUrl)
      if (!response.ok) return
      const data = await response.json()
      if (data.pages) setPreviewPages(data.pages)
    } finally {
      setPdfLoading(false)
    }
  }, [offerId, flushPendingSync, hasMultipleOffers, selectedOfferIdsArray, pdfMode])

  // Initial load
  useEffect(() => {
    fetchPreview()
  }, [offerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced re-fetch when settings change
  useEffect(() => {
    if (!offerId || previewGeneration === 0) return
    const timer = setTimeout(fetchPreview, 800)
    return () => clearTimeout(timer)
  }, [previewGeneration]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when offer selection or PDF mode changes
  const prevSelectionKeyRef = useRef('')
  useEffect(() => {
    const key = `${[...selectedOfferIds].sort().join(',')}:${pdfMode}`
    if (prevSelectionKeyRef.current && prevSelectionKeyRef.current !== key) {
      const timer = setTimeout(fetchPreview, 300)
      return () => clearTimeout(timer)
    }
    prevSelectionKeyRef.current = key
  }, [selectedOfferIds, pdfMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bump preview when special terms change (parent persists them)
  const prevSpecialTermsRef = useRef(specialTerms)
  useEffect(() => {
    if (prevSpecialTermsRef.current !== specialTerms) {
      prevSpecialTermsRef.current = specialTerms
      const timer = setTimeout(() => setPreviewGeneration((n) => n + 1), 800)
      return () => clearTimeout(timer)
    }
  }, [specialTerms])

  // PDF download
  const handleDownloadPdf = useCallback(async () => {
    if (!offerId) return
    if (flushPendingSync) await flushPendingSync()

    const useGroupDownload = hasMultipleOffers && selectedOfferIdsArray.length > 1 && pdfMode === 'combined'

    if (useGroupDownload) {
      const response = await fetch(`/api/fms_offers/offer-group-pdf?offerIds=${selectedOfferIdsArray.join(',')}&mode=combined`)
      if (!response.ok) return
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `offers-combined.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } else if (hasMultipleOffers && selectedOfferIdsArray.length > 1 && pdfMode === 'separate') {
      // Download individual PDFs
      for (const id of selectedOfferIdsArray) {
        const response = await fetch(`/api/fms_offers/offers/${id}/pdf`)
        if (!response.ok) continue
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        const tab = offerTabs?.find((t) => t.offerId === id)
        anchor.download = `offer-${tab?.offerNumber || id}.pdf`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      }
    } else {
      const response = await fetch(`/api/fms_offers/offers/${offerId}/pdf`)
      if (!response.ok) return
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `offer-${offerId}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    }
  }, [offerId, flushPendingSync, hasMultipleOffers, selectedOfferIdsArray, pdfMode, offerTabs])

  const firstItem = editableItems[0]
  const incoterm = firstItem?.incoterm

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left — PDF Preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--muted)' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px',
          padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--background)',
        }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchPreview}
            disabled={pdfLoading}
          >
            {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span style={{ marginLeft: '4px' }}>{t('fms_offers.preview.refresh', 'Refresh')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={!offerId}
          >
            <Download className="w-4 h-4" />
            <span style={{ marginLeft: '4px' }}>{t('fms_offers.preview.download', 'Download')}</span>
          </Button>
        </div>

        {/* Page images */}
        <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
          {pdfLoading && previewPages.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--muted)', zIndex: 1,
            }}>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
            </div>
          )}
          {pdfLoading && previewPages.length > 0 && (
            <div style={{
              position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px',
              fontSize: '12px', color: 'var(--muted-foreground)', zIndex: 2,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('fms_offers.preview.updating', 'Updating preview...')}
            </div>
          )}
          {previewPages.length > 0 ? (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              {previewPages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Page ${i + 1}`}
                  style={{
                    maxWidth: '100%', width: '100%',
                    borderRadius: '4px', border: '1px solid var(--border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                />
              ))}
            </div>
          ) : !pdfLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              {t('fms_offers.preview.noPreview', 'No preview available')}
            </div>
          ) : null}
        </div>
      </div>

      {/* Right — Sidebar controls */}
      <div style={{ width: '320px', flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid var(--border)' }}>
        {/* Offers in PDF — only shown when multiple offer tabs exist */}
        {hasMultipleOffers && offerTabs && (
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSidebar('offers')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              {expandedSidebar.has('offers') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {t('fms_offers.preview.offersInPdf', 'Offers in PDF')}
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 400 }}>
                {selectedOfferIds.size}/{offerTabs.length}
              </span>
            </button>
            {expandedSidebar.has('offers') && (
              <div style={{ padding: '0 16px 12px' }}>
                {/* Offer checkboxes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {offerTabs.map((tab) => (
                    <label
                      key={tab.offerId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 8px', fontSize: '13px', cursor: 'pointer',
                        borderRadius: '6px',
                        background: selectedOfferIds.has(tab.offerId) ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedOfferIds.has(tab.offerId)}
                        onChange={() => toggleOfferSelection(tab.offerId)}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <span style={{ fontWeight: 500 }}>{tab.label}</span>
                      {tab.offerNumber && (
                        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
                          #{tab.offerNumber}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                {/* Combined / Separate toggle */}
                <div style={{ display: 'flex', gap: '4px', padding: '2px', background: 'var(--muted)', borderRadius: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPdfMode('combined')}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: '12px', fontWeight: 500,
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                      background: pdfMode === 'combined' ? 'var(--background)' : 'transparent',
                      color: pdfMode === 'combined' ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: pdfMode === 'combined' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {t('fms_offers.preview.combinedPdf', 'Combined PDF')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfMode('separate')}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: '12px', fontWeight: 500,
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                      background: pdfMode === 'separate' ? 'var(--background)' : 'transparent',
                      color: pdfMode === 'separate' ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: pdfMode === 'separate' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {t('fms_offers.preview.separatePdfs', 'Separate PDFs')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recipient */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            {t('fms_offers.preview.recipient', 'Recipient & summary')}
          </div>
          <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Client</span>
              <span style={{ fontWeight: 500 }}>{clientName || '—'}</span>
            </div>
            {incoterm && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Incoterms</span>
                <span style={{ fontWeight: 600 }}>{incoterm.toUpperCase()}</span>
              </div>
            )}
            {firstItem?.origin && firstItem?.destination && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Route</span>
                <span style={{ fontWeight: 500 }}>{firstItem.origin} → {firstItem.destination}</span>
              </div>
            )}
            {firstItem?.transportMode && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Transport</span>
                <span style={{ fontWeight: 500 }}>{firstItem.transportMode.charAt(0).toUpperCase() + firstItem.transportMode.slice(1)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Currencies & rates */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSidebar('currencies')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            {expandedSidebar.has('currencies') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {t('fms_offers.preview.currencies', 'Currencies & rates')}
          </button>
          {expandedSidebar.has('currencies') && (
            <div style={{ padding: '0 16px 12px' }}>
              <ExchangeRateSection
                usedCurrencies={usedCurrencies}
                baseCurrency={baseCurrency}
                onBaseCurrencyChange={handleBaseCurrencyChange}
                onRatesLoaded={handleRatesLoaded}
                originalCurrency={usedCurrencies[0] || 'USD'}
              />
            </div>
          )}
        </div>

        {/* Validity */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSidebar('validity')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            {expandedSidebar.has('validity') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {t('fms_offers.preview.validity', 'Offer validity')}
          </button>
          {expandedSidebar.has('validity') && (
            <div style={{ padding: '0 16px 12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="validityType" checked={validityMode === 'days'} onChange={() => setValidityMode('days')} style={{ accentColor: 'var(--primary)' }} />
                  <span>{t('fms_offers.preview.validityDays', 'Number of days')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="validityType" checked={validityMode === 'date'} onChange={() => setValidityMode('date')} style={{ accentColor: 'var(--primary)' }} />
                  <span>{t('fms_offers.preview.validityDate', 'Date')}</span>
                </label>
              </div>
              {validityMode === 'days' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    value={validityDays}
                    onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)}
                    style={{
                      width: '60px', padding: '6px 8px', border: '1px solid var(--border)',
                      borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', textAlign: 'center', outline: 'none',
                    }}
                  />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {t('fms_offers.preview.daysFromIssue', 'days from issue date')}
                  </span>
                </div>
              ) : (
                <input
                  type="date"
                  value={validityDate}
                  onChange={(e) => setValidityDate(e.target.value)}
                  style={{
                    width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                    borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                    color: 'var(--foreground)', background: 'var(--background)',
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Payment terms */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSidebar('payment')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            {expandedSidebar.has('payment') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {t('fms_offers.preview.paymentTerms', 'Payment terms')}
          </button>
          {expandedSidebar.has('payment') && (
            <div style={{ padding: '0 16px 12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(parseInt(e.target.value) || 0)}
                  style={{
                    width: '60px', padding: '6px 8px', border: '1px solid var(--border)',
                    borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', textAlign: 'center', outline: 'none',
                  }}
                />
                <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                  {t('fms_offers.preview.daysFromInvoice', 'days from invoice date')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cost grouping */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSidebar('grouping')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            {expandedSidebar.has('grouping') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {t('fms_offers.preview.grouping', 'Item grouping')}
          </button>
          {expandedSidebar.has('grouping') && (
            <div style={{ padding: '0 16px 12px' }}>
              {GROUPING_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 0', fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="groupingMode"
                    checked={groupingMode === opt.value}
                    onChange={() => setGroupingMode(opt.value)}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Terms & Conditions */}
        {onSpecialTermsChange && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              {t('fms_offers.preview.termsAndConditions', 'Terms & Conditions')}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
              {t('fms_offers.preview.termsHint', 'Enter terms, conditions, and special clauses. Each paragraph will appear as a separate item in the PDF.')}
            </p>
            <textarea
              value={specialTerms || ''}
              onChange={(e) => onSpecialTermsChange(e.target.value)}
              placeholder={t('fms_offers.preview.termsPlaceholder', 'e.g. Rates are subject to availability and may change based on market conditions.\n\nAdditional charges may apply for special handling, customs clearance delays, or demurrage.\n\nFree time: 14 days at destination.')}
              rows={8}
              style={{
                width: '100%', padding: '10px 12px', fontSize: '12px', lineHeight: 1.6,
                border: '1px solid var(--border)', borderRadius: '8px',
                background: 'var(--background)', color: 'var(--foreground)',
                resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

      </div>
    </div>
  )
}
