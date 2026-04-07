import React, { useMemo, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { ChargesTable, type ChargeRow, type ChargesSection } from './ChargesTable'
import { RfqContextPanel } from './RfqContextPanel'
import { LocationSearchInput } from './LocationSearchInput'
import { SwapButton, ExpandableLocationSlot } from './shared-inputs'
import { ChipSelector } from './ChipSelector'
import { ChargesToolbar } from './ChargesToolbar'
import { ImportFromCarrierDialog } from './ImportFromCarrierDialog'
import { FromHistoryDialog } from './FromHistoryDialog'
import { TRANSPORT_MODE_OPTIONS, CONTAINER_OPTIONS } from '../lib/chip-options'
import { sectionLabelStyle, type WizardItem, type ExtractionResult, type OfferFullData, type RfqDetailData } from '../lib/wizard-types'
import { MultiChipInput } from './MultiChipInput'

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
  handleRemoveItem: (index: number) => void
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
  handleRemoveItem,
  setViewingOfferId,
  rfqDetail,
}: WizardStepPricingProps) {
  const t = useT()
  const queryClient = useQueryClient()

  const postImportNote = useCallback(async (
    itemIdx: number,
    source: { text: string | null; sourceTitle: string | null; sourceSummary: string | null; lineCount: number },
  ) => {
    if (!rfqId) return
    const item = editableItems[itemIdx]
    const route = [item?.origin, item?.destination].filter(Boolean).join(' → ')
    const label = `#${itemIdx + 1}${route ? ` · ${route}` : ''}`
    const title = source.sourceTitle || 'Carrier rate'
    const body = `Imported ${source.lineCount} charge line${source.lineCount > 1 ? 's' : ''} from "${title}" for ${label}`
    try {
      await apiCall('/api/fms_offers/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, relatedEntityType: 'fms_rfq', relatedEntityId: rfqId }),
      })
      queryClient.invalidateQueries({ queryKey: ['rfq_activity', rfqId] })
    } catch {
      // Non-critical — don't block the import flow
    }
  }, [rfqId, editableItems, queryClient])

  /** Merge imported rows into existing charge rows:
   *  - Match by productId (or productName fallback) → replace existing row
   *  - Remove unmatched empty rows (auto-assigned defaults with no prices)
   *  - Append truly new rows */
  const mergeImportedRows = useCallback((existingRows: ChargeRow[], importedRows: ChargeRow[]): ChargeRow[] => {
    const matchedImportIndices = new Set<number>()
    const updatedExistingIds = new Set<string>()

    // Pass 1: Try to match each existing row to an imported row
    const merged = existingRows.map((existing) => {
      const importIdx = importedRows.findIndex((imp, i) => {
        if (matchedImportIndices.has(i)) return false
        if (existing.productId && imp.productId) return existing.productId === imp.productId
        if (existing.productName && imp.productName) {
          return existing.productName.toLowerCase() === imp.productName.toLowerCase()
        }
        return false
      })
      if (importIdx !== -1) {
        matchedImportIndices.add(importIdx)
        updatedExistingIds.add(existing.id)
        return { ...importedRows[importIdx], id: existing.id }
      }
      return existing
    })

    // Pass 2: Remove unmatched empty default rows (zero prices, not touched by import)
    const isEmptyDefault = (row: ChargeRow) =>
      !updatedExistingIds.has(row.id) && row.buyPrice === 0 && row.sellPrice === 0 && row.rate === 0
    const filtered = merged.filter((row) => !isEmptyDefault(row))

    // Pass 3: Append imported rows that didn't match any existing row
    for (let i = 0; i < importedRows.length; i++) {
      if (!matchedImportIndices.has(i)) filtered.push(importedRows[i])
    }

    return filtered
  }, [])

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
            const isEditing = editingItems.has(idx)
            const hasTransport = !!item.transportMode

            return (
              <div key={idx} style={{ marginBottom: '16px' }}>
                {/* Route header bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: 'var(--accent)',
                    borderRadius: '10px',
                    marginBottom: isEditing ? '0' : '12px',
                    borderBottomLeftRadius: isEditing ? '0' : '10px',
                    borderBottomRightRadius: isEditing ? '0' : '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleEditing(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: 'var(--foreground)', fontFamily: 'inherit',
                    }}
                  >
                    {isEditing
                      ? <ChevronDown style={{ width: 14, height: 14, opacity: 0.5 }} />
                      : <ChevronRight style={{ width: 14, height: 14, opacity: 0.5 }} />}
                    <Pencil style={{ width: 12, height: 12, opacity: 0.4 }} />
                  </button>

                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
                    {item.origin || '?'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>→</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
                    {item.destination || '?'}
                  </span>

                  {hasTransport && (
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)',
                    }}>
                      {item.transportMode!.charAt(0).toUpperCase() + item.transportMode!.slice(1)}
                    </span>
                  )}

                  {item.incoterm && (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px',
                      background: '#fef3c7', color: '#92400e',
                    }}>
                      {item.incoterm.toUpperCase()}
                    </span>
                  )}

                  {/* Carrier chips in header */}
                  {item.carrierNames?.map((name, i) => (
                    <span
                      key={item.carrierIds[i]}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px',
                        background: '#fef3c7', color: '#92400e',
                      }}
                    >
                      {name}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateItem(idx, {
                            carrierIds: item.carrierIds.filter((_, j) => j !== i),
                            carrierNames: item.carrierNames.filter((_, j) => j !== i),
                          })
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#92400e', opacity: 0.6, fontSize: '13px', lineHeight: 1 }}
                      >×</button>
                    </span>
                  ))}

                  {/* Provider placeholder in header */}
                  {item.providerNames?.length === 0 && item.carrierNames?.length > 0 && (
                    <span style={{
                      fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px',
                      border: '1px dashed var(--border)', color: 'var(--muted-foreground)',
                    }}>
                      Provider
                    </span>
                  )}
                  {item.providerNames?.map((name, i) => (
                    <span
                      key={item.providerIds[i]}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px',
                        background: '#ede9fe', color: '#5b21b6',
                      }}
                    >
                      {name}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateItem(idx, {
                            providerIds: item.providerIds.filter((_, j) => j !== i),
                            providerNames: item.providerNames.filter((_, j) => j !== i),
                          })
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#5b21b6', opacity: 0.6, fontSize: '13px', lineHeight: 1 }}
                      >×</button>
                    </span>
                  ))}

                  <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      title={t('tasks_board.detail.removeItem', 'Remove item')}
                      style={{
                        width: 28, height: 28, borderRadius: '6px',
                        border: '1px solid transparent', background: 'transparent', display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: 'var(--muted-foreground)', transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)'; e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.2)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
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
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.main', 'Main')}
                        </div>
                        <ChipSelector
                          options={TRANSPORT_MODE_OPTIONS}
                          selected={item.transportMode || ''}
                          onChange={(value) => updateItem(idx, { transportMode: (value as string) || null })}
                        />
                      </div>
                      {item.transportMode !== 'air' && (
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
                      )}
                      <div>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.incoterms', 'Incoterms')}
                        </div>
                        <select
                          value={item.incoterm || ''}
                          onChange={(e) => updateItem(idx, { incoterm: e.target.value || null })}
                          style={{
                            fontSize: '13px', fontWeight: 600, padding: '6px 12px',
                            border: '1px solid var(--border)', borderRadius: '8px',
                            background: 'var(--background)', fontFamily: 'inherit',
                            color: 'var(--foreground)', outline: 'none', cursor: 'pointer',
                            minWidth: '80px',
                          }}
                        >
                          <option value="">—</option>
                          {['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'].map((ic) => (
                            <option key={ic} value={ic.toLowerCase()}>{ic}</option>
                          ))}
                        </select>
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

                    {/* Carrier & Provider */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.carrier', 'Carrier')}
                        </div>
                        <MultiChipInput
                          selectedIds={item.carrierIds || []}
                          selectedNames={item.carrierNames || []}
                          onChange={(ids, names) => updateItem(idx, { carrierIds: ids, carrierNames: names })}
                          apiEndpoint="/api/fms_products/carriers"
                          placeholder={t('tasks_board.detail.searchCarrier', 'Search or type carrier...')}
                          chipColor={{ bg: '#fef3c7', text: '#92400e' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={sectionLabelStyle}>
                          {t('tasks_board.detail.provider', 'Provider')}
                        </div>
                        <MultiChipInput
                          selectedIds={item.providerIds || []}
                          selectedNames={item.providerNames || []}
                          onChange={(ids, names) => updateItem(idx, { providerIds: ids, providerNames: names })}
                          apiEndpoint="/api/contractors/contractors"
                          placeholder={t('tasks_board.detail.searchProvider', 'Search or type provider...')}
                          chipColor={{ bg: '#ede9fe', text: '#5b21b6' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Charges content — always visible */}
                <div style={{ padding: '0 0 16px' }}>
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
                      sections={(() => {
                        const allRows = calculations[idx]?.chargeRows || []
                        const SECTIONS: ChargesSection[] = [
                          { sectionType: 'main_freight', label: 'MAIN FREIGHT', rows: allRows.filter((r) => r.sectionType === 'main_freight') },
                          { sectionType: 'origin', label: 'ORIGIN', rows: allRows.filter((r) => r.sectionType === 'origin') },
                          { sectionType: 'destination', label: 'DESTINATION', rows: allRows.filter((r) => r.sectionType === 'destination') },
                        ]
                        // Show sections for new offers (empty or with tagged rows), fall back to flat for legacy
                        const hasUntaggedRows = allRows.some((r) => !r.sectionType)
                        const hasTaggedRows = allRows.some((r) => r.sectionType)
                        // Always show sections unless all rows are untagged legacy rows
                        return (allRows.length === 0 || hasTaggedRows || !hasUntaggedRows) ? SECTIONS : undefined
                      })()}
                      onAddLine={(sectionType) => {
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
                          quantity: 1,
                          isEnabled: true,
                          sectionType,
                        }
                        updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), newRow])
                      }}
                    />
                    <ChargesToolbar
                      onImportFromCarrier={() => setImportDialogItem(idx)}
                      onFromHistory={() => setHistoryDialogItem(idx)}
                    />
                    <ImportFromCarrierDialog
                      open={importDialogItem === idx}
                      onOpenChange={(open) => { if (!open) setImportDialogItem(null) }}
                      onImport={(rows, source) => {
                        updateCalculation(idx, mergeImportedRows(calculations[idx]?.chargeRows || [], rows))
                        postImportNote(idx, source)
                      }}
                      itemLabel={`#${idx + 1} · ${item.origin || '?'} → ${item.destination || '?'}`}
                    />
                    <FromHistoryDialog
                      open={historyDialogItem === idx}
                      onOpenChange={(open) => { if (!open) setHistoryDialogItem(null) }}
                      onSelectOffer={(rows) => updateCalculation(idx, mergeImportedRows(calculations[idx]?.chargeRows || [], rows))}
                      currentOrigin={item.origin}
                      currentDestination={item.destination}
                    />
                  </div>
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
                const offerCurrency = (offer as any).baseCurrency || allLines[0]?.currencyCode || 'USD'

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
                            {offerCurrency} {totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                  Total <span style={{ fontWeight: 400, textTransform: 'none' }}>({offerCurrency})</span>
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
        />
      )}
    </div>
  )
}
