import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { RefreshCw, Download, Loader2, FileWarning } from 'lucide-react'
import type { ChargeRow } from './ChargesTable'
import type { WizardItem } from '../lib/wizard-types'

type WizardStepPreviewProps = {
  editableItems: WizardItem[]
  calculations: Array<{ chargeRows: ChargeRow[] }>
  offerId: string | null
}

export function WizardStepPreview({ editableItems, calculations, offerId }: WizardStepPreviewProps) {
  const t = useT()
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const revokePreviousBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  const loadPdfPreview = useCallback(async () => {
    if (!offerId) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const response = await fetch(`/api/fms_offers/offers/${offerId}/pdf`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const blob = await response.blob()
      revokePreviousBlob()
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      setPdfBlobUrl(url)
    } catch {
      setPdfError(t('tasks_board.wizard.preview.pdfError', 'Failed to generate preview'))
    } finally {
      setPdfLoading(false)
    }
  }, [offerId, revokePreviousBlob, t])

  const handleDownload = useCallback(() => {
    if (!pdfBlobUrl) return
    const anchor = document.createElement('a')
    anchor.href = pdfBlobUrl
    anchor.download = `offer-${offerId || 'draft'}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }, [pdfBlobUrl, offerId])

  // Auto-load PDF on mount with delay to let any pending charge sync complete
  useEffect(() => {
    if (!offerId) return
    const timer = setTimeout(() => loadPdfPreview(), 800)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when offerId changes (user went back and offer was recreated)
  useEffect(() => {
    revokePreviousBlob()
    setPdfBlobUrl(null)
    setPdfError(null)
    if (offerId) {
      const timer = setTimeout(() => loadPdfPreview(), 800)
      return () => clearTimeout(timer)
    }
  }, [offerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      revokePreviousBlob()
    }
  }, [revokePreviousBlob])

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left Panel — PDF Preview */}
      <div style={{ width: '50%', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-2 py-1 border-b" style={{ background: 'var(--muted)', flexShrink: 0 }}>
          <span className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>
            {t('tasks_board.wizard.preview.pdfPreview', 'PDF Preview')}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={loadPdfPreview}
              disabled={!offerId || pdfLoading}
              title={t('tasks_board.wizard.preview.refresh', 'Refresh')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDownload}
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
              <Loader2 className="h-6 w-6 text-muted-foreground" style={{ animation: 'spin 1s linear infinite' }} />
              <span className="text-xs text-muted-foreground">
                {t('tasks_board.wizard.preview.pdfLoading', 'Generating preview...')}
              </span>
            </div>
          ) : pdfError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <FileWarning className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{pdfError}</span>
              <Button variant="outline" size="sm" onClick={loadPdfPreview} className="mt-1">
                {t('tasks_board.wizard.preview.retry', 'Retry')}
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
                {t('tasks_board.wizard.preview.noOffer', 'Save charge lines first to preview')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel — Summary (existing content) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {editableItems.map((item, idx) => {
          const chargeRows = calculations[idx]?.chargeRows || []
          const enabledRows = chargeRows.filter((r) => r.isEnabled)
          const totalBuy = enabledRows.reduce((s, r) => s + (Number(r.buyPrice) || 0), 0)
          const totalSell = enabledRows.reduce((s, r) => s + (Number(r.sellPrice) || 0), 0)
          const currency = enabledRows[0]?.currencyCode || 'USD'
          const routeParts: string[] = []
          if (item.placeOfLoading) routeParts.push(item.placeOfLoading)
          routeParts.push(item.origin || '?')
          routeParts.push(item.destination || '?')
          if (item.placeOfDelivery) routeParts.push(item.placeOfDelivery)

          return (
            <div
              key={idx}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '12px',
                marginBottom: '16px',
                overflow: 'hidden',
              }}
            >
              {/* Item header */}
              <div style={{ padding: '14px 20px', background: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  #{idx + 1}
                </span>
                {item.containerType && (
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
                    {item.containerCount ? `${item.containerCount}x ` : ''}{item.containerType}
                  </span>
                )}
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {routeParts.join(' → ')}
                </span>
                {item.transportMode && (
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
                    {item.transportMode.charAt(0).toUpperCase() + item.transportMode.slice(1)}
                  </span>
                )}
              </div>

              {/* Cargo info */}
              {item.cargoDescription && (
                <div style={{ padding: '8px 20px 0', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  {item.cargoDescription}
                  {item.weightKg ? ` (${item.weightKg} kg)` : ''}
                  {item.incoterm ? ` · ${item.incoterm.toUpperCase()}` : ''}
                </div>
              )}

              {/* Charges summary table */}
              {enabledRows.length > 0 ? (
                <div style={{ padding: '12px 20px 16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                          {t('tasks_board.charges.product', 'Product')}
                        </th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', width: 70 }}>
                          {t('tasks_board.offerDetail.currency', 'Currency')}
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', width: 90 }}>
                          {t('tasks_board.charges.buyPrice', 'Buy')}
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', width: 90 }}>
                          {t('tasks_board.charges.sellPrice', 'Sell')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {enabledRows.map((row) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px', fontWeight: 500 }}>{row.productName || row.chargeCode || '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>{row.currencyCode}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(Number(row.buyPrice) || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{(Number(row.sellPrice) || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{t('tasks_board.offerDetail.total', 'Total')}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>{currency}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{totalBuy.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{totalSell.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                  {t('tasks_board.charges.empty', 'No products available')}
                </div>
              )}
            </div>
          )
        })}

        {/* Grand total across all items */}
        {editableItems.length > 1 && (() => {
          const allEnabled = calculations.flatMap((c) => c.chargeRows.filter((r) => r.isEnabled))
          const grandBuy = allEnabled.reduce((s, r) => s + (Number(r.buyPrice) || 0), 0)
          const grandSell = allEnabled.reduce((s, r) => s + (Number(r.sellPrice) || 0), 0)
          const grandCurrency = allEnabled[0]?.currencyCode || 'USD'
          const grandMargin = grandSell > 0 ? ((grandSell - grandBuy) / grandSell * 100) : 0
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', padding: '12px 20px', borderTop: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}>
                  {t('tasks_board.charges.buyPrice', 'Buy')}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500 }}>{grandCurrency} {grandBuy.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}>
                  {t('tasks_board.charges.sellPrice', 'Sell')}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>{grandCurrency} {grandSell.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}>
                  {t('tasks_board.charges.margin', 'Margin')}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: grandMargin > 0 ? '#16a34a' : 'var(--foreground)' }}>
                  {grandMargin > 0 ? '+' : ''}{grandMargin.toFixed(1)}%
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
