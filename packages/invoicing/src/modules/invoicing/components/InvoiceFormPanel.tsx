'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
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

const sectionStyle: React.CSSProperties = {
  marginBottom: '16px',
  borderBottom: '1px solid var(--border)',
  paddingBottom: '16px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
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

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
}

function CollapsibleSection({ title, defaultOpen = true, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={sectionStyle}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          padding: '0 0 8px',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function ContractorSearch({ onSearch, onSelect }: {
  onSearch: (query: string) => Promise<ContractorOption[]>
  onSelect: (contractorId: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContractorOption[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const items = await onSearch(q)
      setResults(items)
      setOpen(items.length > 0)
    } finally {
      setSearching(false)
    }
  }, [onSearch])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  const handleSelect = async (contractor: ContractorOption) => {
    setOpen(false)
    setQuery('')
    setResults([])
    await onSelect(contractor.id)
  }

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Search className="h-3.5 w-3.5" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Search contractor by name or NIP..."
          style={{ ...inputStyle, fontSize: '12px' }}
        />
        {searching && <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>...</span>}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--background)', border: '1px solid var(--border)',
          borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
        }}>
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              {(c.taxId || c.primaryAddress) && (
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                  {c.taxId && <span>NIP: {c.taxId}</span>}
                  {c.taxId && c.primaryAddress && <span> · </span>}
                  {c.primaryAddress && (
                    <span>{[c.primaryAddress.addressLine, c.primaryAddress.city, c.primaryAddress.country].filter(Boolean).join(', ')}</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function InvoiceFormPanel({ form, totals, onUpdateField, onUpdateLineItem, onAddLineItem, onRemoveLineItem, onSearchContractors, onSelectContractor }: Props) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
          Invoice Details
        </div>
        <div style={gridStyle}>
          <Field label="Invoice Number">
            <input
              type="text"
              value={form.invoiceNumber}
              onChange={e => onUpdateField('invoiceNumber', e.target.value)}
              style={inputStyle}
              placeholder="FV/2026/03/001"
            />
          </Field>
          <Field label="Currency">
            <select
              value={form.currencyCode}
              onChange={e => onUpdateField('currencyCode', e.target.value)}
              style={inputStyle}
            >
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </Field>
          <Field label="Invoice Date">
            <input
              type="date"
              value={form.invoiceDate}
              onChange={e => onUpdateField('invoiceDate', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Service Date">
            <input
              type="date"
              value={form.serviceDate}
              onChange={e => onUpdateField('serviceDate', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Due Date">
            <input
              type="date"
              value={form.dueDate}
              onChange={e => onUpdateField('dueDate', e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* Seller */}
      <CollapsibleSection title="Seller">
        <div style={gridStyle}>
          <Field label="Company Name">
            <input type="text" value={form.sellerName} onChange={e => onUpdateField('sellerName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="NIP">
            <input type="text" value={form.sellerTaxId} onChange={e => onUpdateField('sellerTaxId', e.target.value)} style={inputStyle} placeholder="1234567890" />
          </Field>
          <Field label="Address">
            <input type="text" value={form.sellerAddress} onChange={e => onUpdateField('sellerAddress', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Country">
            <input type="text" value={form.sellerCountryCode} onChange={e => onUpdateField('sellerCountryCode', e.target.value)} style={inputStyle} maxLength={2} />
          </Field>
          <div style={{ gridColumn: 'span 2' }}>
            <Field label="Bank Account">
              <input type="text" value={form.sellerBankAccount} onChange={e => onUpdateField('sellerBankAccount', e.target.value)} style={inputStyle} placeholder="PL12 3456 7890 1234 5678 9012 3456" />
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      {/* Buyer */}
      <CollapsibleSection title="Buyer">
        {onSearchContractors && onSelectContractor && (
          <ContractorSearch onSearch={onSearchContractors} onSelect={onSelectContractor} />
        )}
        <div style={gridStyle}>
          <Field label="Company Name">
            <input type="text" value={form.buyerName} onChange={e => onUpdateField('buyerName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="NIP">
            <input type="text" value={form.buyerTaxId} onChange={e => onUpdateField('buyerTaxId', e.target.value)} style={inputStyle} placeholder="9876543210" />
          </Field>
          <Field label="Address">
            <input type="text" value={form.buyerAddress} onChange={e => onUpdateField('buyerAddress', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Country">
            <input type="text" value={form.buyerCountryCode} onChange={e => onUpdateField('buyerCountryCode', e.target.value)} style={inputStyle} maxLength={2} />
          </Field>
        </div>
      </CollapsibleSection>

      {/* Line Items */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
          Line Items
        </div>
        <InvoiceLineItemsTable
          lineItems={form.lineItems}
          onUpdate={onUpdateLineItem}
          onAdd={onAddLineItem}
          onRemove={onRemoveLineItem}
        />
      </div>

      {/* Totals */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}>Net</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{totals.netAmount} {form.currencyCode}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}>VAT</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{totals.vatAmount} {form.currencyCode}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}>Gross</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>{totals.grossAmount} {form.currencyCode}</div>
          </div>
        </div>
      </div>

      {/* Payment */}
      <CollapsibleSection title="Payment">
        <div style={gridStyle}>
          <Field label="Payment Method">
            <select value={form.paymentMethod} onChange={e => onUpdateField('paymentMethod', e.target.value)} style={inputStyle}>
              <option value="przelew">Bank transfer (przelew)</option>
              <option value="gotowka">Cash (gotowka)</option>
              <option value="karta">Card (karta)</option>
              <option value="kompensata">Compensation (kompensata)</option>
            </select>
          </Field>
          <Field label="Payment Terms">
            <input type="text" value={form.paymentTerms} onChange={e => onUpdateField('paymentTerms', e.target.value)} style={inputStyle} placeholder="14 days" />
          </Field>
        </div>
      </CollapsibleSection>

      {/* Notes */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Notes
        </div>
        <textarea
          value={form.notes}
          onChange={e => onUpdateField('notes', e.target.value)}
          style={{
            ...inputStyle,
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          placeholder="Additional notes..."
        />
      </div>
    </div>
  )
}
