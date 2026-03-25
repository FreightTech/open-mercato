'use client'

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Building2, Check, X, Pencil } from 'lucide-react'
import { DynamicGrid } from '@open-mercato/ui/backend/dynamic-grid'
import type { GridRowDef } from '@open-mercato/ui/backend/dynamic-grid'
import { useEventHandlers } from '@open-mercato/ui/backend/dynamic-table'
import { TableEvents } from '@open-mercato/ui/backend/dynamic-table'
import type { CellEditSaveEvent } from '@open-mercato/ui/backend/dynamic-table'
import { InvoiceLineItemsTable } from './InvoiceLineItemsTable'
import type { InvoiceFormState, LineItemState, ContractorOption } from '../lib/useInvoiceBuilderState'

type Props = {
  form: InvoiceFormState
  totals: { netAmount: string; vatAmount: string; grossAmount: string }
  onUpdateField: <K extends keyof InvoiceFormState>(field: K, value: InvoiceFormState[K]) => void
  onUpdateLineItem: (index: number, field: keyof LineItemState, value: string) => void
  onAddLineItem: () => void
  onRemoveLineItem: (index: number) => void
  onSearchContractors?: (query: string) => Promise<ContractorOption[]>
  onSelectContractor?: (contractorId: string) => Promise<void>
}

// ── Shared styles ──

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: '13px',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--background)',
  color: 'var(--foreground)',
}

// ── Inline field display (label: value) ──

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '13px', lineHeight: '1.6' }}>
      <span style={{ ...sectionLabelStyle, fontSize: '11px', minWidth: '40px', paddingTop: '2px' }}>{label}</span>
      <span style={{ color: value ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ── Buyer contractor search (follows RFQ wizard pattern) ──

function BuyerContractorSearch({ selectedName, onSearch, onSelect, onClear }: {
  selectedName: string
  onSearch: (query: string) => Promise<ContractorOption[]>
  onSelect: (contractorId: string) => Promise<void>
  onClear: () => void
}) {
  const [isFocused, setIsFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [results, setResults] = useState<ContractorOption[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch on focus or when search changes
  useEffect(() => {
    if (!isFocused) return
    let cancelled = false
    setLoading(true)
    onSearch(debouncedSearch).then(items => {
      if (!cancelled) {
        setResults(items)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [isFocused, debouncedSearch, onSearch])

  const showDropdown = isFocused && (results.length > 0 || loading)

  useEffect(() => { setHighlightedIndex(0) }, [results])

  useEffect(() => {
    if (listRef.current && showDropdown) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement | undefined
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, showDropdown])

  // Click outside
  useEffect(() => {
    if (!isFocused) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isFocused])

  useEffect(() => {
    return () => { if (blurTimeout.current) clearTimeout(blurTimeout.current) }
  }, [])

  const handleSelect = useCallback((item: ContractorOption) => {
    setSearchQuery('')
    setIsFocused(false)
    inputRef.current?.blur()
    onSelect(item.id)
  }, [onSelect])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClear()
    setSearchQuery('')
    inputRef.current?.focus()
  }, [onClear])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    if (selectedName) {
      setSearchQuery(selectedName)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [selectedName])

  const handleBlur = useCallback(() => {
    blurTimeout.current = setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsFocused(false)
        setSearchQuery('')
      }
    }, 150)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setIsFocused(false)
      setSearchQuery('')
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showDropdown && results.length > 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex])
      }
    }
  }, [results, highlightedIndex, showDropdown, handleSelect])

  const displayValue = isFocused ? searchQuery : (selectedName || '')

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '0 12px', borderRadius: '9999px',
        border: `1.5px solid ${isFocused ? 'var(--ring)' : 'color-mix(in srgb, var(--foreground) 25%, var(--border))'}`,
        background: 'var(--background)', height: '36px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: isFocused ? '0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)' : 'none',
      }}>
        <Building2 style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }} />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={e => {
            setSearchQuery(e.target.value)
            if (selectedName) onClear()
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Select buyer..."
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: '13px', color: 'var(--foreground)', minWidth: 0, padding: 0,
          }}
        />
        {selectedName && !isFocused && (
          <X
            style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.35, cursor: 'pointer' }}
            onClick={handleClear}
          />
        )}
      </div>

      {showDropdown && (
        <div style={{
          position: 'absolute', zIndex: 50, width: '100%', marginTop: '4px',
          background: 'var(--popover)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          <div ref={listRef} style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Loading...</div>
            ) : results.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>No contractors found</div>
            ) : (
              results.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', fontSize: '13px', textAlign: 'left',
                    border: 'none', cursor: 'pointer',
                    background: index === highlightedIndex ? 'var(--accent)' : 'transparent',
                    color: index === highlightedIndex ? 'var(--accent-foreground)' : 'var(--popover-foreground)',
                  }}
                >
                  <Building2 style={{ width: 13, height: 13, flexShrink: 0, opacity: 0.4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    {item.taxId && (
                      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px' }}>NIP: {item.taxId}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Editable party section (Seller / Buyer) ──

function PartySection({ title, name, taxId, address, countryCode, bankAccount, onUpdateField, fieldPrefix, onSearchContractors, onSelectContractor, onClearContractor }: {
  title: string
  name: string
  taxId: string
  address: string
  countryCode: string
  bankAccount?: string
  onUpdateField: (field: string, value: string) => void
  fieldPrefix: 'seller' | 'buyer'
  onSearchContractors?: (query: string) => Promise<ContractorOption[]>
  onSelectContractor?: (contractorId: string) => Promise<void>
  onClearContractor?: () => void
}) {
  const [manualEdit, setManualEdit] = useState(false)
  const [searching, setSearching] = useState(false)
  const hasBuyerSearch = !!(onSearchContractors && onSelectContractor)

  const fullAddress = [address, countryCode].filter(Boolean).join(', ')

  // Manual edit mode (inline form fields)
  if (manualEdit) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={sectionLabelStyle}>{title}</span>
          <button
            type="button"
            onClick={() => setManualEdit(false)}
            style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <input type="text" value={name} onChange={e => onUpdateField(`${fieldPrefix}Name`, e.target.value)} style={inputStyle} placeholder="Company name" />
          </div>
          <input type="text" value={taxId} onChange={e => onUpdateField(`${fieldPrefix}TaxId`, e.target.value)} style={inputStyle} placeholder="NIP / Tax ID" />
          <input type="text" value={countryCode} onChange={e => onUpdateField(`${fieldPrefix}CountryCode`, e.target.value)} style={inputStyle} placeholder="Country" maxLength={2} />
          <div style={{ gridColumn: 'span 2' }}>
            <input type="text" value={address} onChange={e => onUpdateField(`${fieldPrefix}Address`, e.target.value)} style={inputStyle} placeholder="Address" />
          </div>
          {bankAccount !== undefined && (
            <div style={{ gridColumn: 'span 2' }}>
              <input type="text" value={bankAccount} onChange={e => onUpdateField(`${fieldPrefix}BankAccount`, e.target.value)} style={inputStyle} placeholder="IBAN / Bank account" />
            </div>
          )}
        </div>
      </div>
    )
  }

  const showSearch = hasBuyerSearch && (!name || searching)

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={sectionLabelStyle}>{title}</span>
        {/* Pencil: for buyer with search → toggle search; for seller → manual edit */}
        <button
          type="button"
          onClick={() => hasBuyerSearch ? setSearching(true) : setManualEdit(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--muted-foreground)' }}
          title={hasBuyerSearch ? `Change ${title.toLowerCase()}` : `Edit ${title.toLowerCase()}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      {showSearch ? (
        <div style={{ marginBottom: '6px' }}>
          <BuyerContractorSearch
            selectedName={name}
            onSearch={onSearchContractors!}
            onSelect={async (id) => { await onSelectContractor!(id); setSearching(false) }}
            onClear={onClearContractor!}
          />
          <button
            type="button"
            onClick={() => { setSearching(false); setManualEdit(true) }}
            style={{ fontSize: '11px', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px' }}
          >
            Enter manually
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px', color: name ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
          {name || 'Set company name'}
        </div>
      )}
      <InfoLine label="NIP" value={taxId} />
      <InfoLine label="ADRES" value={fullAddress} />
      {bankAccount !== undefined && <InfoLine label="IBAN" value={bankAccount} />}
    </div>
  )
}

// ── Main component ──

export function InvoiceFormPanel({ form, totals, onUpdateField, onUpdateLineItem, onAddLineItem, onRemoveLineItem, onSearchContractors, onSelectContractor }: Props) {
  const detailsGridRef = useRef<HTMLDivElement>(null)

  const detailsData = useMemo(() => ({
    invoiceDate: form.invoiceDate,
    serviceDate: form.serviceDate,
    dueDate: form.dueDate,
    paymentMethod: form.paymentMethod,
    currencyCode: form.currencyCode,
  }), [form.invoiceDate, form.serviceDate, form.dueDate, form.paymentMethod, form.currencyCode])

  const hasDueDate = !!form.dueDate

  const detailsRows = useMemo<GridRowDef[]>(() => [
    {
      cells: [
        { field: 'invoiceDate', label: 'Invoice Date', type: 'date' as const },
        { field: 'serviceDate', label: 'Service Date', type: 'date' as const },
        {
          field: 'dueDate',
          label: 'Due Date',
          type: 'date' as const,
          required: true,
        },
        {
          field: 'paymentMethod',
          label: 'Payment',
          type: 'dropdown' as const,
          source: ['przelew', 'gotowka', 'karta', 'kompensata'],
          renderer: (value: any) => {
            const map: Record<string, string> = { przelew: 'Bank transfer', gotowka: 'Cash', karta: 'Card', kompensata: 'Compensation' }
            return map[value] || value || '—'
          },
        },
        {
          field: 'currencyCode',
          label: 'Currency',
          type: 'dropdown' as const,
          source: ['PLN', 'EUR', 'USD', 'GBP'],
        },
      ],
    },
  ], [])

  useEventHandlers({
    [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
      onUpdateField(payload.prop as keyof InvoiceFormState, payload.newValue)
    },
  }, detailsGridRef, { stopPropagation: true })

  const handlePartyFieldUpdate = useCallback((field: string, value: string) => {
    onUpdateField(field as keyof InvoiceFormState, value)
  }, [onUpdateField])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* ── Details grid ── */}
      <div style={{ padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
        <DynamicGrid
          data={detailsData}
          rows={detailsRows}
          gridRef={detailsGridRef}
          columns={5}
        />
      </div>

      {/* ── Seller / Buyer ── */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1, padding: '16px 20px', borderRight: '1px solid var(--border)' }}>
          <PartySection
            title="Seller"
            name={form.sellerName}
            taxId={form.sellerTaxId}
            address={form.sellerAddress}
            countryCode={form.sellerCountryCode}
            bankAccount={form.sellerBankAccount}
            onUpdateField={handlePartyFieldUpdate}
            fieldPrefix="seller"
          />
        </div>
        <div style={{ flex: 1, padding: '16px 20px' }}>
          <PartySection
            title="Buyer"
            name={form.buyerName}
            taxId={form.buyerTaxId}
            address={form.buyerAddress}
            countryCode={form.buyerCountryCode}
            onUpdateField={handlePartyFieldUpdate}
            fieldPrefix="buyer"
            onSearchContractors={onSearchContractors}
            onSelectContractor={onSelectContractor}
            onClearContractor={() => {
              onUpdateField('buyerName', '')
              onUpdateField('buyerTaxId', '')
              onUpdateField('buyerAddress', '')
              onUpdateField('buyerCountryCode', '')
            }}
          />
        </div>
      </div>

      {/* ── Line Items ── */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...sectionLabelStyle, marginBottom: '12px' }}>Line Items</div>
        <InvoiceLineItemsTable
          lineItems={form.lineItems}
          onUpdate={onUpdateLineItem}
          onAdd={onAddLineItem}
          onRemove={onRemoveLineItem}
        />
      </div>

      {/* ── Footer bar ── */}
      <div style={{
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        fontSize: '12px',
        color: 'var(--muted-foreground)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <span style={sectionLabelStyle}>Sposób płatności</span>{' '}
          <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
            {{ przelew: 'Przelew bankowy', gotowka: 'Gotówka', karta: 'Karta', kompensata: 'Kompensata' }[form.paymentMethod] || form.paymentMethod}
          </span>
        </div>
        {form.sellerBankAccount && (
          <div>
            <span style={sectionLabelStyle}>Konto</span>{' '}
            <span style={{ color: 'var(--foreground)', fontWeight: 500, fontFamily: 'monospace', fontSize: '11px' }}>{form.sellerBankAccount}</span>
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      {form.notes && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ ...sectionLabelStyle, marginBottom: '8px' }}>Notes</div>
          <textarea
            value={form.notes}
            onChange={e => onUpdateField('notes', e.target.value)}
            style={{
              ...inputStyle,
              minHeight: '60px',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
            placeholder="Additional notes..."
          />
        </div>
      )}
    </div>

    {/* ── Totals — sticky bottom bar ── */}
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--border)',
      background: 'var(--background)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '24px',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{ fontSize: '15px', color: 'var(--muted-foreground)' }}>
        Netto <span style={{ color: 'var(--foreground)', fontWeight: 500, marginLeft: '4px' }}>{totals.netAmount}</span>
      </div>
      <div style={{ fontSize: '15px', color: 'var(--muted-foreground)' }}>
        VAT <span style={{ color: 'var(--foreground)', fontWeight: 500, marginLeft: '4px' }}>{totals.vatAmount}</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700 }}>
        Brutto <span style={{ marginLeft: '6px' }}>{totals.grossAmount} {form.currencyCode}</span>
      </div>
    </div>
    </div>
  )
}
