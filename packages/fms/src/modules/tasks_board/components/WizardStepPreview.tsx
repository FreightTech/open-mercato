import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { RefreshCw, Download, Loader2, FileWarning, ChevronDown, ChevronRight } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ChargeRow } from './ChargesTable'
import { getVisibleSections } from './ChargesTable'
import { ExchangeRateSection } from './ExchangeRateSection'
import type { ExchangeRateRow } from './ExchangeRateSection'
import { convertCurrency } from '../../fms_projects/lib/financials'
import type { ExchangeRateSnapshot, FmsCostGroupingMode } from '../../fms_offers/data/types'
import type { WizardItem } from '../lib/wizard-types'

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
}

const SECTION_LABELS: Record<string, string> = {
  main_freight: 'Main Freight',
  origin: 'Origin Charges',
  destination: 'Destination Charges',
}

const GROUPING_OPTIONS: Array<{ value: FmsCostGroupingMode; label: string }> = [
  { value: 'itemized', label: 'Itemized' },
  { value: 'section_totals', label: 'Main + Destination (totals)' },
  { value: 'all_in', label: 'Freight forwarding (all-in)' },
]

export function WizardStepPreview({ editableItems, calculations, offerId, flushPendingSync, specialTerms, onSpecialTermsChange, initialBaseCurrency, initialExchangeRates, clientName }: WizardStepPreviewProps) {
  const t = useT()
  const [baseCurrency, setBaseCurrency] = useState(initialBaseCurrency || 'USD')
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateSnapshot[]>(initialExchangeRates || [])
  const [groupingMode, setGroupingMode] = useState<FmsCostGroupingMode>('itemized')
  const [expandedSidebar, setExpandedSidebar] = useState<Set<string>>(new Set(['currencies', 'validity', 'grouping']))
  const [validityMode, setValidityMode] = useState<'days' | 'date'>('days')
  const [validityDays, setValidityDays] = useState(14)
  const [validityDate, setValidityDate] = useState('')
  const [paymentMode, setPaymentMode] = useState<'days' | 'custom'>('days')
  const [paymentDays, setPaymentDays] = useState(14)
  const [paymentDate, setPaymentDate] = useState('')
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (initialBaseCurrency) setBaseCurrency(initialBaseCurrency)
  }, [initialBaseCurrency])

  useEffect(() => {
    if (initialExchangeRates && initialExchangeRates.length > 0) setExchangeRates(initialExchangeRates)
  }, [initialExchangeRates])

  const usedCurrencies = useMemo(() => {
    const codes = new Set<string>()
    for (const calc of calculations) {
      for (const row of calc.chargeRows) {
        if (row.currencyCode) codes.add(row.currencyCode)
      }
    }
    return [...codes]
  }, [calculations])

  const hasMultipleCurrencies = usedCurrencies.length > 1 || (usedCurrencies.length === 1 && usedCurrencies[0] !== baseCurrency)

  const persistCurrencySettings = useCallback((newBaseCurrency: string, newRates: ExchangeRateSnapshot[]) => {
    if (!offerId) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify({ baseCurrency: newBaseCurrency, exchangeRates: newRates, costGroupingMode: groupingMode }),
        headers: { 'Content-Type': 'application/json' },
      })
    }, 500)
  }, [offerId, groupingMode])

  const handleRatesLoaded = useCallback((rates: ExchangeRateRow[]) => {
    const snapshots: ExchangeRateSnapshot[] = rates.map((r) => ({
      fromCurrencyCode: r.fromCurrencyCode,
      toCurrencyCode: r.toCurrencyCode,
      rate: r.rate,
      date: r.date,
      source: r.source,
    }))
    setExchangeRates(snapshots)
    persistCurrencySettings(baseCurrency, snapshots)
  }, [baseCurrency, persistCurrencySettings])

  const handleBaseCurrencyChange = useCallback((code: string) => {
    setBaseCurrency(code)
    persistCurrencySettings(code, exchangeRates)
  }, [exchangeRates, persistCurrencySettings])

  // Persist grouping mode
  useEffect(() => {
    if (!offerId) return
    const timer = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify({ costGroupingMode: groupingMode }),
        headers: { 'Content-Type': 'application/json' },
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [groupingMode, offerId])

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

  // PDF download
  const handleDownloadPdf = useCallback(async () => {
    if (!offerId) return
    if (flushPendingSync) await flushPendingSync()
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
  }, [offerId, flushPendingSync])

  // Compute preview data
  const firstItem = editableItems[0]
  const allRows = calculations.flatMap((c) => c.chargeRows)
  const enabledRows = allRows.filter((r) => r.isEnabled)
  const incoterm = firstItem?.incoterm
  const visibleSections = getVisibleSections(incoterm)

  const sectionData = useMemo(() => {
    const sections = ['main_freight', 'origin', 'destination']
      .filter((st) => visibleSections.has(st))
      .map((st) => {
        const rows = enabledRows.filter((r) => r.sectionType === st)
        let total = 0
        for (const r of rows) {
          const qty = r.quantity || 1
          total += convertCurrency((Number(r.sellPrice) || 0) * qty, r.currencyCode, baseCurrency, exchangeRates)
        }
        return { sectionType: st, label: SECTION_LABELS[st] || st, rows, total }
      })

    // Untagged rows
    const untagged = enabledRows.filter((r) => !r.sectionType)
    if (untagged.length > 0) {
      let total = 0
      for (const r of untagged) {
        total += convertCurrency((Number(r.sellPrice) || 0) * (r.quantity || 1), r.currencyCode, baseCurrency, exchangeRates)
      }
      sections.push({ sectionType: 'other', label: 'Other', rows: untagged, total })
    }

    return sections
  }, [enabledRows, visibleSections, baseCurrency, exchangeRates])

  const grandTotal = sectionData.reduce((sum, s) => sum + s.total, 0)

  const fmtAmount = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left — Interactive Document Preview */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--muted)' }}>
        <div style={{
          maxWidth: '700px', margin: '0 auto', background: 'white', borderRadius: '8px',
          border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          padding: '40px 48px', fontSize: '13px', color: '#1f2937',
        }}>
          {/* Document header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#111' }}>
                OFFER — {offerId ? offerId.slice(0, 8).toUpperCase() : 'DRAFT'}
              </div>
              <div style={{ height: '3px', width: '100%', background: '#059669', borderRadius: '2px', marginTop: '6px' }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
              <div style={{ fontWeight: 600, color: '#111', fontSize: '14px' }}>Open Mercato</div>
              <div>FREIGHT SOLUTIONS</div>
            </div>
          </div>

          {/* Client + meta */}
          <div style={{ marginBottom: '20px', fontSize: '12px', color: '#6b7280' }}>
            {clientName && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontWeight: 500, color: '#111' }}>{clientName}</span>
              </div>
            )}
            {firstItem && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  {firstItem.origin && firstItem.destination && (
                    <span style={{ fontWeight: 500, color: '#111' }}>{firstItem.origin} → {firstItem.destination}</span>
                  )}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#6b7280', marginBottom: '16px', flexWrap: 'wrap' }}>
            {incoterm && <span>Incoterms <strong style={{ color: '#111' }}>{incoterm.toUpperCase()}</strong></span>}
            {firstItem?.readinessDate && <span>CRD <strong style={{ color: '#111' }}>{firstItem.readinessDate}</strong></span>}
            <span>Valid until <strong style={{ color: '#111' }}>
              {validityMode === 'date' && validityDate
                ? new Date(validityDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : (() => {
                    const d = new Date()
                    d.setDate(d.getDate() + validityDays)
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  })()
              }
            </strong></span>
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>
            Rates valid on the day of offer issuance (VATOS). Offer valid {validityDays} days.
          </div>

          {/* Lines table */}
          {groupingMode === 'all_in' ? (
            /* All-in: single line */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#6b7280', fontWeight: 500 }}>LP.</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: '#6b7280', fontWeight: 500 }}>Total ({baseCurrency})</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>1</td>
                  <td style={{ padding: '10px 8px', fontWeight: 500 }}>Freight forwarding service</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                    {baseCurrency} {fmtAmount(grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : groupingMode === 'section_totals' ? (
            /* Section totals */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#6b7280', fontWeight: 500 }}>LP.</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Section</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: '#6b7280', fontWeight: 500 }}>Total ({baseCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {sectionData.map((section, i) => (
                  <tr key={section.sectionType} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px 0', color: '#6b7280' }}>{i + 1}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{section.label}</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                      {baseCurrency} {fmtAmount(section.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #111' }}>
                  <td colSpan={2} style={{ padding: '10px 0', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                    {baseCurrency} {fmtAmount(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            /* Itemized (default) */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#6b7280', fontWeight: 500 }}>LP.</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: '#6b7280', fontWeight: 500 }}>Total ({baseCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {sectionData.map((section) => (
                  <React.Fragment key={section.sectionType}>
                    {sectionData.length > 1 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '10px 0 4px', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {section.label}
                        </td>
                      </tr>
                    )}
                    {section.rows.map((row, i) => {
                      const qty = row.quantity || 1
                      const lineTotal = convertCurrency((Number(row.sellPrice) || 0) * qty, row.currencyCode, baseCurrency, exchangeRates)
                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 0', color: '#6b7280' }}>{i + 1}</td>
                          <td style={{ padding: '8px', fontWeight: 500 }}>{row.productName || row.chargeCode || '—'}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 500, color: '#059669' }}>
                            {baseCurrency} {fmtAmount(lineTotal)}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #111' }}>
                  <td colSpan={2} style={{ padding: '10px 0', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                    {baseCurrency} {fmtAmount(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* Special terms */}
          {specialTerms && (
            <div style={{ marginTop: '20px', fontSize: '11px', color: '#6b7280', lineHeight: 1.6, borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              {specialTerms}
            </div>
          )}
        </div>
      </div>

      {/* Right — Sidebar controls */}
      <div style={{ width: '320px', flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid var(--border)' }}>
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

        {/* Custom conditions */}
        {onSpecialTermsChange && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              {t('fms_offers.preview.conditions', 'Special conditions')}
            </div>
            <textarea
              value={specialTerms || ''}
              onChange={(e) => onSpecialTermsChange(e.target.value)}
              placeholder={t('fms_offers.preview.conditionsPlaceholder', 'Enter special terms...')}
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', fontSize: '12px', lineHeight: 1.5,
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
