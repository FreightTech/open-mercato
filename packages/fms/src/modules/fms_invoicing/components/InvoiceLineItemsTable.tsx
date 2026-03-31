'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Copy, Trash2, MoreHorizontal } from 'lucide-react'
import type { LineItemState } from '../lib/useInvoiceBuilderState'

type Props = {
  lineItems: LineItemState[]
  onUpdate: (index: number, field: keyof LineItemState, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  verticalAlign: 'middle',
  borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
  whiteSpace: 'nowrap',
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

const textFieldStyle: React.CSSProperties = {
  ...numFieldStyle,
  textAlign: 'left',
}

const readOnlyNumStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--muted-foreground)',
  fontSize: '13px',
  padding: '6px 10px',
}

function RowMenu({ onDuplicate, onRemove }: { onDuplicate: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const [triggerHovered, setTriggerHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        onMouseEnter={() => setTriggerHovered(true)}
        onMouseLeave={() => setTriggerHovered(false)}
        style={{
          width: 26, height: 26, borderRadius: '6px',
          border: 'none', cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          background: triggerHovered || open ? 'var(--accent)' : 'transparent',
          color: triggerHovered || open ? 'var(--foreground)' : 'var(--muted-foreground)',
          transition: 'background 0.1s, color 0.1s',
        }}
      >
        <MoreHorizontal style={{ width: 15, height: 15 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 50,
          background: 'var(--popover)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          overflow: 'hidden', minWidth: '140px',
        }}>
          <MenuAction icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); setOpen(false) }} />
          <MenuAction icon={Trash2} label="Delete" onClick={() => { onRemove(); setOpen(false) }} destructive />
        </div>
      )}
    </div>
  )
}

function MenuAction({ icon: Icon, label, onClick, destructive }: {
  icon: React.FC<{ style?: React.CSSProperties }>
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 12px', fontSize: '13px', border: 'none', cursor: 'pointer',
        background: hovered ? (destructive ? 'rgba(220, 38, 38, 0.08)' : 'var(--accent)') : 'transparent',
        color: destructive ? '#dc2626' : 'var(--popover-foreground)',
        transition: 'background 0.1s',
      }}
    >
      <Icon style={{ width: 14, height: 14, opacity: 0.7 }} />
      {label}
    </button>
  )
}

function formatNum(val: string): string {
  const num = parseFloat(val)
  if (isNaN(num)) return val
  const formatted = num.toFixed(2)
  return formatted.replace(/\.?0+$/, '') || '0'
}

export function InvoiceLineItemsTable({ lineItems, onUpdate, onAdd, onRemove }: Props) {
  return (
    <div>
      <div style={{ overflow: 'visible' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 30, textAlign: 'center' }}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', width: '30%' }}>Description</th>
              <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>Unit</th>
              <th style={{ ...thStyle, width: 55, textAlign: 'right' }}>Qty</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Price</th>
              <th style={{ ...thStyle, width: 50, textAlign: 'right' }}>VAT</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>Net</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>VAT Amt</th>
              <th style={{ ...thStyle, width: 90, textAlign: 'right', fontWeight: 700 }}>Gross</th>
              <th style={{ ...thStyle, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => (
              <tr key={idx}>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px', fontWeight: 500 }}>
                  {li.lineNumber}
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={li.description}
                    onChange={e => onUpdate(idx, 'description', e.target.value)}
                    style={textFieldStyle}
                    placeholder="Item description..."
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={li.unit}
                    onChange={e => onUpdate(idx, 'unit', e.target.value)}
                    style={{ ...textFieldStyle, textAlign: 'center' }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={li.quantity}
                    onChange={e => onUpdate(idx, 'quantity', e.target.value)}
                    style={numFieldStyle}
                    placeholder="0"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={li.unitPriceNet}
                    onChange={e => onUpdate(idx, 'unitPriceNet', e.target.value)}
                    style={numFieldStyle}
                    placeholder="0.00"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={li.vatRate}
                    onChange={e => {
                      onUpdate(idx, 'vatRate', e.target.value)
                      onUpdate(idx, 'vatRateCode', e.target.value)
                    }}
                    style={numFieldStyle}
                    placeholder="23"
                  />
                </td>
                <td style={readOnlyNumStyle}>{formatNum(li.netAmount)}</td>
                <td style={readOnlyNumStyle}>{formatNum(li.vatAmount)}</td>
                <td style={{ ...readOnlyNumStyle, fontWeight: 700, color: 'var(--foreground)' }}>
                  {formatNum(li.grossAmount)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <RowMenu onDuplicate={() => {/* TODO: duplicate */}} onRemove={() => onRemove(idx)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 10px 0' }}>
        <button
          type="button"
          onClick={onAdd}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: 'var(--muted-foreground)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Add line
        </button>
      </div>
    </div>
  )
}
