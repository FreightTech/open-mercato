import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'

/** Finds the closest dialog ancestor so portaled dropdowns stay inside the Radix focus trap */
function useDialogPortal(ref: React.RefObject<HTMLElement | null>) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (ref.current) {
      setContainer(ref.current.closest('[role="dialog"]') as HTMLElement | null)
    }
  }, [ref])
  return container
}

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
  quantity: number
  isEnabled: boolean
  sectionType?: string | null
}

export type ChargesSection = {
  sectionType: string
  label: string
  rows: ChargeRow[]
}

type ChargesTableProps = {
  rows: ChargeRow[]
  onChange: (rows: ChargeRow[]) => void
  onAddLine?: (sectionType: string) => void
  transportMode?: string
  incoterm?: string | null
  sections?: ChargesSection[]
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'CHF']

/** Format a number for display: strip unnecessary trailing zeros, keep up to 2 decimals */
function formatNum(value: number): string {
  if (!value) return ''
  // Round to 2 decimal places, then strip trailing zeros
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

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

type FmsProduct = {
  id: string
  name: string
  chargeCode: string | null
  chargeUnit: string | null
}

/** Product name cell with autocomplete from FMS products */
function ProductNameCell({
  value,
  productId,
  onChange,
  autoFocus,
  style: outerStyle,
  transportMode,
}: {
  value: string
  productId: string | null
  onChange: (name: string, productId: string | null, chargeCode: string, chargeBasis: string) => void
  autoFocus?: boolean
  style?: React.CSSProperties
  transportMode?: string
}) {
  const [editing, setEditing] = useState(!!autoFocus)
  const [draft, setDraft] = useState(value)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const dialogPortal = useDialogPortal(inputRef)

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['fms-products-autocomplete', transportMode],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (transportMode) params.set('transportMode', transportMode)
      const res = await apiCall<{ items: FmsProduct[] }>(`/api/fms_products/products?${params}`)
      if (res.ok && res.result) return res.result.items
      return []
    },
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    if (!products) return []
    if (!draft.trim()) return products
    const q = draft.trim().toLowerCase()
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.chargeCode && p.chargeCode.toLowerCase().includes(q)),
    )
  }, [products, draft])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Recalculate dropdown position when editing, draft, or filtered list changes
  useEffect(() => {
    if (editing && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 220) })
    }
  }, [editing, draft, filtered.length])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [draft])

  const commit = useCallback((name: string, pid: string | null, code: string, basis: string) => {
    onChange(name, pid, code, basis)
    requestAnimationFrame(() => setEditing(false))
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        const p = filtered[highlightedIndex]
        setDraft(p.name)
        commit(p.name, p.id, p.chargeCode || '', p.chargeUnit || '')
      } else {
        commit(draft, productId, '', '')
      }
    } else if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    } else if (e.key === 'Tab') {
      commit(draft, productId, '', '')
    }
  }, [filtered, highlightedIndex, draft, productId, value, commit])

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Don't close if clicking inside the dropdown
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) return
    // Don't close if focus moved to another element inside the same wrapper
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return
    // Debounce to avoid race with dialog focus trap stealing focus on mount
    setTimeout(() => {
      if (document.activeElement && wrapperRef.current?.contains(document.activeElement)) return
      commit(draft, productId, '', '')
    }, 150)
  }, [draft, productId, commit])

  const showDropdown = editing && (filtered.length > 0 || productsLoading)

  if (editing) {
    return (
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Product name..."
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            fontFamily: 'inherit',
            textAlign: 'left',
            padding: '2px 0',
            color: 'inherit',
            ...outerStyle,
          }}
        />
        {showDropdown && dropdownPos && ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
              background: 'var(--popover, #fff)',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              maxHeight: 200,
              overflowY: 'auto',
              padding: 4,
              pointerEvents: 'auto',
            }}
          >
            {productsLoading ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}>
                Loading products...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}>
                No matching products
              </div>
            ) : (
              filtered.slice(0, 20).map((product, idx) => (
                <button
                  key={product.id}
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDraft(product.name)
                    commit(product.name, product.id, product.chargeCode || '', product.chargeUnit || '')
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '7px 12px',
                    fontSize: 13,
                    textAlign: 'left',
                    border: 'none',
                    borderRadius: 6,
                    background: idx === highlightedIndex ? 'var(--accent, #f3f4f6)' : 'transparent',
                    cursor: 'pointer',
                    color: 'inherit',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.name}
                  </span>
                  {(product.chargeCode || product.chargeUnit) && (
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground, #6b7280)', flexShrink: 0 }}>
                      {[product.chargeCode, product.chargeUnit].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>,
          dialogPortal || document.body,
        )}
      </div>
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
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        borderRadius: '4px',
        padding: '2px 4px',
        margin: '0 -4px',
        transition: 'background 0.1s',
        ...outerStyle,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {value || <span style={{ color: 'var(--muted-foreground)' }}>Product name...</span>}
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
  const dialogPortal = useDialogPortal(triggerRef)

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
            pointerEvents: 'auto',
          }}
        >
          {CURRENCIES.map((cur, idx) => (
            <button
              key={cur}
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); selectAndClose(cur) }}
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
        dialogPortal || document.body,
      )}
    </>
  )
}

const CONTAINER_TYPES = ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '40RH', 'LCL']
const CHARGE_BASIS_OPTIONS = ['Container', 'B/L', 'Shipment', 'kg', 'cbm']

/** Which cost sections are visible based on selected incoterm */
const INCOTERM_VISIBLE_SECTIONS: Record<string, Set<string>> = {
  exw: new Set(['main_freight', 'origin', 'destination']),
  fca: new Set(['main_freight', 'origin', 'destination']),
  fas: new Set(['main_freight', 'origin']),
  fob: new Set(['main_freight', 'destination']),
  cfr: new Set(['main_freight', 'destination']),
  cif: new Set(['main_freight', 'destination']),
  cpt: new Set(['main_freight', 'destination']),
  cip: new Set(['main_freight', 'destination']),
  dap: new Set(['main_freight']),
  dpu: new Set(['main_freight']),
  ddp: new Set(['main_freight']),
}

export function getVisibleSections(incoterm: string | null | undefined): Set<string> {
  if (!incoterm) return new Set(['main_freight', 'origin', 'destination'])
  return INCOTERM_VISIBLE_SECTIONS[incoterm.toLowerCase()] || new Set(['main_freight', 'origin', 'destination'])
}

const SECTION_STYLE: Record<string, { borderLeft: string; text: string }> = {
  main_freight: { borderLeft: 'var(--primary)', text: 'var(--foreground)' },
  origin: { borderLeft: '#f59e0b', text: 'var(--foreground)' },
  destination: { borderLeft: '#8b5cf6', text: 'var(--foreground)' },
}

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

export function ChargesTable({ rows, onChange, onAddLine, transportMode, incoterm, sections }: ChargesTableProps) {
  const showContainerCol = transportMode === 'sea' || transportMode === 'rail'
  const [defaultMargin, setDefaultMargin] = useState<string>('')
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null)
  const [dropTargetSection, setDropTargetSection] = useState<string | null>(null)
  const allEnabled = useMemo(() => rows.length > 0 && rows.every((r) => r.isEnabled), [rows])
  const someEnabled = useMemo(() => rows.some((r) => r.isEnabled) && !allEnabled, [rows, allEnabled])

  // Track newly added rows to auto-focus their product name cell
  const prevRowIdsRef = useRef<Set<string>>(new Set(rows.map((r) => r.id)))
  const [autoFocusRowId, setAutoFocusRowId] = useState<string | null>(null)
  useEffect(() => {
    const prevIds = prevRowIdsRef.current
    const currentIds = new Set(rows.map((r) => r.id))
    const newIds = rows.filter((r) => !prevIds.has(r.id) && !r.productName)
    if (newIds.length > 0) {
      setAutoFocusRowId(newIds[newIds.length - 1].id)
    }
    prevRowIdsRef.current = currentIds
  }, [rows])

  const toggleAll = useCallback(() => {
    const newVal = !allEnabled
    onChange(rows.map((row) => ({ ...row, isEnabled: newVal })))
  }, [rows, allEnabled, onChange])

  const applyDefaultMargin = useCallback((marginStr: string) => {
    const margin = parseFloat(marginStr)
    if (isNaN(margin)) return
    onChange(
      rows.map((row) => {
        if (row.buyPrice <= 0) return row
        const sellPrice = Math.round(row.buyPrice * (1 + margin / 100) * 100) / 100
        return { ...row, sellPrice, marginPercent: margin }
      }),
    )
  }, [rows, onChange])

  const handleMarginChange = useCallback((value: string) => {
    setDefaultMargin(value)
    if (value.trim()) {
      applyDefaultMargin(value)
    }
  }, [applyDefaultMargin])

  const updateRow = useCallback(
    (rowId: string, updates: Partial<ChargeRow>) => {
      onChange(
        rows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
      )
    },
    [rows, onChange],
  )

  const duplicateRow = useCallback(
    (rowId: string) => {
      const index = rows.findIndex((r) => r.id === rowId)
      if (index === -1) return
      const source = rows[index]
      const copy: ChargeRow = { ...source, id: `new-copy-${Date.now()}-${index}` }
      const next = [...rows]
      next.splice(index + 1, 0, copy)
      onChange(next)
    },
    [rows, onChange],
  )

  const deleteRow = useCallback(
    (rowId: string) => {
      onChange(rows.filter((r) => r.id !== rowId))
    },
    [rows, onChange],
  )

  const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  const tdStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: '13px',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
    verticalAlign: 'middle',
  }

  const COL_COUNT = showContainerCol ? 11 : 10

  const handleDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    setDraggingRowId(rowId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', rowId)
    // Make the drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggingRowId(null)
    setDropTargetSection(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleSectionDragOver = useCallback((e: React.DragEvent, sectionType: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetSection(sectionType)
  }, [])

  const handleSectionDragLeave = useCallback(() => {
    setDropTargetSection(null)
  }, [])

  const handleSectionDrop = useCallback((e: React.DragEvent, targetSection: string) => {
    e.preventDefault()
    setDropTargetSection(null)
    const rowId = draggingRowId || e.dataTransfer.getData('text/plain')
    if (!rowId) return
    setDraggingRowId(null)
    // Update the row's sectionType
    onChange(rows.map((r) => r.id === rowId ? { ...r, sectionType: targetSection } : r))
  }, [draggingRowId, rows, onChange])

  function renderRow(row: ChargeRow) {
    const marginPct = row.buyPrice > 0
      ? ((row.sellPrice - row.buyPrice) / row.buyPrice) * 100
      : 0
    const marginColor = marginPct > 0 ? '#16a34a' : marginPct < 0 ? '#dc2626' : 'var(--muted-foreground)'
    const marginBg = marginPct > 0 ? 'rgba(22, 163, 74, 0.1)' : marginPct < 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(128, 128, 128, 0.08)'

    return (
      <tr
        key={row.id}
        draggable
        onDragStart={(e) => handleDragStart(e, row.id)}
        onDragEnd={handleDragEnd}
        style={{ opacity: draggingRowId === row.id ? 0.3 : 1, transition: 'opacity 0.15s' }}
      >
        {/* Drag handle */}
        <td style={{ ...tdStyle, width: 20, padding: '6px 2px 6px 6px', cursor: 'grab', verticalAlign: 'middle' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.25 }}>
            <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
            <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" />
          </svg>
        </td>
        {/* Checkbox */}
        <td style={{ ...tdStyle, width: 36, textAlign: 'center', padding: '6px 6px', verticalAlign: 'middle' }}>
          <input
            type="checkbox"
            checked={row.isEnabled}
            onChange={(e) => updateRow(row.id, { isEnabled: e.target.checked })}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--foreground)', verticalAlign: 'middle' }}
          />
        </td>
        {/* Product name */}
        <td style={tdStyle}>
          <ProductNameCell
            value={row.productName}
            productId={row.productId}
            autoFocus={autoFocusRowId === row.id}
            transportMode={transportMode}
            onChange={(name, pid, code, basis) => {
              if (autoFocusRowId === row.id) setAutoFocusRowId(null)
              updateRow(row.id, {
                productName: name,
                productId: pid,
                chargeCode: code || row.chargeCode,
                chargeBasis: basis || row.chargeBasis,
              })
            }}
            style={{ fontWeight: row.isEnabled ? 500 : 400 }}
          />
        </td>
        {/* Basis */}
        <td style={{ ...tdStyle, width: 100 }}>
          <select
            value={row.chargeBasis || ''}
            onChange={(e) => updateRow(row.id, { chargeBasis: e.target.value })}
            style={{
              fontSize: '12px', padding: '3px 6px', border: '1px solid var(--border)',
              borderRadius: '6px', background: 'var(--background)', fontFamily: 'inherit',
              color: 'inherit', outline: 'none', cursor: 'pointer', width: '100%',
            }}
          >
            <option value="">—</option>
            {CHARGE_BASIS_OPTIONS.map((b) => (
              <option key={b} value={b.toLowerCase()}>{b}</option>
            ))}
          </select>
        </td>
        {/* Container type (sea/rail only) */}
        {showContainerCol && (
          <td style={{ ...tdStyle, width: 76 }}>
            {(row.chargeBasis === 'container' || row.chargeBasis === 'per_container') ? (
              <ContainerCell
                value={row.containerType}
                onChange={(v) => updateRow(row.id, { containerType: v })}
              />
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '0 4px' }}>—</span>
            )}
          </td>
        )}
        {/* QTY */}
        <td style={{ ...tdStyle, width: 48, padding: '4px 4px' }}>
          <input
            type="text"
            inputMode="decimal"
            value={row.quantity === 1 ? '1' : formatNum(row.quantity)}
            onChange={(e) => updateRow(row.id, { quantity: parseFloat(e.target.value) || 1 })}
            style={{ ...numFieldStyle, textAlign: 'center', width: '100%', padding: '4px 2px' }}
          />
        </td>
        {/* Currency */}
        <td style={tdStyle}>
          <CurrencyCell
            value={row.currencyCode}
            onChange={(v) => updateRow(row.id, { currencyCode: v })}
          />
        </td>
        {/* Buy */}
        <td style={{ ...tdStyle, width: 80, padding: '4px 6px' }}>
          <input
            type="text"
            inputMode="decimal"
            value={formatNum(row.buyPrice)}
            placeholder="0"
            onChange={(e) => updateRow(row.id, { buyPrice: parseFloat(e.target.value) || 0 })}
            style={numFieldStyle}
          />
        </td>
        {/* Margin % */}
        <td style={{ ...tdStyle, width: 70, textAlign: 'right' }}>
          <span
            style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
              fontSize: '11px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: marginColor, background: marginBg, whiteSpace: 'nowrap',
            }}
          >
            {marginPct > 0 ? '+' : ''}{marginPct.toFixed(1)}%
          </span>
        </td>
        {/* Sell */}
        <td style={{ ...tdStyle, width: 80, padding: '4px 6px' }}>
          <input
            type="text"
            inputMode="decimal"
            value={formatNum(row.sellPrice)}
            placeholder="0.00"
            onChange={(e) => updateRow(row.id, { sellPrice: parseFloat(e.target.value) || 0 })}
            style={{ ...numFieldStyle, fontWeight: 600 }}
          />
        </td>
        {/* Delete */}
        <td style={{ ...tdStyle, width: 32, padding: '4px 2px', textAlign: 'center' }}>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => deleteRow(row.id)}
            title="Remove row"
            style={{
              width: 24, height: 24, borderRadius: '6px', border: 'none',
              background: 'transparent', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: 'var(--muted-foreground)',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted-foreground)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </td>
      </tr>
    )
  }

  function renderSectionDivider(sectionType: string, label: string) {
    const sectionStyle = SECTION_STYLE[sectionType] || SECTION_STYLE.main_freight
    const isDropTarget = dropTargetSection === sectionType && draggingRowId
    return (
      <tr
        key={`section-${sectionType}`}
        onDragOver={(e) => handleSectionDragOver(e, sectionType)}
        onDragLeave={handleSectionDragLeave}
        onDrop={(e) => handleSectionDrop(e, sectionType)}
      >
        <td
          colSpan={COL_COUNT}
          style={{
            padding: '8px 14px',
            borderLeft: `3px solid ${sectionStyle.borderLeft}`,
            borderBottom: '1px solid var(--border)',
            background: isDropTarget ? 'color-mix(in srgb, var(--primary) 8%, var(--background))' : 'var(--background)',
            outline: isDropTarget ? '2px dashed var(--primary)' : 'none',
            outlineOffset: '-2px',
            transition: 'background 0.15s, outline 0.15s',
          }}
        >
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: sectionStyle.text, textTransform: 'uppercase' }}>
            {label}
          </span>
        </td>
      </tr>
    )
  }

  function renderAddLineRow(sectionType: string) {
    return (
      <tr key={`add-${sectionType}`}>
        <td
          colSpan={COL_COUNT}
          style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}
        >
          <button
            type="button"
            onClick={() => onAddLine?.(sectionType)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', color: 'var(--muted-foreground)', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--foreground)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)' }}
          >
            + Add line
          </button>
        </td>
      </tr>
    )
  }

  // Build section-based rendering, filtered by incoterm visibility
  const visibleSectionTypes = useMemo(() => getVisibleSections(incoterm), [incoterm])
  const useSections = sections && sections.length > 0
  const sectionOrder = useSections ? sections.filter((s) => visibleSectionTypes.has(s.sectionType)) : null

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, width: 20, padding: '8px 2px' }} />
          <th style={{ ...thStyle, width: 36, textAlign: 'center', padding: '8px 6px', verticalAlign: 'middle' }}>
            <input
              type="checkbox"
              checked={allEnabled}
              ref={(el) => { if (el) el.indeterminate = someEnabled }}
              onChange={toggleAll}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--foreground)', verticalAlign: 'middle' }}
            />
          </th>
          <th style={thStyle}>Product</th>
          <th style={{ ...thStyle, width: 100 }}>Basis</th>
          {showContainerCol && <th style={{ ...thStyle, width: 76 }}>Container</th>}
          <th style={{ ...thStyle, width: 48, textAlign: 'center' }}>QTY</th>
          <th style={{ ...thStyle, width: 90 }}>Currency</th>
          <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Buy</th>
          <th style={{ ...thStyle, width: 70, textAlign: 'right' }}>Margin%</th>
          <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Sell</th>
          <th style={{ ...thStyle, width: 32, padding: '8px 4px' }} />
        </tr>
      </thead>
      <tbody>
        {sectionOrder ? (
          /* Section-based rendering */
          sectionOrder.map((section) => (
            <React.Fragment key={section.sectionType}>
              {renderSectionDivider(section.sectionType, section.label)}
              {section.rows.length > 0 ? section.rows.map(renderRow) : null}
              {renderAddLineRow(section.sectionType)}
            </React.Fragment>
          ))
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={COL_COUNT} style={{ ...tdStyle, padding: '20px 10px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              No products available
            </td>
          </tr>
        ) : (
          /* Flat rendering (legacy) */
          rows.map(renderRow)
        )}
      </tbody>
    </table>
  )
}
