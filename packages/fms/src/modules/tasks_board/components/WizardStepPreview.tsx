import React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { ChargeRow } from './ChargesTable'
import type { WizardItem } from '../lib/wizard-types'

type WizardStepPreviewProps = {
  editableItems: WizardItem[]
  calculations: Array<{ chargeRows: ChargeRow[] }>
}

export function WizardStepPreview({ editableItems, calculations }: WizardStepPreviewProps) {
  const t = useT()

  return (
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
  )
}
