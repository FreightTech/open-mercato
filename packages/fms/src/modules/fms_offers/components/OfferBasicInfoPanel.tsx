import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ChevronDown, ChevronRight, User, Truck, Settings, Package } from 'lucide-react'
import { ExchangeRateSection } from '../../tasks_board/components/ExchangeRateSection'
import { ContractorSearchInput } from './ContractorSearchInput'
import { CarrierSearchInput } from './CarrierSearchInput'

type OfferBasicInfoPanelProps = {
  offerType: 'sell' | 'buy'
  onOfferTypeChange: (type: 'sell' | 'buy') => void
  contractorId: string | null
  onContractorChange: (id: string | null, name?: string) => void
  carrierId: string | null
  onCarrierChange: (id: string | null, name?: string) => void
  validUntil: string
  onValidUntilChange: (date: string) => void
  direction: string | null
  onDirectionChange: (val: string | null) => void
  transportMode: string | null
  onTransportModeChange: (val: string | null) => void
  cargoType: string | null
  onCargoTypeChange: (val: string | null) => void
  usedCurrencies?: string[]
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string | null
  onChange: (val: string | null) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(value === opt.value ? null : opt.value)}
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600,
            border: value === opt.value ? '2px solid var(--primary)' : '2px solid var(--border)',
            background: value === opt.value ? 'var(--accent)' : 'transparent',
            color: value === opt.value ? 'var(--primary)' : 'var(--muted-foreground)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function formatDateForInput(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return ''
  }
}

const sectionLabelStyle: React.CSSProperties = {
  color: 'var(--muted-foreground)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '6px',
}

const sectionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  width: '100%',
  textAlign: 'left',
  padding: '10px 16px',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: 'var(--foreground)',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
}

export function OfferBasicInfoPanel({
  offerType,
  onOfferTypeChange,
  contractorId,
  onContractorChange,
  carrierId,
  onCarrierChange,
  validUntil,
  onValidUntilChange,
  direction,
  onDirectionChange,
  transportMode,
  onTransportModeChange,
  cargoType,
  onCargoTypeChange,
  usedCurrencies = [],
}: OfferBasicInfoPanelProps) {
  const t = useT()
  const [baseCurrency, setBaseCurrency] = useState(usedCurrencies[0] || 'USD')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['client', 'carrier', 'settings', 'rates'])
  )

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="w-[420px] shrink-0 overflow-hidden bg-card flex flex-col border-l">
      <div className="flex-1 overflow-y-auto">
        {/* Section: Client (Contractor) */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSection('client')}
            style={sectionButtonStyle}
          >
            {expandedSections.has('client')
              ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {t('fms_offers.wizard.contractor', 'Contractor')}
          </button>
          {expandedSections.has('client') && (
            <div style={{ padding: '0 16px 12px' }}>
              <ContractorSearchInput
                value={contractorId}
                onChange={onContractorChange}
                placeholder={t('fms_offers.wizard.selectContractor', 'Select contractor...')}
              />
            </div>
          )}
        </div>

        {/* Section: Carrier */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSection('carrier')}
            style={sectionButtonStyle}
          >
            {expandedSections.has('carrier')
              ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {t('fms_offers.wizard.carrier', 'Carrier')}
          </button>
          {expandedSections.has('carrier') && (
            <div style={{ padding: '0 16px 12px' }}>
              <CarrierSearchInput
                value={carrierId}
                onChange={onCarrierChange}
                placeholder={t('fms_offers.wizard.selectCarrier', 'Select carrier...')}
              />
            </div>
          )}
        </div>

        {/* Section: Offer Settings */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSection('settings')}
            style={sectionButtonStyle}
          >
            {expandedSections.has('settings')
              ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            <Settings className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {t('fms_offers.wizard.offerSettings', 'Offer settings')}
          </button>
          {expandedSections.has('settings') && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Offer Type */}
              <div>
                <div style={sectionLabelStyle}>
                  {t('fms_offers.wizard.offerType', 'Offer Type')}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => onOfferTypeChange('sell')}
                    style={{
                      padding: '5px 16px',
                      borderRadius: '9999px',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: offerType === 'sell' ? '2px solid #15803d' : '2px solid var(--border)',
                      background: offerType === 'sell' ? '#dcfce7' : 'transparent',
                      color: offerType === 'sell' ? '#15803d' : 'var(--muted-foreground)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    Sell
                  </button>
                  <button
                    type="button"
                    onClick={() => onOfferTypeChange('buy')}
                    style={{
                      padding: '5px 16px',
                      borderRadius: '9999px',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: offerType === 'buy' ? '2px solid #1d4ed8' : '2px solid var(--border)',
                      background: offerType === 'buy' ? '#dbeafe' : 'transparent',
                      color: offerType === 'buy' ? '#1d4ed8' : 'var(--muted-foreground)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    Buy
                  </button>
                </div>
              </div>

              {/* Valid Until */}
              <div>
                <div style={sectionLabelStyle}>
                  {t('fms_offers.wizard.validUntil', 'Valid Until')}
                </div>
                <input
                  type="date"
                  value={formatDateForInput(validUntil)}
                  onChange={(e) => {
                    if (e.target.value) {
                      onValidUntilChange(new Date(e.target.value).toISOString())
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Direction */}
              <div>
                <div style={sectionLabelStyle}>
                  {t('fms_offers.wizard.direction', 'Direction')}
                </div>
                <ChipGroup
                  options={[
                    { value: 'import', label: 'Import' },
                    { value: 'export', label: 'Export' },
                    { value: 'both', label: 'Both' },
                  ]}
                  value={direction}
                  onChange={onDirectionChange}
                />
              </div>

              {/* Transport Mode */}
              <div>
                <div style={sectionLabelStyle}>
                  {t('fms_offers.wizard.transportMode', 'Transport Mode')}
                </div>
                <ChipGroup
                  options={[
                    { value: 'sea', label: 'Sea' },
                    { value: 'air', label: 'Air' },
                    { value: 'road', label: 'Road' },
                    { value: 'rail', label: 'Rail' },
                    { value: 'barge', label: 'Barge' },
                  ]}
                  value={transportMode}
                  onChange={onTransportModeChange}
                />
              </div>

              {/* Cargo Type */}
              <div>
                <div style={sectionLabelStyle}>
                  {t('fms_offers.wizard.cargoType', 'Cargo Type')}
                </div>
                <ChipGroup
                  options={[
                    { value: 'general', label: 'General' },
                    { value: 'dangerous', label: 'Dangerous' },
                    { value: 'perishable', label: 'Perishable' },
                    { value: 'oog', label: 'OOG' },
                  ]}
                  value={cargoType}
                  onChange={onCargoTypeChange}
                />
              </div>
            </div>
          )}
        </div>

        {/* Section: Exchange Rates */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => toggleSection('rates')}
            style={sectionButtonStyle}
          >
            {expandedSections.has('rates')
              ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {t('fms_offers.wizard.exchangeRates', 'Exchange rates')}
          </button>
          {expandedSections.has('rates') && (
            <div style={{ padding: '0 16px 12px' }}>
              <ExchangeRateSection
                usedCurrencies={usedCurrencies}
                baseCurrency={baseCurrency}
                onBaseCurrencyChange={setBaseCurrency}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
