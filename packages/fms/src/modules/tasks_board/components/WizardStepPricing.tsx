import React, { useMemo } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ChevronDown, ChevronRight, Plus, Pencil } from 'lucide-react'
import { ChargesTable, type ChargeRow } from './ChargesTable'
import { RfqContextPanel } from './RfqContextPanel'
import { LocationSearchInput } from './LocationSearchInput'
import { SwapButton, ExpandableLocationSlot } from './shared-inputs'
import { ChipSelector } from './ChipSelector'
import { ChargesToolbar } from './ChargesToolbar'
import { ImportFromCarrierDialog } from './ImportFromCarrierDialog'
import { FromHistoryDialog } from './FromHistoryDialog'
import { TRANSPORT_MODE_OPTIONS, CONTAINER_OPTIONS } from '../lib/chip-options'
import { sectionLabelStyle, type WizardItem, type ExtractionResult, type OfferFullData, type RfqDetailData } from '../lib/wizard-types'

type WizardStepPricingProps = {
  rfqId: string | null
  rfqTitle: string
  rawText: string
  extraction: ExtractionResult | null
  extracting: boolean
  editableItems: WizardItem[]
  calculations: Array<{ chargeRows: ChargeRow[] }>
  expandedBoxes: Set<number>
  setExpandedBoxes: React.Dispatch<React.SetStateAction<Set<number>>>
  editingItems: Set<number>
  expandedPol: Set<number>
  setExpandedPol: React.Dispatch<React.SetStateAction<Set<number>>>
  expandedPod: Set<number>
  setExpandedPod: React.Dispatch<React.SetStateAction<Set<number>>>
  importDialogItem: number | null
  setImportDialogItem: (val: number | null) => void
  historyDialogItem: number | null
  setHistoryDialogItem: (val: number | null) => void
  expandedOffers: Set<string>
  setExpandedOffers: React.Dispatch<React.SetStateAction<Set<string>>>
  existingOffers: OfferFullData[]
  updateCalculation: (index: number, chargeRows: ChargeRow[]) => void
  updateItem: (index: number, patch: Partial<WizardItem>) => void
  toggleEditing: (idx: number) => void
  handleAddItem: () => void
  setViewingOfferId: (id: string | null) => void
  rfqDetail: RfqDetailData | null | undefined
}

export function WizardStepPricing({
  rfqId,
  rfqTitle,
  rawText,
  extraction,
  extracting,
  editableItems,
  calculations,
  expandedBoxes,
  setExpandedBoxes,
  editingItems,
  expandedPol,
  setExpandedPol,
  expandedPod,
  setExpandedPod,
  importDialogItem,
  setImportDialogItem,
  historyDialogItem,
  setHistoryDialogItem,
  expandedOffers,
  setExpandedOffers,
  existingOffers,
  updateCalculation,
  updateItem,
  toggleEditing,
  handleAddItem,
  setViewingOfferId,
  rfqDetail,
}: WizardStepPricingProps) {
  const t = useT()

  const usedCurrencies = useMemo(() => {
    const codes = new Set<string>()
    for (const calc of calculations) {
      for (const row of calc.chargeRows) {
        if (row.currencyCode) codes.add(row.currencyCode)
      }
    }
    return [...codes]
  }, [calculations])

  const hasRightPanel = !!(rfqId || rawText || rfqDetail?.rawText || rfqDetail?.context)

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: Items with charges */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: hasRightPanel ? '1px solid var(--border)' : 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}
        >
          {extracting && editableItems.length === 0 ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '12px',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 28, height: 20, borderRadius: '9999px', background: 'var(--muted)' }} />
                    <div style={{ width: 60, height: 16, borderRadius: '6px', background: 'var(--muted)' }} />
                    <div style={{ flex: 1, height: 16, borderRadius: '6px', background: 'var(--muted)', maxWidth: '200px' }} />
                  </div>
                  {i === 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ width: '100%', height: 120, borderRadius: '8px', background: 'var(--muted)', opacity: 0.5 }} />
                    </div>
                  )}
                </div>
              ))}
              <div style={{ textAlign: 'center', padding: '8px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                {t('tasks_board.wizard.extracting', 'Analyzing content...')}
              </div>
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </>
          ) : editableItems.map((item, idx) => {
            const isExpanded = expandedBoxes.has(idx)
            const isEditing = editingItems.has(idx)
            const hasTransport = !!item.transportMode

            return (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  marginBottom: '12px',
                  overflow: 'visible',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 20px',
                    background: isExpanded ? 'var(--accent)' : 'transparent',
                    borderRadius: '12px 12px 0 0',
                    transition: 'background 0.15s',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedBoxes((prev) => {
                      const next = new Set(prev)
                      if (next.has(idx)) next.delete(idx)
                      else next.add(idx)
                      return next
                    })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--foreground)',
                      fontFamily: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown style={{ width: 16, height: 16, opacity: 0.5 }} />
                    ) : (
                      <ChevronRight style={{ width: 16, height: 16, opacity: 0.5 }} />
                    )}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </button>

                  <div
                    onClick={() => toggleEditing(idx)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: item.containerType ? 600 : 500,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        ...(item.containerType
                          ? { background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid transparent' }
                          : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }),
                      }}
                    >
                      {item.containerType
                        ? `${item.containerCount ? `${item.containerCount}x ` : ''}${item.containerType}`
                        : t('tasks_board.detail.containerType', 'Container')}
                    </span>

                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--foreground)',
                      }}
                    >
                      {(() => {
                        const parts: string[] = []
                        if (item.placeOfLoading) parts.push(item.placeOfLoading)
                        parts.push(item.origin || '?')
                        parts.push(item.destination || '?')
                        if (item.placeOfDelivery) parts.push(item.placeOfDelivery)
                        return parts.join(' → ')
                      })()}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: hasTransport ? 600 : 500,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        ...(hasTransport
                          ? { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid transparent' }
                          : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }),
                      }}
                    >
                      {hasTransport
                        ? item.transportMode!.charAt(0).toUpperCase() + item.transportMode!.slice(1)
                        : t('tasks_board.detail.transportMode', 'Transport')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleEditing(idx)}
                    title={t('tasks_board.detail.edit', 'Edit')}
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: '8px',
                      border: 'none',
                      background: isEditing ? 'var(--primary)' : 'transparent',
                      color: isEditing ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isEditing) {
                        e.currentTarget.style.background = 'var(--muted)'
                        e.currentTarget.style.color = 'var(--foreground)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isEditing) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--muted-foreground)'
                      }
                    }}
                  >
                    <Pencil style={{ width: 12, height: 12 }} />
                  </button>
                </div>

                {/* Edit panel */}
                {isEditing && (
                  <div
                    style={{
                      padding: '12px 20px 16px',
                      borderTop: '1px solid var(--border)',
                      background: 'color-mix(in srgb, var(--accent) 50%, var(--background))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <div>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.transportMode', 'Transport Mode')}
                        </div>
                        <ChipSelector
                          options={TRANSPORT_MODE_OPTIONS}
                          selected={item.transportMode || ''}
                          onChange={(value) => updateItem(idx, { transportMode: (value as string) || null })}
                        />
                      </div>
                      <div>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.containerType', 'Container')}
                        </div>
                        <ChipSelector
                          options={CONTAINER_OPTIONS}
                          selected={item.containerType || ''}
                          onChange={(value) => updateItem(idx, { containerType: (value as string) || null })}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={sectionLabelStyle}>
                        {t('tasks_board.detail.route', 'Route')}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          paddingTop: (expandedPol.has(idx) || expandedPod.has(idx)) ? '18px' : '0',
                          transition: 'padding-top 0.3s ease',
                        }}
                      >
                        <ExpandableLocationSlot
                          expanded={expandedPol.has(idx)}
                          onToggle={() => {
                            setExpandedPol((prev) => {
                              const next = new Set(prev)
                              if (next.has(idx)) {
                                next.delete(idx)
                                updateItem(idx, { placeOfLoadingId: null, placeOfLoading: null })
                              } else {
                                next.add(idx)
                              }
                              return next
                            })
                          }}
                          value={item.placeOfLoadingId}
                          onChange={(locationId, name) => updateItem(idx, { placeOfLoadingId: locationId, placeOfLoading: name || null })}
                          label={t('tasks_board.detail.portOfLoading', 'Port of Loading')}
                          placeholder={t('tasks_board.detail.portOfLoading', 'Port of Loading')}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LocationSearchInput
                            value={item.originLocationId}
                            onChange={(locationId, name) => updateItem(idx, { originLocationId: locationId, origin: name || null })}
                            placeholder={item.origin || t('tasks_board.wizard.from', 'From')}
                          />
                        </div>

                        <div style={{ flexShrink: 0 }}>
                          <SwapButton onClick={() => updateItem(idx, {
                            originLocationId: item.destinationLocationId,
                            origin: item.destination,
                            destinationLocationId: item.originLocationId,
                            destination: item.origin,
                          })} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LocationSearchInput
                            value={item.destinationLocationId}
                            onChange={(locationId, name) => updateItem(idx, { destinationLocationId: locationId, destination: name || null })}
                            placeholder={item.destination || t('tasks_board.wizard.to', 'To')}
                          />
                        </div>

                        <ExpandableLocationSlot
                          expanded={expandedPod.has(idx)}
                          onToggle={() => {
                            setExpandedPod((prev) => {
                              const next = new Set(prev)
                              if (next.has(idx)) {
                                next.delete(idx)
                                updateItem(idx, { placeOfDeliveryId: null, placeOfDelivery: null })
                              } else {
                                next.add(idx)
                              }
                              return next
                            })
                          }}
                          value={item.placeOfDeliveryId}
                          onChange={(locationId, name) => updateItem(idx, { placeOfDeliveryId: locationId, placeOfDelivery: name || null })}
                          label={t('tasks_board.detail.portOfDischarge', 'Port of Discharge')}
                          placeholder={t('tasks_board.detail.portOfDischarge', 'Port of Discharge')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded content: cargo + charges */}
                {isExpanded && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {item.cargoDescription && (
                      <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '8px', padding: '0 4px' }}>
                        {item.cargoDescription}
                        {item.weightKg ? ` (${item.weightKg} kg)` : ''}
                        {item.readinessDate ? ` · ${t('tasks_board.wizard.readiness', 'Readiness')}: ${item.readinessDate}` : ''}
                        {item.incoterm ? ` · ${item.incoterm.toUpperCase()}` : ''}
                      </div>
                    )}
                    <ChargesTable
                      rows={calculations[idx]?.chargeRows || []}
                      onChange={(rows) => updateCalculation(idx, rows)}
                      transportMode={item.transportMode || undefined}
                    />
                    <ChargesToolbar
                      onAddLine={() => {
                        const newRow: ChargeRow = {
                          id: `new-${Date.now()}-${Math.random()}`,
                          productId: null,
                          productName: '',
                          chargeCode: '',
                          chargeBasis: '',
                          containerType: null,
                          currencyCode: 'USD',
                          rate: 0,
                          marginPercent: 0,
                          buyPrice: 0,
                          sellPrice: 0,
                          isEnabled: true,
                        }
                        updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), newRow])
                      }}
                      onImportFromCarrier={() => setImportDialogItem(idx)}
                      onFromHistory={() => setHistoryDialogItem(idx)}
                    />
                    <ImportFromCarrierDialog
                      open={importDialogItem === idx}
                      onOpenChange={(open) => { if (!open) setImportDialogItem(null) }}
                      onImport={(rows) => updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), ...rows])}
                      itemLabel={`#${idx + 1} · ${item.origin || '?'} → ${item.destination || '?'}`}
                    />
                    <FromHistoryDialog
                      open={historyDialogItem === idx}
                      onOpenChange={(open) => { if (!open) setHistoryDialogItem(null) }}
                      onSelectOffer={(rows) => updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), ...rows])}
                      currentOrigin={item.origin}
                      currentDestination={item.destination}
                    />
                  </div>
                )}
              </div>
            )
          })
          }

          {/* Add item button */}
          <button
            type="button"
            onClick={handleAddItem}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--muted-foreground)',
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--foreground)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            {t('tasks_board.detail.addItem', 'Add item')}
          </button>

          {/* Existing (non-draft) offers */}
          {existingOffers.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              {existingOffers.map((offer) => {
                const isOfferExpanded = expandedOffers.has(offer.id)
                const statusColors: Record<string, { bg: string; color: string }> = {
                  draft: { bg: 'var(--muted)', color: 'var(--muted-foreground)' },
                  sent: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' },
                  accepted: { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' },
                  declined: { bg: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' },
                  expired: { bg: 'rgba(234, 179, 8, 0.1)', color: '#b45309' },
                }
                const sc = statusColors[offer.status] || statusColors.draft
                const allLines = offer.calculations.flatMap((c) => c.lines)
                const totalSell = allLines.reduce((sum, l) => sum + parseFloat(l.sellPrice || '0'), 0)
                const totalBuy = allLines.reduce((sum, l) => sum + parseFloat(l.buyPrice || '0'), 0)

                return (
                  <div
                    key={offer.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      marginBottom: '10px',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedOffers((prev) => {
                        const next = new Set(prev)
                        if (next.has(offer.id)) next.delete(offer.id)
                        else next.add(offer.id)
                        return next
                      })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        padding: '10px 16px',
                        background: isOfferExpanded ? 'var(--accent)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      {isOfferExpanded
                        ? <ChevronDown style={{ width: 14, height: 14, opacity: 0.5, flexShrink: 0 }} />
                        : <ChevronRight style={{ width: 14, height: 14, opacity: 0.5, flexShrink: 0 }} />}
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>
                        {offer.offerNumber}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '1px 8px',
                        borderRadius: '9999px',
                        background: sc.bg,
                        color: sc.color,
                        textTransform: 'capitalize',
                      }}>
                        {offer.status}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
                        {allLines.length} {allLines.length === 1 ? 'line' : 'lines'}
                        {totalSell > 0 && (
                          <span style={{ fontWeight: 600, color: 'var(--foreground)', marginLeft: '8px' }}>
                            {totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </span>
                    </button>

                    {isOfferExpanded && (
                      <div style={{ padding: '0 16px 12px' }}>
                        {allLines.length === 0 ? (
                          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontStyle: 'italic', padding: '8px 0' }}>
                            {t('tasks_board.offerDetail.noLines', 'No lines in this calculation')}
                          </div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '11px' }}>
                                  {t('tasks_board.charges.product', 'Product')}
                                </th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '11px' }}>
                                  {t('tasks_board.charges.basis', 'Basis')}
                                </th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '11px' }}>
                                  {t('tasks_board.charges.buyPrice', 'Buy')}
                                </th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '11px' }}>
                                  {t('tasks_board.charges.sellPrice', 'Sell')}
                                </th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '11px' }}>
                                  {t('tasks_board.charges.margin', 'Margin')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {allLines.map((line) => {
                                const buy = parseFloat(line.buyPrice || '0')
                                const sell = parseFloat(line.sellPrice || '0')
                                const margin = sell > 0 ? ((sell - buy) / sell) * 100 : 0
                                return (
                                  <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 8px', fontWeight: 500, color: 'var(--foreground)' }}>
                                      {line.productName || line.chargeCode || '—'}
                                    </td>
                                    <td style={{ padding: '8px 8px', color: 'var(--muted-foreground)' }}>
                                      {line.chargeBasis || line.containerType || '—'}
                                    </td>
                                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                      {buy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                      {sell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td style={{
                                      padding: '8px 8px',
                                      textAlign: 'right',
                                      fontVariantNumeric: 'tabular-nums',
                                      color: margin > 0 ? '#059669' : margin < 0 ? '#dc2626' : 'var(--muted-foreground)',
                                    }}>
                                      {margin.toFixed(1)}%
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: '2px solid var(--border)' }}>
                                <td colSpan={2} style={{ padding: '8px 8px', fontWeight: 600, fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                                  Total
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                  {totalBuy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                  {totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{
                                  padding: '8px 8px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  fontVariantNumeric: 'tabular-nums',
                                  color: totalSell - totalBuy > 0 ? '#059669' : totalSell - totalBuy < 0 ? '#dc2626' : 'var(--muted-foreground)',
                                }}>
                                  {totalSell > 0 ? (((totalSell - totalBuy) / totalSell) * 100).toFixed(1) : '0.0'}%
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingOfferId(offer.id)}
                          style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: 'var(--primary)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 0',
                            fontFamily: 'inherit',
                          }}
                        >
                          {t('tasks_board.detail.viewInOffers', 'View in Offers')} →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Context panel */}
      {hasRightPanel && (
        <RfqContextPanel
          rfqId={rfqId}
          rfqTitle={rfqTitle}
          rawText={rawText}
          extracting={extracting}
          extraction={extraction}
          rfqDetail={rfqDetail}
          usedCurrencies={usedCurrencies}
        />
      )}
    </div>
  )
}
