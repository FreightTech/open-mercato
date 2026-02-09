import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'

export type ChargeRow = {
  id: string
  productId: string | null
  productName: string
  chargeCode: string
  chargeBasis: string
  containerType: string | null
  currencyCode: string
  rate: number
  marginPercent: number
  buyPrice: number
  sellPrice: number
  isEnabled: boolean
}

type ChargesTableProps = {
  rows: ChargeRow[]
  onChange: (rows: ChargeRow[]) => void
  transportMode?: string
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'CHF']

const numFieldStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: '13px',
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  padding: '6px 8px',
  color: 'inherit',
}

/** Click-to-edit text/number cell */
function EditableCell({
  value,
  onChange,
  type = 'text',
  align = 'left',
  placeholder,
  style,
}: {
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  align?: 'left' | 'right'
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = useCallback(() => {
    if (draft !== value) onChange(draft)
    // Defer removing the input so the browser can process Tab focus transfer first
    requestAnimationFrame(() => setEditing(false))
  }, [draft, value, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    }
  }, [commit, value])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        step={type === 'number' ? '0.01' : undefined}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '13px',
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          textAlign: align,
          padding: '2px 0',
          color: 'inherit',
          ...style,
        }}
      />
    )
  }

  return (
    <span
      tabIndex={0}
      onClick={() => setEditing(true)}
      onFocus={() => setEditing(true)}
      style={{
        display: 'block',
        cursor: 'pointer',
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
        textAlign: align,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        borderRadius: '4px',
        padding: '2px 4px',
        margin: '0 -4px',
        transition: 'background 0.1s',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {value || <span style={{ color: 'var(--muted-foreground)' }}>{placeholder || '-'}</span>}
    </span>
  )
}

/** Click-to-edit currency dropdown with keyboard navigation (fixed positioning to escape overflow) */
function CurrencyCell({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(() => Math.max(0, CURRENCIES.indexOf(value)))
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setHighlightedIndex(Math.max(0, CURRENCIES.indexOf(value)))
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setDropdownPos({ top: rect.bottom + 4, left: rect.left })
      }
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    const handleScroll = () => setOpen(false)
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  const selectAndClose = useCallback((cur: string) => {
    onChange(cur)
    setOpen(false)
    triggerRef.current?.focus()
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < CURRENCIES.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectAndClose(CURRENCIES[highlightedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }, [open, highlightedIndex, selectAndClose])

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '9999px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          background: 'var(--background)',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--foreground)'; e.currentTarget.style.background = 'var(--accent)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--background)' }}
      >
        {value}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
      {open && dropdownPos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 9999,
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            minWidth: '90px',
            padding: '4px',
          }}
        >
          {CURRENCIES.map((cur, idx) => (
            <button
              key={cur}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); selectAndClose(cur) }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              style={{
                display: 'block',
                width: '100%',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: cur === value ? 700 : 400,
                textAlign: 'left',
                border: 'none',
                borderRadius: '8px',
                background: idx === highlightedIndex ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              {cur}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

const CONTAINER_TYPES = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '40RH', 'LCL']

function ContainerCell({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(() => Math.max(0, CONTAINER_TYPES.indexOf(value || '')))
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (open) {
      setHighlightedIndex(Math.max(0, CONTAINER_TYPES.indexOf(value || '')))
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  const selectAndClose = useCallback((ct: string) => {
    onChange(ct)
    setOpen(false)
    triggerRef.current?.focus()
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((prev) => (prev < CONTAINER_TYPES.length - 1 ? prev + 1 : prev)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAndClose(CONTAINER_TYPES[highlightedIndex]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus() }
    else if (e.key === 'Tab') { setOpen(false) }
  }, [open, highlightedIndex, selectAndClose])

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        ref={triggerRef}
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          borderRadius: '9999px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          background: 'var(--background)',
          transition: 'border-color 0.15s, background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--foreground)'; e.currentTarget.style.background = 'var(--accent)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--background)' }}
      >
        {value || 'Container'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            zIndex: 9999,
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            minWidth: '80px',
            padding: '4px',
          }}
        >
          {CONTAINER_TYPES.map((ct, idx) => (
            <button
              key={ct}
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); selectAndClose(ct) }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              style={{
                display: 'block',
                width: '100%',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: ct === value ? 700 : 400,
                textAlign: 'left',
                border: 'none',
                borderRadius: '8px',
                background: idx === highlightedIndex ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              {ct}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChargesTable({ rows, onChange, transportMode }: ChargesTableProps) {
  const showContainerCol = transportMode === 'sea'
  const allEnabled = useMemo(() => rows.length > 0 && rows.every((r) => r.isEnabled), [rows])
  const someEnabled = useMemo(() => rows.some((r) => r.isEnabled) && !allEnabled, [rows, allEnabled])

  const toggleAll = useCallback(() => {
    const newVal = !allEnabled
    onChange(rows.map((row) => ({ ...row, isEnabled: newVal })))
  }, [rows, allEnabled, onChange])

  const updateRow = useCallback(
    (index: number, updates: Partial<ChargeRow>) => {
      onChange(
        rows.map((row, idx) => (idx === index ? { ...row, ...updates } : row)),
      )
    },
    [rows, onChange],
  )

  const duplicateRow = useCallback(
    (index: number) => {
      const source = rows[index]
      const copy: ChargeRow = { ...source, id: `copy-${Date.now()}-${index}` }
      const next = [...rows]
      next.splice(index + 1, 0, copy)
      onChange(next)
    },
    [rows, onChange],
  )

  const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
  }

  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '13px',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
    verticalAlign: 'middle',
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, width: 36, textAlign: 'center', padding: '8px 6px', verticalAlign: 'middle' }}>
            <input
              type="checkbox"
              checked={allEnabled}
              ref={(el) => { if (el) el.indeterminate = someEnabled }}
              onChange={toggleAll}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleAll() } }}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--foreground)', verticalAlign: 'middle' }}
            />
          </th>
          <th style={thStyle}>Name</th>
          {showContainerCol && <th style={{ ...thStyle, width: 80 }} />}
          <th style={{ ...thStyle, width: 90 }}>Currency</th>
          <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Buy</th>
          <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Sell</th>
          <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Margin</th>
          <th style={{ ...thStyle, width: 32, padding: '8px 4px' }} />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={showContainerCol ? 8 : 7}
              style={{ ...tdStyle, padding: '20px 10px', textAlign: 'center', color: 'var(--muted-foreground)' }}
            >
              No products available
            </td>
          </tr>
        ) : (
          rows.map((row, index) => {
            const marginPct = row.buyPrice > 0
              ? ((row.sellPrice - row.buyPrice) / row.buyPrice) * 100
              : 0
            const marginColor = marginPct > 0
              ? '#16a34a'
              : marginPct < 0
                ? '#dc2626'
                : 'var(--muted-foreground)'
            const marginBg = marginPct > 0
              ? 'rgba(22, 163, 74, 0.1)'
              : marginPct < 0
                ? 'rgba(220, 38, 38, 0.1)'
                : 'rgba(128, 128, 128, 0.08)'
            return (
              <tr key={row.id}>
                <td style={{ ...tdStyle, width: 36, textAlign: 'center', padding: '8px 6px', verticalAlign: 'middle' }}>
                  <input
                    type="checkbox"
                    checked={row.isEnabled}
                    onChange={(e) => updateRow(index, { isEnabled: e.target.checked })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); updateRow(index, { isEnabled: !row.isEnabled }) } }}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--foreground)', verticalAlign: 'middle' }}
                  />
                </td>
                <td style={tdStyle}>
                  <EditableCell
                    value={row.productName}
                    onChange={(v) => updateRow(index, { productName: v })}
                    style={{ fontWeight: row.isEnabled ? 500 : 400 }}
                  />
                </td>
                {showContainerCol && (
                  <td style={tdStyle}>
                    {row.chargeBasis === 'container' && (
                      <ContainerCell
                        value={row.containerType}
                        onChange={(v) => updateRow(index, { containerType: v })}
                      />
                    )}
                  </td>
                )}
                <td style={tdStyle}>
                  <CurrencyCell
                    value={row.currencyCode}
                    onChange={(v) => updateRow(index, { currencyCode: v })}
                  />
                </td>
                <td style={{ ...tdStyle, width: 100, padding: '4px 8px' }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.buyPrice || ''}
                    placeholder="0.00"
                    onChange={(e) => updateRow(index, { buyPrice: parseFloat(e.target.value) || 0 })}
                    style={numFieldStyle}
                  />
                </td>
                <td style={{ ...tdStyle, width: 100, padding: '4px 8px' }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.sellPrice || ''}
                    placeholder="0.00"
                    onChange={(e) => updateRow(index, { sellPrice: parseFloat(e.target.value) || 0 })}
                    style={numFieldStyle}
                  />
                </td>
                <td style={{ ...tdStyle, width: 100, textAlign: 'right' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: marginColor,
                      background: marginBg,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {marginPct > 0 ? '+' : ''}{marginPct.toFixed(1)}%
                  </span>
                </td>
                <td style={{ ...tdStyle, width: 32, padding: '4px 4px', textAlign: 'center' }}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => duplicateRow(index)}
                    title="Duplicate row"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--muted-foreground)',
                      transition: 'background 0.1s, color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--accent)'
                      e.currentTarget.style.color = 'var(--foreground)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--muted-foreground)'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
